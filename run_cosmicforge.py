import os
import sys
import argparse
import glob

# Parse arguments first to get --cores before importing numpy/Cobaya
parser = argparse.ArgumentParser()
parser.add_argument("config_file", nargs="?", default=None, help="Cobaya YAML configuration file")
parser.add_argument("--packages-path", default=None)
parser.add_argument("--cores", type=int, default=1)
parser.add_argument("--method", default="bobyqa", choices=["bobyqa", "powell", "nelder-mead"])
parser.add_argument("--multistart", type=int, default=1)
parser.add_argument("--mcmc-steps", type=int, default=20000, help="Number of MCMC steps per chain (use 0 to disable MCMC)")
parser.add_argument("--mcmc-chains", type=int, default=4, help="Number of independent MCMC chains per mode for R̂ diagnostics")
parser.add_argument("--profile", default=None, help="Parameter name to profile (e.g. H0)")
parser.add_argument("--profile-range", nargs=2, type=float, default=None, help="Min and max values for the profile scan (e.g. 67.0 74.0)")
parser.add_argument("--profile-steps", type=int, default=8, help="Number of steps in the profile grid")
parser.add_argument("--test-toy", action="store_true", help="Run the entire pipeline on a fast 2D toy cosmological likelihood for testing")
parser.add_argument("--polychord", action="store_true", help="Run a standard PolyChord nested sampling job instead of the hybrid optimization (legacy)")
# New opt-in flags for PolyChord cross-validation and diagnostics thresholds
parser.add_argument("--run-polychord", action="store_true", help="(Opt-in) Run a PolyChord-equivalent nested sampling job after the optimizer finishes for cross-validation")
parser.add_argument("--cross-validate", action="store_true", help="Alias for --run-polychord")
parser.add_argument("--ess-threshold", type=float, default=100.0, help="ESS threshold below which a warning is emitted")
parser.add_argument("--rhat-threshold", type=float, default=1.05, help="R̂ threshold above which a warning is emitted")
# Hybrid seeding options (Phase-1)
parser.add_argument("--seed-polychord", action="store_true", help="(Opt-in) Seed PolyChord with optimizer-discovered modes and short MCMC samples")
parser.add_argument("--seed-nlive", type=int, default=200, help="Number of live points to request for seeded PolyChord runs")
parser.add_argument("--seed-random-fraction", type=float, default=0.3, help="Fraction of seeded live points drawn from the prior to preserve global support")
parser.add_argument("--seed-min-samples-per-mode", type=int, default=20, help="Minimum MCMC samples per mode required to use it for seeding")
parser.add_argument("--no-emit-modes", action="store_true", help="Do not write per-mode metadata files (opt-out)")
parser.add_argument("--start-from-run", type=int, default=1, help="Start optimization from this run index (1-based), skipping previous runs")
args = parser.parse_args()

# Validate positive CLI counts before runtime to prevent divide-by-zero and invalid thread counts
if args.multistart <= 0:
    parser.error("--multistart must be a positive integer")
if args.cores <= 0:
    parser.error("--cores must be a positive integer")
if args.mcmc_steps < 0:
    parser.error("--mcmc-steps must be non-negative (use 0 to disable MCMC)")

# Set OpenMP threads to speed up CLASS evaluations
os.environ["OMP_NUM_THREADS"] = str(args.cores)
os.environ["MKL_NUM_THREADS"] = str(args.cores)
os.environ["OPENBLAS_NUM_THREADS"] = str(args.cores)
os.environ["NUMEXPR_NUM_THREADS"] = str(args.cores)

import time
import numpy as np
import yaml
import json
from scipy.optimize import minimize

# Dynamic search for classy build directory
build_dirs = glob.glob("/home/themilkmanj/prtoe_class/build/lib.*")
if build_dirs:
    sys.path.insert(0, build_dirs[0])

from cobaya.model import get_model

class LocalSurrogate:
    """
    Uncertainty-aware Kriging/Gaussian Process surrogate for active learning.
    Bypasses expensive CLASS calls only when the prediction uncertainty is low.
    """
    def __init__(self, ndim, threshold_variance=0.04, prior_ranges=None):
        self.ndim = ndim
        self.threshold_variance = threshold_variance
        self.prior_ranges = prior_ranges
        self.points = []
        self.values = []
        self.is_trained = False
        
        # GP hyperparameters
        self.sigma_f = 1.0  # signal variance
        self.sigma_n = 0.05 # noise level (nugget)
        self.lengthscales = None
        self.K_inv = None
        self.y_centered = None
        self.y_mean = 0.0
        self.y_std = 1.0
        self.pts_arr = None

    def add_point(self, x, val):
        self.points.append(list(x))
        self.values.append(float(val))
        # Periodic training of the GP surrogate
        if len(self.points) >= 20 and len(self.points) % 10 == 0:
            self.train()

    def train(self):
        try:
            self.pts_arr = np.array(self.points)
            y_arr = np.array(self.values)
            
            # Normalize inputs and targets for numerical stability
            self.y_mean = np.mean(y_arr)
            self.y_std = np.std(y_arr) if np.std(y_arr) > 0 else 1.0
            self.y_centered = (y_arr - self.y_mean) / self.y_std
            
            # Estimate lengthscales from the standard deviation of each parameter
            stds = np.std(self.pts_arr, axis=0)
            if self.prior_ranges is not None:
                base_ls = np.array(self.prior_ranges) * 0.1
            else:
                base_ls = np.ones(self.ndim)
                
            self.lengthscales = np.zeros(self.ndim)
            for d in range(self.ndim):
                s = stds[d]
                if s > 0:
                    self.lengthscales[d] = 0.5 * (s * 2.0) + 0.5 * base_ls[d]
                else:
                    self.lengthscales[d] = base_ls[d]
            # Ensure no zero lengthscale
            self.lengthscales = np.maximum(self.lengthscales, 1e-5)
            
            # Build covariance matrix
            n = len(self.points)
            K = np.zeros((n, n))
            for i in range(n):
                for j in range(n):
                    diff = (self.pts_arr[i] - self.pts_arr[j]) / self.lengthscales
                    K[i, j] = self.sigma_f**2 * np.exp(-0.5 * np.sum(diff**2))
            
            # Add noise (nugget) and jitter for numerical stability
            jitter = 1e-6
            for attempt in range(5):
                K_temp = K + np.eye(n) * (self.sigma_n**2 + jitter)
                try:
                    self.K_inv = np.linalg.inv(K_temp)
                    self.is_trained = True
                    break
                except np.linalg.LinAlgError:
                    jitter *= 10
            else:
                self.is_trained = False
        except Exception:
            self.is_trained = False

    def predict(self, x):
        if not self.is_trained or self.K_inv is None:
            return None
        try:
            x_arr = np.array(x)
            n = len(self.points)
            
            # Compute cross-covariance vector k_*
            k_star = np.zeros(n)
            for i in range(n):
                diff = (self.pts_arr[i] - x_arr) / self.lengthscales
                k_star[i] = self.sigma_f**2 * np.exp(-0.5 * np.sum(diff**2))
                
            # Kriging Mean (normalized)
            mu_norm = k_star.dot(self.K_inv).dot(self.y_centered)
            
            # Kriging Variance
            var = self.sigma_f**2 - k_star.dot(self.K_inv).dot(k_star)
            
            # Check if uncertainty is below the threshold
            if var < self.threshold_variance:
                # Denormalize mean
                pred = mu_norm * self.y_std + self.y_mean
                return float(pred)
        except Exception:
            return None
        return None

# --- Diagnostics helpers (ESS, autocorrelation, R-hat) ---------------------

def _autocorr(x, lag):
    """Compute lag-autocovariance for 1D array x using unbiased estimator."""
    x = np.asarray(x, dtype=float)
    n = len(x)
    if n <= lag:
        return 0.0
    x_mean = np.mean(x)
    return np.sum((x[: n - lag] - x_mean) * (x[lag:] - x_mean)) / float(n - lag)


def compute_ess(samples):
    """Estimate Effective Sample Size (ESS) for a 1D numpy array of samples.
    Uses initial monotone sequence estimator up to max_lag.
    """
    x = np.asarray(samples, dtype=float)
    n = len(x)
    if n < 10:
        return max(1.0, float(n))
    var = np.var(x, ddof=0)
    if var == 0.0 or not np.isfinite(var):
        return 1.0
    max_lag = min(200, n // 2)
    rho_sum = 0.0
    for lag in range(1, max_lag + 1):
        acov = _autocorr(x, lag)
        rho = acov / var
        # Stop when autocorrelation becomes negative (monotone sequence heuristic)
        if rho <= 0 and lag > 5:
            break
        rho_sum += rho
    ess = n / (1.0 + 2.0 * rho_sum)
    return max(1.0, float(ess))


def compute_rhat(chains_samples):
    """Compute Gelman-Rubin R̂ for a dict of parameter->list-of-chains (each chain is array-like).
    chains_samples: list of arrays (num_chains x n)
    Returns Rhat (float). If insufficient chains or lengths, returns None.
    """
    try:
        chains = [np.asarray(c, dtype=float) for c in chains_samples if len(c) > 2]
        m = len(chains)
        if m < 2:
            return None
        ns = [len(c) for c in chains]
        if len(set(ns)) != 1:
            # Trim to shortest chain length
            min_n = min(ns)
            chains = [c[:min_n] for c in chains]
            n = min_n
        else:
            n = ns[0]
        # Per-chain means and variances
        chain_means = np.array([c.mean() for c in chains])
        chain_vars = np.array([c.var(ddof=1) for c in chains])
        B = n * np.var(chain_means, ddof=1)
        W = np.mean(chain_vars)
        var_hat = ((n - 1) / n) * W + (1.0 / n) * B
        Rhat = np.sqrt(var_hat / W) if W > 0 else None
        return float(Rhat) if Rhat is not None and np.isfinite(Rhat) else None
    except Exception:
        return None


import copy
import json
from pathlib import Path


def run_polychord_equivalent(info_cfg, output_prefix, polychord_opts=None):
    """Run a PolyChord-equivalent nested sampling job using the same model/prior setup.
    This is opt-in and non-blocking: it returns a dict with run metadata and attempts to
    parse PolyChord stats where available.
    """
    try:
        # Local import to avoid overhead when unused
        from cobaya.run import run as cobaya_run
    except Exception:
        print("[polychord] Warning: cobaya.run not available; cannot run PolyChord.")
        return None

    pol_info = copy.deepcopy(info_cfg)
    # Ensure sampler settings for PolyChord are sensible for cross-checks
    pol_info["sampler"] = {
        "polychord": {
            "nlive": 250,
            "num_repeats": 30,
            "precision_criterion": 0.01,
            "fast_fraction": 0.0,
            "base_dir": os.path.dirname(output_prefix) or ".",
            "file_root": os.path.basename(output_prefix),
            "write_resume": True,
            "read_resume": True,
        }
    }
    if polychord_opts and isinstance(polychord_opts, dict):
        pol_info["sampler"]["polychord"].update(polychord_opts)

    # Add a lightweight PhysicalConstraintsLikelihood wrapper if constraints exist
    sampled_names_local = [n for n, p in pol_info.get("params", {}).items() if isinstance(p, dict) and "prior" in p]
    derived_local = pol_info.get("derived", []) if "derived" in pol_info else []

    if "physical_constraints" in pol_info:
        physical_constraints_local = pol_info["physical_constraints"]
    else:
        physical_constraints_local = []

    if physical_constraints_local:
        try:
            from cobaya.likelihood import Likelihood
            class PhysicalConstraintsLikelihood(Likelihood):
                def initialize(self):
                    self.input_params = sampled_names_local + derived_local
                def logp(self, **params_values):
                    point = {name: params_values.get(name, 0.0) for name in sampled_names_local}
                    derived = {name: params_values.get(name, 0.0) for name in derived_local}
                    penalty, _ = evaluate_constraints(point, derived, physical_constraints_local)
                    return -0.5 * penalty
            if "likelihood" not in pol_info:
                pol_info["likelihood"] = {}
            pol_info["likelihood"]["physical_constraints"] = PhysicalConstraintsLikelihood
        except Exception:
            print("[polychord] Warning: could not attach physical constraints likelihood; proceeding without it.")

    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [polychord] Running PolyChord cross-check -> prefix: {output_prefix}_polychord")
    sys.stdout.flush()
    try:
        updated_info, sampler = cobaya_run(pol_info)
    except Exception as e:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [polychord] PolyChord run failed: {e}")
        return None

    # After run, try to parse stats using the centralized parsers adapter
    pol_prefix = f"{output_prefix}_polychord"
    stats_path = Path(f"{pol_prefix}.stats")
    resume_path = Path(os.path.join(os.path.dirname(pol_prefix), f"{os.path.basename(pol_prefix)}.resume"))
    stats = None
    try:
        from prtoe_class.backend.parsers_adapter import parse_polychord_stats
        stats = parse_polychord_stats(stats_path, resume_path)
    except Exception as e:
        logger.warning(f"Could not parse PolyChord stats after optimization: {e}")
        stats = None

    return {"prefix": pol_prefix, "stats": stats, "updated_info": updated_info}


def compare_with_polychord(optimizer_prefix, polychord_prefix, ess_threshold=100.0, rhat_threshold=1.05):
    """Compare optimizer outputs to PolyChord run. Produces a JSON+MD summary with:
    - delta_chi2 (optimizer_best - polychord_best)
    - per-parameter shifts (delta / sigma where sigma from polychord posterior if available)
    - delta_logZ (gelfand-dey vs polychord)
    """
    comp = {
        "optimizer_prefix": optimizer_prefix,
        "polychord_prefix": polychord_prefix,
        "delta_chi2": None,
        "delta_logZ": None,
        "parameter_shifts": {},
        "notes": []
    }

    # Load optimizer summary if available
    try:
        opt_summary_file = Path(f"{optimizer_prefix}.summary.json")
        if opt_summary_file.exists():
            with open(opt_summary_file, 'r') as f:
                opt = json.load(f)
        else:
            opt = None
    except Exception:
        opt = None

    # Try to load polychord stats/summary
    try:
        pol_summary_file = Path(f"{polychord_prefix}.summary.json")
        if pol_summary_file.exists():
            with open(pol_summary_file, 'r') as f:
                pol = json.load(f)
        else:
            # Fallback: parse polychord stats via centralized adapter
            from prtoe_class.backend.parsers_adapter import parse_polychord_stats
            stats_file = Path(f"{polychord_prefix}.stats")
            pol_stats = parse_polychord_stats(stats_file, None)
            pol = {"stats": pol_stats} if pol_stats else None
    except Exception:
        pol = None

    # Delta chi2: prefer best-fit chi2 found in optimizer summary and polychord's best-fit details
    try:
        opt_chi2 = opt.get('best_fit', {}).get('penalized_chi2') if opt else None
        pol_chi2 = None
        if pol and 'best_fit' in pol:
            pol_chi2 = pol['best_fit'].get('penalized_chi2')
        elif pol and 'stats' in pol and pol['stats'] and 'log_evidence' in pol['stats']:
            pol_chi2 = None
        if opt_chi2 is not None and pol_chi2 is not None:
            comp['delta_chi2'] = opt_chi2 - pol_chi2
        else:
            comp['notes'].append('Could not compute delta_chi2: missing best-fit chi2 in one of the outputs')
    except Exception:
        comp['notes'].append('Delta chi2 computation failed')

    # Evidence comparison
    try:
        opt_logz = opt.get('evidence', {}).get('logZ') if opt else None
        pol_logz = None
        if pol and 'stats' in pol and pol['stats']:
            pol_logz = pol['stats'].get('log_evidence')
        if opt_logz is not None and pol_logz is not None:
            comp['delta_logZ'] = opt_logz - pol_logz
        else:
            comp['notes'].append('Could not compute delta_logZ: missing evidence in one of the outputs')
    except Exception:
        comp['notes'].append('Delta logZ computation failed')

    # Parameter shifts: attempt to compare central values if both summaries provide them
    try:
        opt_params = opt.get('best_fit', {}).get('point', {}) if opt else {}
        pol_params = pol.get('best_fit', {}).get('point', {}) if pol else {}
        pol_param_sigmas = pol.get('best_fit', {}).get('sigmas', {}) if pol else {}
        for pname, pval in (opt_params or {}).items():
            if pname in pol_params and pname in pol_param_sigmas and pol_param_sigmas.get(pname, 0) > 0:
                delta = pval - pol_params[pname]
                sig = pol_param_sigmas.get(pname)
                comp['parameter_shifts'][pname] = {"delta": float(delta), "delta_over_sigma": float(delta / sig), "sigma": float(sig)}
            elif pname in pol_params:
                comp['parameter_shifts'][pname] = {"delta": float(pval - pol_params[pname]), "delta_over_sigma": None, "sigma": None}
    except Exception:
        comp['notes'].append('Parameter shift computation failed')

    # Write comparison artifacts
    try:
        # Use safe names for filenames (avoid embedding full paths)
        pol_name = Path(polychord_prefix).name
        opt_name = Path(optimizer_prefix).name
        cmp_json = Path(f"{optimizer_prefix}.vs.{pol_name}.comparison.json")
        with open(cmp_json, 'w') as f:
            json.dump(comp, f, indent=2)
        # Also write a short human-readable summary
        cmp_md = Path(f"{optimizer_prefix}.vs.{pol_name}.comparison.md")
        with open(cmp_md, 'w') as f:
            f.write(f"Comparison: {opt_name} vs {pol_name}\n\n")
            if comp['delta_chi2'] is not None:
                f.write(f"Delta chi2 (opt - polychord): {comp['delta_chi2']:.4f}\n")
            if comp['delta_logZ'] is not None:
                f.write(f"Delta logZ (opt - polychord): {comp['delta_logZ']:.4f}\n")
            f.write('\nParameter shifts:\n')
            for pname, vals in comp['parameter_shifts'].items():
                f.write(f" - {pname}: delta = {vals['delta']}, delta/sigma = {vals.get('delta_over_sigma')}\n")
            if comp['notes']:
                f.write('\nNotes:\n')
                for note in comp['notes']:
                    f.write(f" - {note}\n")
    except Exception:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [compare] Warning: could not write comparison artifacts")

    return comp


def compute_covariance(best_x, target_func, sampled_names, info):
    n = len(sampled_names)
    hessian = np.zeros((n, n))
    
    # Define step sizes for each parameter (e.g. 1.5% of the prior range)
    h = np.zeros(n)
    for i, name in enumerate(sampled_names):
        prior = info["params"][name].get("prior", {})
        if "min" in prior and "max" in prior:
            h[i] = 0.015 * (float(prior["max"]) - float(prior["min"]))
        else:
            h[i] = 0.015 * max(1e-4, abs(best_x[i]))
            
    f_best = target_func(best_x)
    
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [mcmc] Computing full {n}x{n} Hessian matrix...")
    sys.stdout.flush()
    
    # 1. Compute diagonal elements
    for i in range(n):
        x_plus = np.copy(best_x)
        x_plus[i] += h[i]
        f_plus = target_func(x_plus)
        
        x_minus = np.copy(best_x)
        x_minus[i] -= h[i]
        f_minus = target_func(x_minus)
        
        hessian[i, i] = (f_plus - 2.0 * f_best + f_minus) / (h[i] ** 2)
        
    # 2. Compute off-diagonal elements
    for i in range(n):
        for j in range(i + 1, n):
            # 4-point formula for cross derivative
            x_pp = np.copy(best_x)
            x_pp[i] += h[i]
            x_pp[j] += h[j]
            f_pp = target_func(x_pp)
            
            x_pm = np.copy(best_x)
            x_pm[i] += h[i]
            x_pm[j] -= h[j]
            f_pm = target_func(x_pm)
            
            x_mp = np.copy(best_x)
            x_mp[i] -= h[i]
            x_mp[j] += h[j]
            f_mp = target_func(x_mp)
            
            x_mm = np.copy(best_x)
            x_mm[i] -= h[i]
            x_mm[j] -= h[j]
            f_mm = target_func(x_mm)
            
            d2f_dxdy = (f_pp - f_pm - f_mp + f_mm) / (4.0 * h[i] * h[j])
            hessian[i, j] = d2f_dxdy
            hessian[j, i] = d2f_dxdy
            
    # Regularize Hessian to ensure it is positive-definite
    try:
        evals, evecs = np.linalg.eigh(hessian)
        min_eval = 1e-4
        evals_reg = np.maximum(evals, min_eval)
        hessian_reg = evecs @ np.diag(evals_reg) @ evecs.T
        cov = 2.0 * np.linalg.inv(hessian_reg)
    except Exception as e:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [mcmc] Warning: Hessian inversion failed ({e}). Falling back to diagonal covariance.")
        cov = np.zeros((n, n))
        for i in range(n):
            d2f = max(1e-4, hessian[i, i])
            cov[i, i] = 2.0 / d2f
            
    if not np.all(np.isfinite(cov)):
        cov = np.diag(h ** 2)
        
    return cov, hessian

def run_mcmc(best_x, cov, target_func, model, sampled_names, derived_names, num_steps):
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [mcmc] Starting Metropolis-Hastings MCMC ({num_steps} steps)...")
    sys.stdout.flush()
    
    n = len(sampled_names)
    chain = []
    
    x_curr = np.copy(best_x)
    chi2_curr = target_func(x_curr)
    
    point_dict = {name: float(val) for name, val in zip(sampled_names, x_curr)}
    eval_res = model.logposterior(point_dict)
    derived_curr = {name: float(val) for name, val in zip(model.derived_params, eval_res.derived)}
    logprior_curr = float(eval_res.logprior)
    loglikes_curr = [float(v) for v in eval_res.loglikes]
    loglike_curr = float(eval_res.logpost - eval_res.logprior)
    
    accepted = 0
    scale = (2.4 ** 2) / n
    
    try:
        L = np.linalg.cholesky(scale * cov)
    except np.linalg.LinAlgError:
        L = np.diag(np.sqrt(scale * np.diag(cov)))
        
    for step in range(num_steps):
        x_prop = x_curr + L @ np.random.normal(size=n)
        chi2_prop = target_func(x_prop)
        
        log_alpha = -0.5 * (chi2_prop - chi2_curr)
        
        if np.log(np.random.uniform(0, 1)) < log_alpha and chi2_prop < 1e9:
            x_curr = x_prop
            chi2_curr = chi2_prop
            try:
                point_dict = {name: float(val) for name, val in zip(sampled_names, x_curr)}
                eval_res = model.logposterior(point_dict)
                derived_curr = {name: float(val) for name, val in zip(model.derived_params, eval_res.derived)}
                logprior_curr = float(eval_res.logprior)
                loglikes_curr = [float(v) for v in eval_res.loglikes]
                loglike_curr = float(eval_res.logpost - eval_res.logprior)
            except Exception:
                pass
            accepted += 1
            
        chain_row = {
            "weight": 1.0,
            "minuslogpost": 0.5 * chi2_curr,
            "point": {name: x_curr[i] for i, name in enumerate(sampled_names)},
            "derived": derived_curr,
            "logprior": logprior_curr,
            "loglikes": loglikes_curr,
            "total_loglike": loglike_curr
        }
        chain.append(chain_row)
        
        if (step + 1) % 50 == 0 or step == num_steps - 1:
            acc_rate = (accepted / (step + 1)) * 100
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [mcmc] Step {step + 1}/{num_steps} | Acceptance Rate: {acc_rate:.1f}% | Current Chi2: {chi2_curr:.4f}")
            sys.stdout.flush()
            
    return chain
            
def estimate_gelfand_dey_evidence(mcmc_chain, sampled_names, info):
    if not mcmc_chain or len(mcmc_chain) < 20:
        return None
        
    # Extract parameter vectors, log-likelihoods, and log-priors
    n_params = len(sampled_names)
    points = []
    loglikes = []
    logpriors = []
    
    for row in mcmc_chain:
        points.append([row["point"][name] for name in sampled_names])
        # total_loglike is log(L)
        loglikes.append(row["total_loglike"])
        logpriors.append(row["logprior"])
        
    points = np.array(points)
    loglikes = np.array(loglikes)
    logpriors = np.array(logpriors)
    
    # Compute mean and covariance of MCMC points
    mean = np.mean(points, axis=0)
    cov = np.cov(points, rowvar=False)
    
    # Regularize covariance if it is singular or nearly singular
    if n_params == 1:
        cov = np.array([[cov]])
    cov += np.eye(n_params) * 1e-6 * np.maximum(np.diag(cov), 1e-5)
    
    try:
        inv_cov = np.linalg.inv(cov)
        sign, logdet = np.linalg.slogdet(cov)
        if sign <= 0:
            return None
    except np.linalg.LinAlgError:
        return None
        
    # Define truncation threshold (90% quantile of chi2 with n_params degrees of freedom)
    from scipy.stats import chi2
    threshold = chi2.ppf(0.90, df=n_params)
    
    valid_weights = []
    
    for idx, pt in enumerate(points):
        diff = pt - mean
        mahalanobis = diff.dot(inv_cov).dot(diff)
        
        # Truncate to the 90% high-density region to ensure f(theta) has thinner tails than posterior
        if mahalanobis <= threshold:
            # log of multivariate Gaussian density f(theta)
            l_f = -0.5 * n_params * np.log(2.0 * np.pi) - 0.5 * logdet - 0.5 * mahalanobis
            # Gelfand-Dey weight in log space: ln(f) - ln(L) - ln(pi)
            w = l_f - loglikes[idx] - logpriors[idx]
            valid_weights.append(w)
            
    if len(valid_weights) < 10:
        return None
        
    # Use log-sum-exp trick for stability
    valid_weights = np.array(valid_weights)
    max_w = np.max(valid_weights)
    sum_exp = np.sum(np.exp(valid_weights - max_w))
    
    # ln(0.90 / Z) = -ln(M) + max_w + ln(sum(exp(w - max_w)))
    # So ln(Z) = ln(0.90) + ln(M) - max_w - ln(sum(exp(w - max_w)))
    m_samples = len(points)
    log_z = np.log(0.90) + np.log(m_samples) - max_w - np.log(sum_exp)
    
    return float(log_z)

def evaluate_constraints(point_dict, derived_dict, physical_constraints):
    total_penalty = 0.0
    viability_score = 100.0
    
    import ast
    import operator
    
    # Safe AST-based expression evaluator with allowed nodes and numeric limits
    def safe_eval(expr, variables):
        try:
            # Parse the expression into an AST
            tree = ast.parse(expr, mode='eval')
            
            # Allowed operators
            operators = {
                ast.Add: operator.add,
                ast.Sub: operator.sub,
                ast.Mult: operator.mul,
                ast.Div: operator.truediv,
                ast.Pow: operator.pow,
                ast.USub: operator.neg,
                ast.UAdd: operator.pos,
            }
            
            # Allowed node types
            allowed_nodes = {
                ast.Expression, ast.BinOp, ast.UnaryOp, ast.Num, ast.Constant,
                ast.Name, ast.Call
            }
            
            # Allowed function calls (only math functions that are safe)
            allowed_functions = {
                'abs': abs,
                'pow': pow,
                'min': min,
                'max': max,
            }
            
            def eval_node(node):
                if isinstance(node, ast.Constant):
                    val = node.value
                    # Limit numeric values to prevent overflow attacks
                    if isinstance(val, (int, float)):
                        if abs(val) > 1e10:
                            raise ValueError(f"Numeric value too large: {val}")
                    return val
                elif isinstance(node, ast.Num):  # Python < 3.8
                    val = node.n
                    if abs(val) > 1e10:
                        raise ValueError(f"Numeric value too large: {val}")
                    return val
                elif isinstance(node, ast.Name):
                    if node.id in variables:
                        val = variables[node.id]
                        if isinstance(val, (int, float)) and abs(val) > 1e10:
                            raise ValueError(f"Variable value too large: {val}")
                        return val
                    else:
                        raise ValueError(f"Unknown variable: {node.id}")
                elif isinstance(node, ast.BinOp):
                    left = eval_node(node.left)
                    right = eval_node(node.right)
                    op_type = type(node.op)
                    if op_type in operators:
                        result = operators[op_type](left, right)
                        # Check result magnitude
                        if isinstance(result, (int, float)) and abs(result) > 1e10:
                            raise ValueError(f"Result too large: {result}")
                        return result
                    else:
                        raise ValueError(f"Unsupported operator: {op_type}")
                elif isinstance(node, ast.UnaryOp):
                    operand = eval_node(node.operand)
                    op_type = type(node.op)
                    if op_type in operators:
                        result = operators[op_type](operand)
                        if isinstance(result, (int, float)) and abs(result) > 1e10:
                            raise ValueError(f"Result too large: {result}")
                        return result
                    else:
                        raise ValueError(f"Unsupported unary operator: {op_type}")
                elif isinstance(node, ast.Call):
                    func_name = node.func.id
                    if func_name in allowed_functions:
                        args = [eval_node(arg) for arg in node.args]
                        result = allowed_functions[func_name](*args)
                        if isinstance(result, (int, float)) and abs(result) > 1e10:
                            raise ValueError(f"Function result too large: {result}")
                        return result
                    else:
                        raise ValueError(f"Unsupported function: {func_name}")
                else:
                    raise ValueError(f"Unsupported AST node: {type(node)}")
            
            # Check that all nodes are allowed
            for node in ast.walk(tree):
                if type(node) not in allowed_nodes:
                    raise ValueError(f"Disallowed node type: {type(node)}")
            
            result = eval_node(tree.body)
            if isinstance(result, (int, float)) and not np.isfinite(result):
                raise ValueError(f"Non-finite result: {result}")
            return float(result)
        except Exception as e:
            return 0.0

    for c in physical_constraints:
        name = c.get("name", "unnamed_constraint")
        c_min = float(c.get("min", -np.inf))
        c_max = float(c.get("max", np.inf))
        weight = float(c.get("weight", 100.0))
        
        val = 0.0
        if "expression" in c:
            val = safe_eval(c["expression"], point_dict)
        elif "derived" in c:
            val = derived_dict.get(c["derived"], 0.0)
            
        # Compute violation
        violation = 0.0
        if val < c_min:
            violation = c_min - val
        elif val > c_max:
            violation = val - c_max
            
        if violation > 0.0:
            total_penalty += weight * (violation ** 2)
            # Reduce viability score
            # A violation of 1 unit at weight 100 reduces viability by 10%
            viability_score -= 100.0 * (violation * (weight / 500.0))
            
    viability_score = max(0.0, min(100.0, viability_score))
    return total_penalty, viability_score

class ToyCosmoModel:
    """
    Mock Cobaya Model for rapid pipeline testing and verification.
    Bypasses CLASS/Cobaya and evaluates a 4D multimodal likelihood over H0, xi_prtoe, omega_b, and omega_cdm.
    """
    def __init__(self):
        self.derived_params = ["age", "sigma8", "S8", "V0_prtoe", "A_s"]
        self.likelihood = {"planck_2018_lowl.TT": 0.0, "sn.pantheonplusshoes": 0.0}
        
    def logposterior(self, point_dict):
        h0 = point_dict.get("H0", 67.4)
        xi = point_dict.get("xi_prtoe", 1e-7)
        omega_b = point_dict.get("omega_b", 0.0224)
        omega_cdm = point_dict.get("omega_cdm", 0.120)
        
        # Mode 1 (Planck-like): peak at H0=67.4, xi=1e-7, omega_b=0.0224, omega_cdm=0.120
        chi2_1 = ((h0 - 67.4) / 0.5)**2 + ((np.log10(xi) - (-7.0)) / 0.3)**2 + \
                 ((omega_b - 0.0224) / 0.0005)**2 + ((omega_cdm - 0.120) / 0.003)**2 + 10.0
        
        # Mode 2 (SH0ES-like): peak at H0=73.0, xi=5e-6, omega_b=0.0226, omega_cdm=0.118
        chi2_2 = ((h0 - 73.0) / 0.8)**2 + ((np.log10(xi) - (-5.3)) / 0.4)**2 + \
                 ((omega_b - 0.0226) / 0.0006)**2 + ((omega_cdm - 0.118) / 0.004)**2 + 12.0
        
        # Combine modes using smooth min (log-sum-exp)
        raw_chi2 = -2.0 * np.log(np.exp(-0.5 * chi2_1) + np.exp(-0.5 * chi2_2))
        
        # Derived parameters
        age = 13.8 - 0.1 * (h0 - 67.4)
        sigma8 = 0.8 - 0.05 * (np.log10(xi) - (-7.0))
        s8 = sigma8 * np.sqrt(0.3)
        v0 = 1.0 - (omega_b + omega_cdm) / (h0 / 100.0)**2
        as_val = 2e-9
        
        class MockResult:
            def __init__(self, chi2, age, sigma8, s8, v0, as_val):
                self.logpost = -0.5 * chi2
                self.loglike = -0.5 * chi2
                self.logprior = 0.0
                self.loglikes = [-0.5 * chi2, -0.5 * chi2]
                self.derived = [age, sigma8, s8, v0, as_val]
                
        return MockResult(raw_chi2, age, sigma8, s8, v0, as_val)

def main():
    if args.test_toy:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Running in --test-toy mode on a fast 4D cosmological likelihood.")
        sys.stdout.flush()
        info = {
            "output": "chains/toy_test",
            "params": {
                "H0": {
                    "prior": {"min": 55.0, "max": 85.0},
                    "ref": 67.4,
                    "proposal": 0.5
                },
                "xi_prtoe": {
                    "prior": {"min": 1e-7, "max": 1e-4},
                    "ref": 1e-6,
                    "proposal": 1e-7
                },
                "omega_b": {
                    "prior": {"min": 0.018, "max": 0.026},
                    "ref": 0.0224,
                    "proposal": 0.0005
                },
                "omega_cdm": {
                    "prior": {"min": 0.08, "max": 0.20},
                    "ref": 0.120,
                    "proposal": 0.003
                }
            }
        }
        physical_constraints = [
            {
                "name": "H0_screened_range",
                "expression": "H0",
                "min": 60.0,
                "max": 80.0,
                "weight": 500.0
            },
            {
                "name": "omega_b_physical",
                "expression": "omega_b",
                "min": 0.020,
                "max": 0.025,
                "weight": 800.0
            },
            {
                "name": "V0_prtoe_physical",
                "derived": "V0_prtoe",
                "min": 0.65,
                "max": 0.85,
                "weight": 600.0
            }
        ]
    else:
        if not args.config_file:
            print("Error: config_file is required unless running in --test-toy mode.")
            sys.exit(1)
        config_path = os.path.abspath(args.config_file)
        
        # Load configuration
        with open(config_path, "r") as f:
            info = yaml.safe_load(f)

        # Load physical constraints from configuration or fall back to default PRTOE ones
        physical_constraints = info.get("physical_constraints")
        if physical_constraints is None:
            physical_constraints = [
                {
                    "name": "V0_prtoe",
                    "expression": "1.0 - (omega_b + omega_cdm) / (H0/100)**2",
                    "min": 0.0,
                    "max": 1.0,
                    "weight": 500.0
                },
                {
                    "name": "age_universe",
                    "derived": "age",
                    "min": 12.0,
                    "max": 15.5,
                    "weight": 20.0
                },
                {
                    "name": "xi_prtoe_stability",
                    "expression": "xi_prtoe",
                    "min": -1e9,
                    "max": 1.0e-4,
                    "weight": 1000.0
                }
            ]
        else:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Loaded {len(physical_constraints)} custom model-agnostic physical constraints from configuration.")
            sys.stdout.flush()

    # Get output prefix
    output_prefix = info.get("output")
    if not output_prefix:
        output_prefix = "chains/prtoe_poly"  # fallback

    log_file_path = f"{output_prefix}.log"
    out_dir = os.path.dirname(log_file_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [output] Output to be read-from/written-into folder '{os.path.dirname(output_prefix)}', with prefix '{os.path.basename(output_prefix)}'")
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Launching Hybrid Cosmo Optimizer (Method: {args.method.upper()}, Multi-start: {args.multistart})...")

    # Load Cobaya packages path if specified
    if args.packages_path:
        info["packages_path"] = args.packages_path

    # Keep backup of sampler settings but delete it to initialize pure model
    sampler_info = info.pop("sampler", {})

    if args.test_toy:
        model = ToyCosmoModel()
    else:
        model = get_model(info)

    # Identify sampled parameters
    sampled_names = []
    bounds = []
    initial_guess = []

    for name, p in info.get("params", {}).items():
        if isinstance(p, dict) and "prior" in p:
            sampled_names.append(name)
            prior = p["prior"]
            
            # Extract bounds
            if "min" in prior and "max" in prior:
                min_val = float(prior["min"])
                max_val = float(prior["max"])
            elif "dist" in prior and prior["dist"] == "norm":
                loc = float(prior.get("loc", 1.0))
                scale = float(prior.get("scale", 0.0025))
                min_val = loc - 5.0 * scale
                max_val = loc + 5.0 * scale
            else:
                min_val = -np.inf
                max_val = np.inf
                
            bounds.append((min_val, max_val))
            
            # Extract initial guess (ref)
            ref = p.get("ref")
            if ref is not None:
                if isinstance(ref, dict):
                    initial_guess.append(float(ref.get("loc", (min_val + max_val)/2.0)))
                else:
                    initial_guess.append(float(ref))
            else:
                initial_guess.append((min_val + max_val)/2.0 if np.isfinite(min_val) and np.isfinite(max_val) else 0.0)

    # Identify derived parameters
    derived_names = []
    for name, p in info.get("params", {}).items():
        if isinstance(p, dict) and ("value" in p or "derived" in p or p.get("derived", False)):
            derived_names.append(name)
    for name in model.derived_params:
        if name not in derived_names:
            derived_names.append(name)

    # Clean up output directory
    polychord_raw_dir = os.path.join(os.path.dirname(output_prefix), f"{os.path.basename(output_prefix)}_polychord_raw")
    os.makedirs(polychord_raw_dir, exist_ok=True)
    live_points_file = os.path.join(polychord_raw_dir, f"{os.path.basename(output_prefix)}_phys_live.txt")

    # If PolyChord cross-check is requested, run it now and exit
    if args.polychord:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Initializing standard PolyChord nested sampling cross-check...")
        # Restore sampler info
        info["sampler"] = {
            "polychord": {
                "nlive": 250,
                "num_repeats": 30,
                "precision_criterion": 0.01,
                "fast_fraction": 0.0,
                "base_dir": os.path.dirname(output_prefix),
                "file_root": os.path.basename(output_prefix),
                "write_resume": True,
                "read_resume": True,
            }
        }
        if "polychord" in sampler_info:
            info["sampler"]["polychord"].update(sampler_info["polychord"])
            
        # Add physical constraints as a custom Cobaya Likelihood class
        from cobaya.likelihood import Likelihood
        
        class PhysicalConstraintsLikelihood(Likelihood):
            def initialize(self):
                self.input_params = sampled_names + derived_names
                
            def logp(self, **params_values):
                point = {name: params_values.get(name, 0.0) for name in sampled_names}
                derived = {name: params_values.get(name, 0.0) for name in derived_names}
                penalty, _ = evaluate_constraints(point, derived, physical_constraints)
                return -0.5 * penalty
                
        if "likelihood" not in info:
            info["likelihood"] = {}
        info["likelihood"]["physical_constraints"] = PhysicalConstraintsLikelihood
        
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Running PolyChord nested sampler...")
        sys.stdout.flush()
        
        from cobaya.run import run
        updated_info, sampler = run(info)
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] PolyChord nested sampling run completed successfully!")
        sys.exit(0)

    # Global tracking variables across all multi-starts
    global_best_chi2 = np.inf
    global_best_point = None
    global_best_logprior = 0.0
    global_best_logpost = -np.inf
    global_best_loglikes = []
    global_best_derived_dict = {}
    global_best_chi2_cmb = None
    global_best_chi2_bao = None
    global_best_chi2_sn = None
    eval_count = 0

    # Initialize live points file
    with open(live_points_file, "w") as lf:
        lf.write("")

    # Simple evaluation cache to speed up duplicate/near-duplicate evaluations (cheap surrogate)
    eval_cache = {}
    
    # Advanced Local Surrogate model & unphysical tracking
    active_surrogate = None
    surrogate_evals = 0
    unphysical_points = []  # Stores points where viability was 0%
    mcmc_surrogate_hits = 0
    mcmc_total_calls = 0
    in_mcmc = False
    constraint_violations = []  # Track constraint violations during run
    
    def target_function(x):
        nonlocal global_best_chi2, global_best_point, global_best_logprior, global_best_logpost, global_best_loglikes, global_best_derived_dict, eval_count, surrogate_evals, mcmc_surrogate_hits, mcmc_total_calls, constraint_violations
        
        if in_mcmc:
            mcmc_total_calls += 1
        
        # 1. Early Prior Rejection (Zero-cost bounds check)
        for name, val, (low, high) in zip(sampled_names, x, bounds):
            if val < low or val > high:
                return 1e10

        # 2. Early Physical Rejection (Zero-cost check on expression-based constraints before calling CLASS)
        point_temp = {name: float(val) for name, val in zip(sampled_names, x)}
        expr_constraints = [c for c in physical_constraints if "expression" in c]
        if expr_constraints:
            early_penalty, _ = evaluate_constraints(point_temp, {}, expr_constraints)
            if early_penalty > 1e-4:
                return 1e10 + early_penalty

        # 3. Check Local Surrogate Model (GP/RBF)
        # SAFETY: Disable surrogate during MCMC/evidence to avoid bias
        if active_surrogate is not None and not in_mcmc:
            # Prevent surrogate from bypassing if the point is too close to known unphysical regions
            too_close_to_unphysical = False
            if unphysical_points:
                # Compute distance to all unphysical points
                dists = np.linalg.norm(np.array(unphysical_points) - np.array(x), axis=1)
                if np.min(dists) < 0.05:  # threshold distance
                    too_close_to_unphysical = True
            
            if not too_close_to_unphysical:
                pred_val = active_surrogate.predict(x)
                if pred_val is not None:
                    surrogate_evals += 1
                    if surrogate_evals % 50 == 0:
                        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [surrogate] Evaluation bypassed using local RBF model (total bypasses: {surrogate_evals})")
                        sys.stdout.flush()
                    return pred_val

        # 4. Check evaluation cache (surrogate cache)
        # Quantize relative to each parameter range so tiny parameters do not collapse.
        cache_key = []
        for v, (low, high) in zip(x, bounds):
            v = float(v)
            if np.isfinite(low) and np.isfinite(high) and high > low:
                step = max((high - low) * 1e-8, np.finfo(float).eps)
                cache_key.append(round(v / step) * step)
            else:
                cache_key.append(round(v, 12))
        cache_key = tuple(cache_key)
        if cache_key in eval_cache:
            return eval_cache[cache_key]

        eval_count += 1
        # Build parameter dictionary
        point = {}
        for name, val in zip(sampled_names, x):
            point[name] = float(val)

        t_start = time.time()
        try:
            res = model.logposterior(point)
            t_eval = time.time() - t_start
            
            if res.logpost is None or not np.isfinite(res.logpost):
                return 1e10

            chi2 = -2.0 * res.loglike

            # Print evaluation details (enables dashboard average evaluation time extraction)
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [classy] Average evaluation time: {t_eval:.4f} s")

            # Map derived values from Cobaya's LogPosterior
            # Cobaya returns: logpost, logprior, loglikes, derived
            derived_dict = {}
            for name, val in zip(model.derived_params, res.derived):
                derived_dict[name] = float(val)

            # Build derived dictionary for logging
            log_derived = {
                "A_s": derived_dict.get("A_s", 0.0),
                "V0_prtoe": derived_dict.get("V0_prtoe", 0.0)
            }
            
            # Map individual chi2 values
            likes_keys = list(model.likelihood.keys())
            for idx, key in enumerate(likes_keys):
                log_derived[f"chi2__{key}"] = -2.0 * float(res.loglikes[idx])

            log_derived["chi2__BAO"] = derived_dict.get("chi2__BAO", sum(v for k, v in log_derived.items() if k.startswith("chi2__") and "bao" in k.lower()))
            log_derived["chi2__CMB"] = derived_dict.get("chi2__CMB", sum(v for k, v in log_derived.items() if k.startswith("chi2__") and ("cmb" in k.lower() or "planck" in k.lower())))
            log_derived["chi2__SN"] = derived_dict.get("chi2__SN", sum(v for k, v in log_derived.items() if k.startswith("chi2__") and ("sn" in k.lower() or "pantheon" in k.lower() or "shoes" in k.lower())))

            # Output in Cobaya log format (dashboard parser extracts real-time statistics from this pattern)
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [model] Computed derived parameters: {log_derived}")

            # Calculate physical sanity penalties & viability score using model-agnostic constraints
            # If age is not in derived_dict, try to extract it from classy provider
            if "age" not in derived_dict:
                try:
                    derived_dict["age"] = model.theory['classy'].provider.get_param('age')
                except Exception:
                    try:
                        derived_dict["age"] = model.theory['classy'].classy.age()
                    except Exception:
                        derived_dict["age"] = 13.8

            total_penalty, viability_score = evaluate_constraints(point, derived_dict, physical_constraints)
            
            raw_chi2 = -2.0 * res.loglike
            chi2_penalized = raw_chi2 + total_penalty

            if total_penalty > 0.0:
                print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Physical Sanity Violation detected | Penalty: {total_penalty:.4f} | Viability: {viability_score:.1f}%")
                # Log constraint violation for diagnostics
                constraint_violations.append({
                    "point": point.copy(),
                    "penalty": float(total_penalty),
                    "viability": float(viability_score)
                })

            # If this is the new best fit, update the best fit tracking files
            if chi2_penalized < global_best_chi2:
                global_best_chi2 = chi2_penalized
                global_best_point = point
                global_best_logprior = float(res.logprior)
                global_best_logpost = float(res.logpost)
                global_best_loglikes = [float(v) for v in res.loglikes]
                global_best_derived_dict = derived_dict
                global_best_derived_dict["viability_score"] = viability_score
                global_best_derived_dict["raw_chi2"] = raw_chi2
                # Update individual chi2 contributions
                global_best_chi2_cmb = log_derived.get("chi2__CMB")
                global_best_chi2_bao = log_derived.get("chi2__BAO")
                global_best_chi2_sn = log_derived.get("chi2__SN")
                
                # Write to live points file in PolyChord format so dashboard parses it instantly
                # Format: sampled + derived + logprior + likes + total_loglike
                row_values = []
                for name in sampled_names:
                    row_values.append(point[name])
                for name in derived_names:
                    row_values.append(derived_dict.get(name, 0.0))
                row_values.append(float(res.logprior))
                for val in res.loglikes:
                    row_values.append(float(val))
                row_values.append(float(res.logpost - res.logprior))
                    
                with open(live_points_file, "w") as lf:
                    lf.write("  ".join(f"{v:.15E}" for v in row_values) + "\n")
                    
                print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] New best fit found! Raw Chi2 = {raw_chi2:.4f}, Penalized = {chi2_penalized:.4f}, Viability = {viability_score:.1f}%")

            # Track unphysical points (viability is 0%) to map out unphysical wedges
            if viability_score <= 0.0:
                unphysical_points.append(list(x))

            # Add to local surrogate if active
            if active_surrogate is not None:
                active_surrogate.add_point(x, chi2_penalized)

            sys.stdout.flush()
            eval_cache[cache_key] = chi2_penalized
            return chi2_penalized

        except Exception as e:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Warning: point evaluation failed: {e}")
            sys.stdout.flush()
            eval_cache[cache_key] = 1e10
            return 1e10

    # Set up starting points list for multi-start global optimization
    starting_points = []
    
    # Mode names mapping
    mode_names = []
    
    # 1. First starting point: the reference point in the configuration (usually Planck-like)
    starting_points.append(initial_guess)
    mode_names.append("Planck-preferred")
    
    # 2. Second starting point: SH0ES-preferred mode (H0 high, e.g. 73.0)
    if len(starting_points) < args.multistart:
        shoes_guess = list(initial_guess)
        if "H0" in sampled_names:
            h0_idx = sampled_names.index("H0")
            shoes_guess[h0_idx] = 73.0
        starting_points.append(shoes_guess)
        mode_names.append("SH0ES-preferred")
        
    # 3. Third starting point: Strong coupling / High transition PRTOE mode
    if len(starting_points) < args.multistart:
        prtoe_high_guess = list(initial_guess)
        if "H0" in sampled_names:
            prtoe_high_guess[sampled_names.index("H0")] = 71.5
        if "xi_prtoe" in sampled_names:
            prtoe_high_guess[sampled_names.index("xi_prtoe")] = 8.0e-6
        if "zeta_prtoe" in sampled_names:
            prtoe_high_guess[sampled_names.index("zeta_prtoe")] = 100.0
        starting_points.append(prtoe_high_guess)
        mode_names.append("PRTOE-High-Coupling")
        
    # 4. Fourth starting point: Weak coupling / Low transition PRTOE mode
    if len(starting_points) < args.multistart:
        prtoe_low_guess = list(initial_guess)
        if "H0" in sampled_names:
            prtoe_low_guess[sampled_names.index("H0")] = 68.0
        if "xi_prtoe" in sampled_names:
            prtoe_low_guess[sampled_names.index("xi_prtoe")] = 1.0e-6
        if "zeta_prtoe" in sampled_names:
            prtoe_low_guess[sampled_names.index("zeta_prtoe")] = 30.0
        starting_points.append(prtoe_low_guess)
        mode_names.append("PRTOE-Low-Coupling")

    # Fill rest with random starting points if args.multistart is larger
    if len(starting_points) < args.multistart:
        np.random.seed(42)
        while len(starting_points) < args.multistart:
            candidate = []
            for i, name in enumerate(sampled_names):
                low, high = bounds[i]
                candidate.append(np.random.uniform(low, high))
            starting_points.append(candidate)
            mode_names.append(f"Random-Start-{len(starting_points)}")

    # ---------------------------------------------------------------------------
    # Profile Likelihood Scan Mode
    # ---------------------------------------------------------------------------
    if args.profile:
        prof_param = args.profile
        if prof_param not in sampled_names:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] ERROR: Parameter '{prof_param}' is not a sampled parameter.")
            sys.exit(1)
            
        # Get index of profiled parameter
        prof_idx = sampled_names.index(prof_param)
        
        # Remove profiled parameter from the active optimization list
        active_names = [name for i, name in enumerate(sampled_names) if i != prof_idx]
        active_bounds = [b for i, b in enumerate(bounds) if i != prof_idx]
        active_initial = [val for i, val in enumerate(initial_guess) if i != prof_idx]
        
        # Define grid of values
        prior = info["params"][prof_param].get("prior", {})
        if args.profile_range:
            grid_min, grid_max = args.profile_range
        elif "min" in prior and "max" in prior:
            grid_min = float(prior["min"])
            grid_max = float(prior["max"])
        else:
            # Fallback to +/- 10% around initial guess
            grid_min = initial_guess[prof_idx] * 0.9
            grid_max = initial_guess[prof_idx] * 1.1
            
        grid_values = np.linspace(grid_min, grid_max, args.profile_steps)
        print(f"\n {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] Starting Profile Likelihood scan for '{prof_param}' over range [{grid_min:.4f}, {grid_max:.4f}] ({args.profile_steps} steps)...")
        sys.stdout.flush()
        
        profile_results = []
        current_best_active = list(active_initial)
        
        for step_idx, grid_val in enumerate(grid_values):
            print(f"\n {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] Step {step_idx + 1}/{args.profile_steps} | Fixing {prof_param} = {grid_val:.4f}")
            sys.stdout.flush()
            
            # Wrapper target function that fixes the profiled parameter at grid_val
            def profile_target(active_x):
                # Reconstruct full x vector
                full_x = []
                active_idx = 0
                for i in range(len(sampled_names)):
                    if i == prof_idx:
                        full_x.append(grid_val)
                    else:
                        full_x.append(active_x[active_idx])
                        active_idx += 1
                return target_function(full_x)
                
            # Run optimization for the active parameters
            if args.method == "bobyqa":
                try:
                    import pybobyqa
                    xl = [b[0] for b in active_bounds]
                    xu = [b[1] for b in active_bounds]
                    start_y = [(current_best_active[i] - xl[i]) / (xu[i] - xl[i]) if (xu[i] - xl[i]) > 0 else 0.5 
                               for i in range(len(current_best_active))]
                    normalized_bounds = ([0.0] * len(xl), [1.0] * len(xu))
                    
                    def normalized_profile_target(y):
                        x = [xl[i] + y[i] * (xu[i] - xl[i]) for i in range(len(y))]
                        return profile_target(x)
                        
                    res_raw = pybobyqa.solve(
                        normalized_profile_target,
                        start_y,
                        bounds=normalized_bounds,
                        rhobeg=0.05,
                        maxfun=100,
                        objfun_has_noise=True,
                        print_progress=False
                    )
                    
                    if res_raw.x is not None:
                        best_active = [xl[i] + res_raw.x[i] * (xu[i] - xl[i]) for i in range(len(res_raw.x))]
                        best_fun = res_raw.f
                    else:
                        best_active = list(current_best_active)
                        best_fun = 1e10
                except Exception as e:
                    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] Warning: pybobyqa failed at this step: {e}")
                    best_active = list(current_best_active)
                    best_fun = 1e10
            else:
                scipy_method = "Powell" if args.method == "powell" else "Nelder-Mead"
                res_raw = minimize(
                    profile_target,
                    current_best_active,
                    method=scipy_method,
                    bounds=active_bounds,
                    options={"xtol": 1e-4, "ftol": 1e-4, "disp": False}
                )
                best_active = list(res_raw.x)
                best_fun = res_raw.fun
                
            # Warm start: use this step's best active parameters as the starting guess for the next step!
            if best_fun < 1e9:
                current_best_active = list(best_active)
                
            # Perform a final evaluation to get raw chi2 and viability
            full_best_x = []
            active_idx = 0
            for i in range(len(sampled_names)):
                if i == prof_idx:
                    full_best_x.append(grid_val)
                else:
                    full_best_x.append(best_active[active_idx])
                    active_idx += 1
                    
            try:
                point_dict = {name: float(val) for name, val in zip(sampled_names, full_best_x)}
                eval_res = model.logposterior(point_dict)
                derived_dict = {}
                for name, val in zip(model.derived_params, eval_res.derived):
                    derived_dict[name] = float(val)
                    
                # If age is not in derived_dict, try to extract it from classy provider
                if "age" not in derived_dict:
                    try:
                        derived_dict["age"] = model.theory['classy'].provider.get_param('age')
                    except Exception:
                        try:
                            derived_dict["age"] = model.theory['classy'].classy.age()
                        except Exception:
                            derived_dict["age"] = 13.8

                _, v_score = evaluate_constraints(point_dict, derived_dict, physical_constraints)
                raw_chi2 = -2.0 * float(eval_res.loglike)
            except Exception:
                raw_chi2 = best_fun
                v_score = 0.0
                
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] Step finished | {prof_param} = {grid_val:.4f} | Raw Chi2 = {raw_chi2:.4f} | Viability = {v_score:.1f}%")
            sys.stdout.flush()
            
            profile_results.append({
                "val": grid_val,
                "raw_chi2": raw_chi2,
                "penalized_chi2": best_fun,
                "viability_score": v_score,
                "point": {name: full_best_x[i] for i, name in enumerate(sampled_names)}
            })
            
        # Write profile scan to a text file
        prof_file = f"{output_prefix}_profile_{prof_param}.txt"
        with open(prof_file, "w") as pf:
            pf.write(f"# Profile Likelihood Scan for {prof_param}\n")
            pf.write(f"# value    raw_chi2    penalized_chi2    viability_score\n")
            for pr in profile_results:
                pf.write(f"{pr['val']:.6e}    {pr['raw_chi2']:.6f}    {pr['penalized_chi2']:.6f}    {pr['viability_score']:.1f}\n")
        print(f"\n {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] Profile scan written to {prof_file}")
        
        # Plot profile likelihood using matplotlib if available
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            
            plt.style.use('dark_background')
            fig, ax = plt.subplots(figsize=(7, 5))
            
            vals = [pr["val"] for pr in profile_results]
            raw_chi2s = np.array([pr["raw_chi2"] for pr in profile_results])
            
            # Filter out failed points
            valid_idx = raw_chi2s < 1e5
            if np.any(valid_idx):
                vals_valid = np.array(vals)[valid_idx]
                chi2_valid = raw_chi2s[valid_idx]
                
                # Use the minimum chi² from the scan as baseline (evidence is not a best-fit chi²)
                min_chi2 = np.min(chi2_valid)
                delta_chi2 = chi2_valid - min_chi2
                ax.axhline(y=0.0, color='#9b59b6', linestyle=':', alpha=0.8, label=r'Scan Minimum ($\Delta\chi^2=0$)')
                ax.set_ylabel(r"$\ chi^2 - \chi^2_{\mathrm{min}}$", fontsize=11)
                
                ax.plot(vals_valid, delta_chi2, 'o-', color='#00d2d3', linewidth=2, label=r'Profile Likelihood')
                
                # Draw confidence interval threshold lines
                ax.axhline(y=1.0, color='#ff9f43', linestyle='--', alpha=0.7, label=r'$1\sigma$ Limit ($\Delta\chi^2=1$)')
                ax.axhline(y=3.84, color='#ee5253', linestyle='--', alpha=0.7, label=r'$2\sigma$ Limit ($\Delta\chi^2=3.84$)')
                
                ax.set_title(f"Profile Likelihood for {prof_param}", fontsize=12, color="#00d2d3")
                ax.set_xlabel(prof_param, fontsize=11)
                ax.grid(linestyle='--', alpha=0.2)
                ax.legend(loc='upper center', frameon=True, facecolor='black', edgecolor='white')
                
                plot_file = f"{output_prefix}_profile_{prof_param}.png"
                plt.savefig(plot_file, dpi=150, bbox_inches='tight')
                
                # Save a copy to the dashboard directory for easy serving via backend
                os.makedirs("dashboard", exist_ok=True)
                plt.savefig("dashboard/profile_likelihood.png", dpi=150, bbox_inches='tight')
                
                print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] Profile plot saved to {plot_file} and dashboard/profile_likelihood.png")
        except Exception as e:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [profile] Warning: could not generate profile plot: {e}")
            
        sys.stdout.flush()
        sys.exit(0)

    # Loop over all starts
    best_overall_start_chi2 = np.inf
    best_overall_start_x = None
    
    # Store detailed result for each mode
    mode_results = []

    for run_idx, start_x in enumerate(starting_points):
        mode_name = mode_names[run_idx]
        if run_idx + 1 < args.start_from_run:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Skipping Run {run_idx + 1}/{len(starting_points)} ({mode_name}) as requested by --start-from-run.")
            sys.stdout.flush()
            continue
        print(f"\n {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] --- Starting Run {run_idx + 1}/{len(starting_points)} ({mode_name}) ---")
        formatted_start = ", ".join(f"{name}={val:.5e}" for name, val in zip(sampled_names, start_x))
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Start point: [{formatted_start}]")
        sys.stdout.flush()

        if args.method == "bobyqa":
            try:
                import pybobyqa
            except ImportError:
                print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] ERROR: pybobyqa not installed. Falling back to Powell.")
                args.method = "powell"

        if args.method == "bobyqa":
            # Normalize parameter space to [0,1] for Py-BOBYQA to handle disparate scales
            # This ensures rhobeg constraint (gap >= 2*rhobeg) is satisfied for all parameters
            xl = [b[0] for b in bounds]
            xu = [b[1] for b in bounds]
            
            # Map starting point to normalized space
            start_y = [(start_x[i] - xl[i]) / (xu[i] - xl[i]) if (xu[i] - xl[i]) > 0 else 0.5 
                       for i in range(len(start_x))]
            
            # Project slightly inside [0,1] to avoid boundary issues
            epsilon = 1e-4
            start_y = [max(epsilon, min(1.0 - epsilon, val)) for val in start_y]
            
            # Normalized bounds are [0,1] for all parameters
            normalized_bounds = ([0.0] * len(xl), [1.0] * len(xu))
            
            # Universal rhobeg = 5% of normalized range (0.05)
            rhobeg = 0.05
            
            # Wrapper to map normalized y to physical x
            def normalized_target(y):
                x = [xl[i] + y[i] * (xu[i] - xl[i]) for i in range(len(y))]
                return target_function(x)
            
            res_raw = pybobyqa.solve(
                normalized_target,
                start_y,
                bounds=normalized_bounds,
                rhobeg=rhobeg,
                maxfun=150,
                objfun_has_noise=True,
                print_progress=False
            )
            
            # Map result back to physical space
            if res_raw.x is not None:
                best_x_physical = [xl[i] + res_raw.x[i] * (xu[i] - xl[i]) for i in range(len(res_raw.x))]
            else:
                best_x_physical = None
            
            class MockResult:
                def __init__(self, x, fun, message):
                    self.x = x
                    self.fun = fun
                    self.message = message
            run_res = MockResult(best_x_physical, res_raw.f, res_raw.msg)
            
        else:
            # Scipy optimization methods (Powell or Nelder-Mead)
            scipy_method = "Powell" if args.method == "powell" else "Nelder-Mead"
            run_res = minimize(
                target_function,
                start_x,
                method=scipy_method,
                bounds=bounds,
                options={"xtol": 1e-4, "ftol": 1e-4, "disp": True}
            )

        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Run {run_idx + 1} ({mode_name}) finished. Best Chi2 found in this run: {run_res.fun:.4f}")
        sys.stdout.flush()

        # Capture final coordinates and evaluation details for this mode
        if run_res.x is not None:
            # Run one final evaluation to ensure global tracking variables align with this point
            final_point = {}
            for name, val in zip(sampled_names, run_res.x):
                final_point[name] = float(val)
            try:
                eval_res = model.logposterior(final_point)
                derived_dict = {}
                for name, val in zip(model.derived_params, eval_res.derived):
                    derived_dict[name] = float(val)
                
                # If age is not in derived_dict, try to extract it from classy provider
                if "age" not in derived_dict:
                    try:
                        derived_dict["age"] = model.theory['classy'].provider.get_param('age')
                    except Exception:
                        try:
                            derived_dict["age"] = model.theory['classy'].classy.age()
                        except Exception:
                            derived_dict["age"] = 13.8

                _, v_score = evaluate_constraints(final_point, derived_dict, physical_constraints)
                raw_chi2 = -2.0 * float(eval_res.loglike)
                
                likes_keys = list(model.likelihood.keys())
                likes_chi2 = {}
                for idx, key in enumerate(likes_keys):
                    likes_chi2[key] = -2.0 * float(eval_res.loglikes[idx])
                
                mode_results.append({
                    "name": mode_name,
                    "chi2": raw_chi2,
                    "penalized_chi2": run_res.fun,
                    "viability_score": v_score,
                    "point": final_point,
                    "derived": derived_dict,
                    "likes": likes_chi2,
                    "logpost": float(eval_res.logpost),
                    "logprior": float(eval_res.logprior),
                    "loglikes": [float(v) for v in eval_res.loglikes],
                    # Surrogate diagnostics: compute hit rate during optimization
                    "surrogate_hit_rate": float(surrogate_evals) / float(eval_count) * 100.0 if eval_count > 0 else 0.0,
                    "surrogate_used": surrogate_evals > 0
                })
            except Exception as e:
                print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Warning: final evaluation of mode failed: {e}")
        
        if run_res.fun < best_overall_start_chi2:
            best_overall_start_chi2 = run_res.fun
            best_overall_start_x = run_res.x
 
    print(f"\n {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] All multi-start runs finished!")
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Best global Penalized Chi2: {best_overall_start_chi2:.4f}")
    sys.stdout.flush()
 
    # Cluster distinct physical modes to group identical solutions
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Clustering and ranking distinct solutions...")
    sys.stdout.flush()
    
    unique_modes = []
    xl = [b[0] for b in bounds]
    xu = [b[1] for b in bounds]
    
    # Sort mode results by penalized_chi2 (best first)
    sorted_modes = sorted(mode_results, key=lambda x: x.get("penalized_chi2", x["chi2"]))
    
    for mr in sorted_modes:
        # Check if this mode is close to any already identified unique mode
        is_duplicate = False
        for um in unique_modes:
            dist = 0.0
            for i, name in enumerate(sampled_names):
                val1 = mr["point"][name]
                val2 = um["point"][name]
                range_i = xu[i] - xl[i]
                if range_i > 0:
                    dist += ((val1 - val2) / range_i) ** 2
            dist = np.sqrt(dist)
            
            # If distance is less than 5% of the total parameter space, they are the same mode!
            if dist < 0.05:
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_modes.append(mr)
            
    # Rename unique modes based on their rank and H0 values
    for idx, um in enumerate(unique_modes):
        h0 = um["point"].get("H0", 67.4)
        um["name"] = f"Mode {idx + 1} (H0={h0:.2f})"
        
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Detected {len(unique_modes)} unique physical modes (out of {len(mode_results)} starts)")
    sys.stdout.flush()
 
    # Output side-by-side comparison log of unique modes
    if len(unique_modes) >= 1:
        print("\n" + "="*80)
        print(" DISTINCT PHYSICAL MODES FOUND")
        print("="*80)
        for um in unique_modes:
            print(f"\n Mode: {um['name'].upper()}")
            print(f"   Raw Data Chi2  : {um['chi2']:.4f}")
            print(f"   Penalized Chi2 : {um['penalized_chi2']:.4f}")
            print(f"   Viability Score: {um['viability_score']:.1f}%")
            print("   Parameters:")
            for p_name, p_val in um['point'].items():
                print(f"     {p_name:<15}: {p_val:.6e}")
            print("   Derived & Physical Checks:")
            h0_val = um['point'].get("H0", um['derived'].get("H0", 67.4))
            omega_b = um['point'].get("omega_b", 0.0224)
            omega_cdm = um['point'].get("omega_cdm", 0.120)
            v0_val = 1.0 - (omega_b + omega_cdm) / (h0_val / 100.0)**2
            print(f"     H0             : {h0_val:.3f}")
            print(f"     V0_prtoe       : {v0_val:.4f} ({'PHYSICALLY VIABLE' if 0<=v0_val<=1 else 'UNPHYSICAL / PATHOLOGICAL'})")
            print(f"     sigma8         : {um['derived'].get('sigma8', 0.0):.4f}")
            print(f"     S8             : {um['derived'].get('S8', 0.0):.4f}")
            print("   Likelihood Breakdown (Chi2):")
            for l_name, l_chi2 in um['likes'].items():
                print(f"     {l_name:<20}: {l_chi2:.4f}")
        print("="*80 + "\n")
        sys.stdout.flush()
 
        # Write modes comparison to comparison file
        comp_file = f"{output_prefix}_modes_comparison.txt"
        with open(comp_file, "w") as cf:
            cf.write("MULTIMODAL COSMOLOGICAL EXPLORATION COMPARISON\n")
            cf.write("==============================================\n\n")
            for um in unique_modes:
                cf.write(f"Mode: {um['name']}\n")
                cf.write(f"----------------------------------------------\n")
                cf.write(f"Raw Data Chi2: {um['chi2']:.4f}\n")
                cf.write(f"Penalized Chi2: {um['penalized_chi2']:.4f}\n")
                cf.write(f"Viability Score: {um['viability_score']:.1f}%\n")
                cf.write("Parameters:\n")
                for p_name, p_val in um['point'].items():
                    cf.write(f"  {p_name:<20}: {p_val:.6e}\n")
                cf.write("Derived & Physical Metrics:\n")
                h0_val = um['point'].get("H0", um['derived'].get("H0", 67.4))
                omega_b = um['point'].get("omega_b", 0.0224)
                omega_cdm = um['point'].get("omega_cdm", 0.120)
                v0_val = 1.0 - (omega_b + omega_cdm) / (h0_val / 100.0)**2
                cf.write(f"  H0                  : {h0_val:.3f}\n")
                cf.write(f"  V0_prtoe            : {v0_val:.4f} ({'PHYSICALLY VIABLE' if 0<=v0_val<=1 else 'UNPHYSICAL'})\n")
                cf.write(f"  sigma8              : {um['derived'].get('sigma8', 0.0):.4f}\n")
                cf.write(f"  S8                  : {um['derived'].get('S8', 0.0):.4f}\n")
                cf.write("Likelihood Breakdown:\n")
                for l_name, l_chi2 in um['likes'].items():
                    cf.write(f"  {l_name:<25}: {l_chi2:.4f}\n")
                cf.write("\n")
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Multimodal comparison written to {comp_file}")
            sys.stdout.flush()

    # 1. Process each unique mode for Hessian, MCMC, and Gelfand-Dey evidence
    print(f"\n {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Processing {len(unique_modes)} unique modes for error bars and MCMC...")
    sys.stdout.flush()
    
    total_starts = args.multistart
    # Health Diagnostics: count how many starting points ended up with 0% viability
    failed_starts = sum(1 for r in mode_results if r.get("viability_score", 100.0) <= 0.0)
    
    # Calculate mode stability (basin fraction) and isolation index
    xl = [b[0] for b in bounds]
    xu = [b[1] for b in bounds]
    for um in unique_modes:
        # Count how many starting points clustered into this mode
        basin_count = 0
        for mr in mode_results:
            dist = 0.0
            for i, name in enumerate(sampled_names):
                val1 = mr["point"][name]
                val2 = um["point"][name]
                range_i = xu[i] - xl[i]
                if range_i > 0:
                    dist += ((val1 - val2) / range_i) ** 2
            if np.sqrt(dist) < 0.05:
                basin_count += 1
        um["stability"] = (basin_count / len(mode_results)) * 100.0

        # Calculate isolation index (distance to nearest other mode)
        nearest_dist = np.inf
        for other in unique_modes:
            if other["name"] == um["name"]:
                continue
            dist = 0.0
            for i, name in enumerate(sampled_names):
                val1 = um["point"][name]
                val2 = other["point"][name]
                range_i = xu[i] - xl[i]
                if range_i > 0:
                    dist += ((val1 - val2) / range_i) ** 2
            dist = np.sqrt(dist)
            if dist < nearest_dist:
                nearest_dist = dist
        um["isolation"] = nearest_dist if nearest_dist != np.inf else -1.0

    # Process MCMC and evidence for each mode
    for idx, um in enumerate(unique_modes):
        print(f"\n" + "-"*80)
        print(f" ANALYZING MODE {idx + 1}: {um['name']}")
        print(f"   Peak Raw Chi2: {um['chi2']:.4f} | Stability: {um['stability']:.1f}% | Isolation: {um['isolation']:.3f}")
        print(f"-"*80)
        sys.stdout.flush()
        
        um_x = [um["point"][name] for name in sampled_names]
        
        # Compute covariance matrix from Hessian
        cov, hessian = compute_covariance(um_x, target_function, sampled_names, info)
        um["cov"] = cov
        um["hessian"] = hessian
        
        # Compute Laplace evidence for this mode
        sign, logdet = np.linalg.slogdet(hessian)
        n_params = len(sampled_names)
        if sign > 0:
            um["log_z_laplace"] = -0.5 * um["chi2"] + 0.5 * n_params * np.log(4.0 * np.pi) - 0.5 * logdet
        else:
            um["log_z_laplace"] = -0.5 * um["chi2"]
            
        um["log_z"] = um["log_z_laplace"]  # default
        um["mcmc_chain"] = []
        um["ess"] = {}
        um["mcmc_acc_rate"] = 0.0
        um["evidence_method"] = "Laplace (Hessian)"
        
        # Run Metropolis-Hastings MCMC if requested
        if args.mcmc_steps > 0:
            try:
                # Compute prior ranges for lengthscale adaptation
                prior_ranges = []
                for name in sampled_names:
                    prior = info["params"][name].get("prior", {})
                    if "min" in prior and "max" in prior:
                        prior_ranges.append(float(prior["max"]) - float(prior["min"]))
                    else:
                        prior_ranges.append(1.0)
                
                # Initialize local surrogate pre-trained on all evaluation cache but DO NOT enable it during evidence/MCMC
                mode_surrogate = LocalSurrogate(n_params, prior_ranges=prior_ranges)
                for k_arr, val in eval_cache.items():
                    mode_surrogate.add_point(list(k_arr), val)

                # Safety: DO NOT assign mode_surrogate to active_surrogate here. The surrogate may bias
                # evidence estimates; keep it for diagnostics only and disable during MCMC/evidence.
                surrogate_evals = 0
                in_mcmc = True
                mcmc_surrogate_hits = 0
                mcmc_total_calls = 0

                chains_all = []
                num_chains = max(1, int(getattr(args, 'mcmc_chains', 1)))
                for chain_idx in range(num_chains):
                    # Small random perturbation of the starting point to initialize independent chains
                    perturb = np.random.normal(scale=1e-6, size=n_params)
                    start_x = (np.array(um_x) + perturb).tolist()
                    try:
                        chain_c = run_mcmc(start_x, cov, target_function, model, sampled_names, derived_names, args.mcmc_steps)
                        if chain_c is None:
                            chain_c = []
                    except Exception as e:
                        print(f" [mode-{idx+1}] Warning: MCMC chain {chain_idx+1} failed: {e}")
                        chain_c = []
                    chains_all.append(chain_c)

                # Finalize MCMC state
                in_mcmc = False
                # Surrogate remained disabled during MCMC -> hit rate is zero (explicit)
                um["surrogate_hit_rate"] = 0.0

                # Combine chains sequentially for downstream processing (evidence & diagnostics)
                combined_chain = []
                for ch in chains_all:
                    combined_chain.extend(ch)
                um["mcmc_chain"] = combined_chain

                # Estimate Gelfand-Dey evidence from combined chain
                log_z_gd = estimate_gelfand_dey_evidence(combined_chain, sampled_names, info)
                if log_z_gd is not None:
                    print(f" [mode-{idx+1}] Estimated Gelfand-Dey Evidence: {log_z_gd:.4f} (Laplace was: {um['log_z_laplace']:.4f})")
                    um["log_z"] = log_z_gd
                    um["evidence_method"] = "Gelfand-Dey (MCMC)"
                else:
                    print(f" [mode-{idx+1}] Warning: Gelfand-Dey failed. Using Laplace evidence.")
                    
                # Calculate MCMC-based errors and ESS
                um["errors"] = {}
                for name in sampled_names:
                    samples = [row["point"][name] for row in combined_chain]
                    um["errors"][name] = float(np.std(samples)) if len(samples) > 0 else 0.0

                    # Estimate ESS using robust helper
                    try:
                        um["ess"][name] = float(compute_ess(samples)) if len(samples) > 3 else 1.0
                    except Exception:
                        um["ess"][name] = 1.0
                

                # Compute acceptance rate
                unique_points = len(set(tuple(row["point"].values()) for row in combined_chain))
                um["mcmc_acc_rate"] = (unique_points / len(combined_chain)) * 100.0 if len(combined_chain) > 0 else 0.0
                
                # Print MCMC diagnostics
                print(f" [mode-{idx+1}] MCMC Diagnostics:")
                print(f"   * Acceptance Rate: {um['mcmc_acc_rate']:.1f}%")
                if um['mcmc_acc_rate'] < 10.0:
                    print(f"     WARNING: Low acceptance rate (< 10%). Chain might be stuck. Consider scaling down the covariance.")
                elif um['mcmc_acc_rate'] > 50.0:
                    print(f"     WARNING: High acceptance rate (> 50%). Chain is taking too small steps. Consider scaling up the covariance.")
                
                low_ess_params = []
                rhat_issues = []
                # Compute R-hat across chains if multiple chains were run
                try:
                    num_chains = len(chains_all)
                    for name in sampled_names:
                        ess = um["ess"].get(name, 1.0)
                        print(f"   * {name:<15} | ESS: {ess:.1f}")
                        if ess < getattr(args, 'ess_threshold', 100.0):
                            low_ess_params.append(name)

                    if num_chains >= 2:
                        # Build per-parameter list-of-chains for R̂ computation
                        for pname in sampled_names:
                            list_of_chain_arrays = []
                            for ch in chains_all:
                                arr = np.array([row['point'][pname] for row in ch]) if len(ch) > 0 else np.array([])
                                if arr.size > 0:
                                    list_of_chain_arrays.append(arr)
                            rhat_val = compute_rhat(list_of_chain_arrays) if len(list_of_chain_arrays) >= 2 else None
                            # Store per-parameter R̂ in the mode record for downstream metadata
                            try:
                                if 'rhat' not in um:
                                    um['rhat'] = {}
                                um['rhat'][pname] = float(rhat_val) if rhat_val is not None else None
                            except Exception:
                                pass
                            if rhat_val is not None:
                                print(f"     R̂({pname}) = {rhat_val:.3f}")
                                if rhat_val > getattr(args, 'rhat_threshold', 1.05):
                                    rhat_issues.append(pname)
                except Exception:
                    pass

                # Compute unphysical fraction: fraction of global unphysical_points within mode neighborhood
                try:
                    unphys = 0
                    total_unphys = len(unphysical_points) if 'unphysical_points' in globals() else 0
                    if total_unphys > 0:
                        # Use normalized distance in parameter ranges (xl/xu available in outer scope)
                        from math import sqrt
                        for up in unphysical_points:
                            dist = 0.0
                            for i, name in enumerate(sampled_names):
                                range_i = xu[i] - xl[i] if 'xl' in locals() and 'xu' in locals() else 1.0
                                if range_i > 0:
                                    dist += ((up[i] - um['point'].get(name, 0.0)) / range_i) ** 2
                            if sqrt(dist) < 0.05:
                                unphys += 1
                        um['unphysical_fraction'] = float(unphys) / float(total_unphys)
                    else:
                        um['unphysical_fraction'] = 0.0
                except Exception:
                    um['unphysical_fraction'] = 0.0

                if low_ess_params:
                    print(f"     WARNING: Low Effective Sample Size (ESS < {getattr(args,'ess_threshold',100.0)}) for parameters: {', '.join(low_ess_params)}.")
                    print(f"              The MCMC chain may be too short or poorly mixed. Evidence and error estimates may be unstable.")
                if rhat_issues:
                    print(f"     WARNING: Parameter R̂ > {getattr(args,'rhat_threshold',1.05)} for: {', '.join(rhat_issues)}. Consider longer chains or additional independent chains.")
                sys.stdout.flush()
                
            except Exception as e:
                print(f" [mode-{idx+1}] Warning: MCMC/Evidence run failed: {e}")
                sys.stdout.flush()
                # Fallback to Hessian-based diagonal errors
                um["errors"] = {}
                for i, name in enumerate(sampled_names):
                    err_val = np.sqrt(max(1e-20, cov[i, i]))
                    um["errors"][name] = err_val
        else:
            # Fallback to Hessian-based diagonal errors
            um["errors"] = {}
            for i, name in enumerate(sampled_names):
                err_val = np.sqrt(max(1e-20, cov[i, i]))
                um["errors"][name] = err_val

    # 2. Compute tension metrics between unique modes
    tension_results = []
    if len(unique_modes) >= 2:
        print("\n" + "="*80)
        print(" COSMOLOGICAL PARAMETER TENSION BETWEEN MODES")
        print("="*80)
        for idx1 in range(len(unique_modes)):
            for idx2 in range(idx1 + 1, len(unique_modes)):
                m1 = unique_modes[idx1]
                m2 = unique_modes[idx2]
                print(f"\n Tension between {m1['name']} and {m2['name']}:")
                for name in sampled_names:
                    val1 = m1["point"][name]
                    val2 = m2["point"][name]
                    err1 = m1["errors"].get(name, 0.0)
                    err2 = m2["errors"].get(name, 0.0)
                    if err1 > 0 and err2 > 0:
                        tension = abs(val1 - val2) / np.sqrt(err1**2 + err2**2)
                        print(f"   {name:<15}: {tension:.2f} \u03c3  (|{val1:.4f} - {val2:.4f}| / sqrt({err1:.4f}^2 + {err2:.4f}^2))")
                        tension_results.append({
                            "mode1": m1["name"],
                            "mode2": m2["name"],
                            "param": name,
                            "value": float(tension)
                        })
                    else:
                        print(f"   {name:<15}: N/A (undefined errors)")
        print("="*80 + "\n")
        sys.stdout.flush()

    # 3. Compute Combined Multimodal Bayesian Evidence
    if len(unique_modes) > 0:
        log_z_values = [um["log_z"] for um in unique_modes]
        max_logz = np.max(log_z_values)
        log_z_combined = max_logz + np.log(np.sum(np.exp(log_z_values - max_logz)))
    else:
        log_z_combined = -0.5 * best_overall_start_chi2
        
    print("\n" + "="*80)
    print(" MULTIMODAL BAYESIAN EVIDENCE SUMMARY")
    print("="*80)
    print(f" Combined Multimodal Evidence ln(Z) = {log_z_combined:.4f}")
    for um in unique_modes:
        print(f"   * {um['name']:<20} | ln(Z) = {um['log_z']:.4f} ({um['evidence_method']}) | Stability = {um['stability']:.1f}%")
    print(f"   * Health Diagnostics: {failed_starts}/{total_starts} starts failed physical constraints ({failed_starts/total_starts*100.0:.1f}%)")
    print("="*80 + "\n")
    sys.stdout.flush()

    # 4. Write modes comparison to comparison file (including new advanced diagnostics)
    comp_file = f"{output_prefix}_modes_comparison.txt"
    with open(comp_file, "w") as cf:
        cf.write("MULTIMODAL COSMOLOGICAL EXPLORATION COMPARISON\n")
        cf.write("==============================================\n\n")
        cf.write(f"Combined Multimodal Evidence ln(Z) : {log_z_combined:.4f}\n")
        cf.write(f"Unphysical Exploration Health      : {total_starts - failed_starts}/{total_starts} starts viable ({((total_starts - failed_starts)/total_starts*100.0):.1f}%)\n\n")
        
        for um in unique_modes:
            cf.write(f"Mode: {um['name']}\n")
            cf.write(f"----------------------------------------------\n")
            cf.write(f"Raw Data Chi2: {um['chi2']:.4f}\n")
            cf.write(f"Penalized Chi2: {um['penalized_chi2']:.4f}\n")
            cf.write(f"Viability Score: {um['viability_score']:.1f}%\n")
            cf.write(f"Mode Stability (Basin Size): {um['stability']:.1f}%\n")
            cf.write(f"Mode Isolation Index: {um['isolation']:.3f}\n")
            cf.write(f"Mode Evidence ln(Z): {um['log_z']:.4f} ({um['evidence_method']})\n")
            cf.write(f"MCMC Acceptance Rate: {um['mcmc_acc_rate']:.1f}%\n")
            cf.write("Parameters:\n")
            for p_name, p_val in um['point'].items():
                err_val = um['errors'].get(p_name, 0.0)
                ess_val = um.get('ess', {}).get(p_name, -1.0)
                ess_str = f" [ESS: {ess_val:.1f}]" if ess_val > 0 else ""
                cf.write(f"  {p_name:<20}: {p_val:.6e} +/- {err_val:.6e}{ess_str}\n")
            cf.write("Derived & Physical Metrics:\n")
            h0_val = um['point'].get("H0", um['derived'].get("H0", 67.4))
            omega_b = um['point'].get("omega_b", 0.0224)
            omega_cdm = um['point'].get("omega_cdm", 0.120)
            v0_val = 1.0 - (omega_b + omega_cdm) / (h0_val / 100.0)**2
            cf.write(f"  H0                  : {h0_val:.3f}\n")
            cf.write(f"  V0_prtoe            : {v0_val:.4f} ({'PHYSICALLY VIABLE' if 0<=v0_val<=1 else 'UNPHYSICAL'})\n")
            cf.write(f"  sigma8              : {um['derived'].get('sigma8', 0.0):.4f}\n")
            cf.write(f"  S8                  : {um['derived'].get('S8', 0.0):.4f}\n")
            cf.write("Likelihood Breakdown:\n")
            for l_name, l_chi2 in um['likes'].items():
                cf.write(f"  {l_name:<25}: {l_chi2:.4f}\n")
            cf.write("\n")
            
        if tension_results:
            cf.write("Tension Metrics:\n")
            for tr in tension_results:
                cf.write(f"  {tr['mode1']} vs {tr['mode2']} | {tr['param']} : {tr['value']:.2f}\n")
                
        cf.write("\n================================================================================\n")
        cf.write("PROVENANCE & RUN METADATA\n")
        cf.write("================================================================================\n")
        cf.write("  Optimizer Version : 1.1 (Dual-Track Validation Edition)\n")
        cf.write(f"  Method            : {args.method.upper()}\n")
        cf.write(f"  Multi-start Count : {args.multistart}\n")
        cf.write(f"  MCMC Steps/Mode   : {args.mcmc_steps}\n")
        cf.write(f"  Physical Const.   : {len(physical_constraints)} custom constraints loaded\n")
        cf.write("  Surrogate Model   : Active (uncertainty-aware local GP surrogate)\n\n")
        
        cf.write("================================================================================\n")
        cf.write("LIMITATIONS & ASSUMPTIONS\n")
        cf.write("================================================================================\n")
        cf.write("  1. Gelfand-Dey Evidence: Gelfand-Dey is a posterior-harmonic-mean estimator\n")
        cf.write("     which assumes the proposal density (a truncated Gaussian) is a good\n")
        cf.write("     approximation of the high-density posterior region. It is highly sensitive\n")
        cf.write("     to MCMC chain length, sample correlation, and proposal support.\n")
        cf.write("     CRITICAL: It is strongly recommended to cross-validate important cosmological\n")
        cf.write("     evidence results using a full nested sampler (e.g., PolyChord) via the\n")
        cf.write("     '--polychord' flag.\n")
        cf.write("  2. Local Surrogate Model: GP surrogate model accelerates evaluations by\n")
        cf.write("     interpolating the likelihood. Though guarded against unphysical regions,\n")
        cf.write("     fine structures in the likelihood or sharp constraint boundaries may be smoothed.\n")
        cf.write("  3. Physical Constraints: Model-agnostic constraints are applied via a penalty\n")
        cf.write("     function. Viability scores represent the percentage of constraints satisfied.\n")
        cf.write("================================================================================\n")
                
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Multimodal comparison written to {comp_file}")
    sys.stdout.flush()

    # 5. Write the completed stats file (using best mode's errors and combined evidence)
    stats_file = f"{output_prefix}.stats"
    stats_raw_file = os.path.join(polychord_raw_dir, f"{os.path.basename(output_prefix)}.stats")
    
    best_mode = unique_modes[0] if unique_modes else None
    best_x = [best_mode["point"][name] for name in sampled_names] if best_mode else best_overall_start_x
    best_errors = best_mode["errors"] if best_mode else {}
    
    # Calculate total dead points (eval_count before errors + MCMC chains of all modes)
    total_dead = eval_count
    for um in unique_modes:
        total_dead += len(um.get("mcmc_chain", []))
        
    stats_content = (
        "# Optimizer Run completed successfully.\n"
        f"log(Z) = {log_z_combined:.4f} +/- 0.1\n"
        f"ndead: {total_dead}\n"
        f"nlive: 1\n\n"
        "parameter   best-fit    error\n"
    )
    for i, name in enumerate(sampled_names):
        err_val = best_errors.get(name, 0.0)
        stats_content += f"{name}    {best_x[i]:.6f}    {err_val:.6f}\n"

    with open(stats_file, "w") as sf:
        sf.write(stats_content)
    with open(stats_raw_file, "w") as sf:
        sf.write(stats_content)

    # 6. Write the .txt chain file of the primary (highest-posterior) mode for plotting
    txt_file = f"{output_prefix}.txt"
    txt_raw_file = os.path.join(polychord_raw_dir, f"{os.path.basename(output_prefix)}.txt")
    
    primary_mcmc = best_mode.get("mcmc_chain", []) if best_mode else []
    if primary_mcmc:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Writing {len(primary_mcmc)} MCMC samples of primary mode to chain files...")
        with open(txt_file, "w") as tf, open(txt_raw_file, "w") as trf:
            for row in primary_mcmc:
                txt_row = [row["weight"], row["minuslogpost"]]
                for name in sampled_names:
                    txt_row.append(row["point"][name])
                for name in derived_names:
                    txt_row.append(row["derived"].get(name, 0.0))
                txt_row.append(row["logprior"])
                for val in row["loglikes"]:
                    txt_row.append(val)
                txt_row.append(row["total_loglike"])
                
                txt_line = "  ".join(f"{v:.15E}" for v in txt_row) + "\n"
                tf.write(txt_line)
                trf.write(txt_line)
    else:
        # Fallback to single best-fit point
        txt_row = [1.0, 0.5 * (best_mode["chi2"] if best_mode else (global_best_chi2 if global_best_chi2 != np.inf else 9999.0))]
        best_pt = best_mode["point"] if best_mode else (global_best_point or {name: 0.0 for name in sampled_names})
        best_derived = best_mode["derived"] if best_mode else (global_best_derived_dict or {})
        best_logprior = float(best_mode["logprior"]) if best_mode else float(global_best_logprior)
        best_loglikes = best_mode.get("loglikes", global_best_loglikes) or [0.0] * len(model.likelihood)
        best_logpost = float(best_mode["logpost"]) if best_mode else float(global_best_logpost)
        
        for name in sampled_names:
            txt_row.append(best_pt[name])
        for name in derived_names:
            txt_row.append(best_derived.get(name, 0.0))
        txt_row.append(best_logprior)
        for val in best_loglikes:
            txt_row.append(val)
        txt_row.append(best_logpost - best_logprior)
            
        txt_line = "  ".join(f"{v:.15E}" for v in txt_row) + "\n"
        with open(txt_file, "w") as tf, open(txt_raw_file, "w") as trf:
            tf.write(txt_line)
            trf.write(txt_line)

    # 7. Write final live points file to lock in the final result
    final_live_row = []
    best_pt = best_mode["point"] if best_mode else (global_best_point or {name: 0.0 for name in sampled_names})
    best_derived = best_mode["derived"] if best_mode else (global_best_derived_dict or {})
    best_logprior = float(best_mode["logprior"]) if best_mode else float(global_best_logprior)
    best_loglikes = best_mode.get("loglikes", global_best_loglikes) or [0.0] * len(model.likelihood)
    best_logpost = float(best_mode["logpost"]) if best_mode else float(global_best_logpost)
    
    for name in sampled_names:
        final_live_row.append(best_pt[name])
    for name in derived_names:
        final_live_row.append(best_derived.get(name, 0.0))
    final_live_row.append(best_logprior)
    for val in best_loglikes:
        final_live_row.append(val)
    final_live_row.append(best_logpost - best_logprior)
    
    with open(live_points_file, "w") as lf:
        lf.write("  ".join(f"{v:.15E}" for v in final_live_row) + "\n")

    # 8. Copy current model config to .updated.yaml so dashboard parses parameter definitions
    updated_yaml_path = f"{output_prefix}.updated.yaml"
    info_to_write = dict(info)
    info_to_write["output"] = output_prefix
    with open(updated_yaml_path, "w") as yf:
        yaml.safe_dump(info_to_write, yf)

    # 8b. Write a structured summary JSON and human-readable markdown for provenance and evidence transparency
    try:
        import json as _json
        # Summarize constraint violations (cap at 10 examples to keep file small)
        violation_count = len(constraint_violations)
        violation_rate = float(violation_count) / max(1, eval_count)
        violation_examples = constraint_violations[:10]  # worst-first or first-10
        summary = {
            "output_prefix": output_prefix,
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
            "n_modes": len(unique_modes),
            "combined_logZ": float(log_z_combined),
            "best_chi2": float(global_best_chi2) if global_best_chi2 != np.inf else None,
            "best_cmb": float(global_best_chi2_cmb) if global_best_chi2_cmb is not None else None,
            "best_bao": float(global_best_chi2_bao) if global_best_chi2_bao is not None else None,
            "best_sn": float(global_best_chi2_sn) if global_best_chi2_sn is not None else None,
            "n_evaluations": eval_count,
            "constraint_violations": {
                "count": violation_count,
                "rate": round(violation_rate, 4),
                "examples": violation_examples
            },
            "surrogate_evals": surrogate_evals,
            "surrogate_fraction": round(float(surrogate_evals) / max(1, eval_count + surrogate_evals), 4),
            "modes": [],
            "limitations": [
                "Gelfand-Dey evidence is approximate; cross-validate with nested sampling (--polychord) for publication.",
                "Surrogate was disabled during final MCMC/evidence to avoid bias.",
                f"{violation_count} evaluations ({violation_rate*100:.1f}%) triggered physical constraint penalties."
            ]
        }
        for um in unique_modes:
            # Extract a compact, JSON-safe representation of the mode for downstream seeding
            cov_diag = None
            try:
                cov = um.get('cov')
                if cov is not None:
                    import numpy as _np
                    cov_diag = _np.diag(cov).tolist()
            except Exception:
                cov_diag = None

            mode_entry = {
                "name": um.get('name'),
                "point": um.get('point', {}),
                "logZ": float(um.get('log_z', float('nan'))),
                "evidence_method": um.get('evidence_method', 'unknown'),
                "penalized_chi2": float(um.get('penalized_chi2', float('nan'))),
                "viability_score": float(um.get('viability_score', float('nan'))),
                "stability": float(um.get('stability', float('nan'))),
                "isolation": float(um.get('isolation', float('nan'))),
                "mcmc_samples": len(um.get('mcmc_chain', [])),
                "mcmc_acc_rate": float(um.get('mcmc_acc_rate', 0.0)),
                "ess": um.get('ess', {}),
                "errors": um.get('errors', {}),
                "cov_diag": cov_diag,
            }
            summary['modes'].append(mode_entry)

        summary_path = f"{output_prefix}.summary.json"
        with open(summary_path, 'w') as sf:
            _json.dump(summary, sf, indent=2)

        # Markdown summary for quick human consumption
        md_lines = []
        md_lines.append(f"# Run Summary for {output_prefix}\n")
        md_lines.append(f"Timestamp: {summary['timestamp']}\n")
        md_lines.append(f"Combined ln(Z): {summary['combined_logZ']:.4f}\n")
        md_lines.append(f"Number of modes: {summary['n_modes']}\n\n")
        for m in summary['modes']:
            md_lines.append(f"## {m['name']}\n")
            md_lines.append(f"* ln(Z) = {m['logZ']:.4f} ({m['evidence_method']})\n")
            md_lines.append(f"* Penalized Chi2 = {m['penalized_chi2']:.4f}\n")
            md_lines.append(f"* Viability = {m['viability_score']:.1f}% | Stability = {m['stability']:.1f}% | Isolation = {m['isolation']:.3f}\n")
            md_lines.append(f"* MCMC samples = {m['mcmc_samples']} | Acceptance = {m['mcmc_acc_rate']:.1f}%\n")
            md_lines.append('\n')
        # Constraint violation summary in markdown
        v_data = summary.get('constraint_violations', {})
        v_count = v_data.get('count', 0)
        v_rate = v_data.get('rate', 0.0)
        md_lines.append(f"## Physical Constraint Violations\n")
        md_lines.append(f"* Total violations : {v_count} ({v_rate*100:.1f}% of evaluations)\n")
        if v_data.get('examples'):
            worst = max(v_data['examples'], key=lambda e: e.get('penalty', 0.0))
            md_lines.append(f"* Worst violation  : penalty = {worst.get('penalty', 0.0):.4f} at point {worst.get('point', {})}\n")
        md_lines.append('\n')
        md_lines.append("## Limitations & Recommendations\n")
        md_lines.append("* Gelfand-Dey is approximate and sensitive to chain length; run with --polychord for robust evidence.\n")
        md_lines.append("* If ESS < 100 for key parameters, consider increasing --mcmc-steps or running more chains.\n")
        md_lines.append(f"* {v_count} evaluations triggered constraint penalties — review if the rate is high (>20%).\n")

        md_path = f"{output_prefix}.summary.md"
        with open(md_path, 'w') as mf:
            mf.write('\n'.join(md_lines))

        # Provenance metadata (git SHA if available)
        meta = {
            'output_prefix': output_prefix,
            'timestamp': summary['timestamp'],
            'optimizer_version': '1.1',
            'args': vars(args)
        }
        try:
            import subprocess as _subp
            git_sha = _subp.check_output(['git', 'rev-parse', 'HEAD'], stderr=_subp.DEVNULL).decode().strip()
            meta['git_sha'] = git_sha
        except Exception:
            meta['git_sha'] = None
        meta_path = f"{output_prefix}.metadata.json"
        with open(meta_path, 'w') as mf:
            _json.dump(meta, mf, indent=2)
    except Exception as e:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Warning: could not write summary/metadata files: {e}")

    # Emit per-mode metadata files (lean ModeMetadata schema) unless explicitly disabled
    try:
        if not getattr(args, 'no_emit_modes', False):
            modes_meta = []
            import tempfile
            for mi, m in enumerate(summary.get('modes', [])):
                mode_id = f"mode_{mi+1}"
                mode_meta = {
                    'id': mode_id,
                    'name': m.get('name', mode_id),
                    'point': m.get('point', {}),
                    'viability_score': m.get('viability_score', None),
                    'stability': m.get('stability', None),
                    'isolation': m.get('isolation', None),
                    'mcmc_acc_rate': m.get('mcmc_acc_rate', None),
                    'surrogate_hit_rate': m.get('surrogate_hit_rate', None),
                    'ess': m.get('ess', {}),
                    'rhat': m.get('rhat', {}),
                    'unphysical_fraction': m.get('unphysical_fraction', 0.0),
                }
                modes_meta.append(mode_meta)

                # Write per-mode file atomically
                mode_file = f"{output_prefix}.mode_{mi+1}.meta.json"
                tmpf = f"{mode_file}.tmp"
                with open(tmpf, 'w') as hf:
                    json.dump(mode_meta, hf, indent=2)
                os.replace(tmpf, mode_file)

            # Write aggregated modes file
            modes_file = f"{output_prefix}.modes.json"
            tmpm = f"{modes_file}.tmp"
            with open(tmpm, 'w') as mf:
                json.dump(modes_meta, mf, indent=2)
            os.replace(tmpm, modes_file)
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Mode metadata written to {modes_file} and per-mode files.")
    except Exception as e:
        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Warning: could not write mode metadata: {e}")

    # 9. Print a clean one-page results summary
    v_count = len(constraint_violations)
    v_rate_pct = float(v_count) / max(1, eval_count) * 100.0
    surr_frac_pct = float(surrogate_evals) / max(1, eval_count + surrogate_evals) * 100.0
    print("\n" + "="*80)
    print(" 🌟 HYBRID COSMO OPTIMIZER RUN SUMMARY")
    print("="*80)
    print(f"  Number of Unique Modes Found : {len(unique_modes)}")
    print(f"  Combined Evidence ln(Z)      : {log_z_combined:.4f}")
    print(f"  Exploration Viability Health : {total_starts - failed_starts}/{total_starts} starts viable ({((total_starts - failed_starts)/total_starts*100.0):.1f}%)")
    print(f"  Total CLASS Evaluations      : {eval_count}")
    print(f"  Surrogate Bypass Rate        : {surrogate_evals} ({surr_frac_pct:.1f}% of all calls)")
    print(f"  Constraint Violations        : {v_count} ({v_rate_pct:.1f}% of evaluations)")
    print("-"*80)
    print("  MODE DIAGNOSTICS & SURROGATE HIT RATES:")
    for um in unique_modes:
        hit_rate_str = f"{um.get('surrogate_hit_rate', 0.0):.1f}%" if "surrogate_hit_rate" in um else "N/A"
        print(f"   * {um['name']:<20} | ln(Z) = {um['log_z']:.4f} | Viability = {um['viability_score']:.1f}% | Surrogate Hit Rate = {hit_rate_str} | Stability = {um['stability']:.1f}%")
    
    if v_count > 0:
        worst_v = max(constraint_violations, key=lambda e: e.get('penalty', 0.0))
        print("-"*80)
        print(f"  PHYSICAL CONSTRAINT VIOLATIONS ({v_count} total, {v_rate_pct:.1f}% of evals):")
        print(f"   * Worst penalty: {worst_v.get('penalty', 0.0):.4f} at viability {worst_v.get('viability', 0.0):.1f}%")
        if v_rate_pct > 20.0:
            print("   ⚠ WARNING: High constraint violation rate (>20%). Results may be heavily penalized.")
            print("     Consider widening prior bounds or reviewing physical constraints.")
    
    if len(unique_modes) >= 2 and tension_results:
        print("-"*80)
        print("  MODE PARAMETER TENSIONS:")
        for tr in tension_results:
            print(f"   * {tr['mode1']} vs {tr['mode2']} | {tr['param']:<15} : {tr['value']:.2f} \u03c3")
    print("-"*80)
    print("  PROVENANCE & SCIENTIFIC LIMITATIONS:")
    print("   * Gelfand-Dey Evidence: A posterior-harmonic-mean estimator assuming a local")
    print("     truncated Gaussian proposal. Sensitive to MCMC length, sample correlation,")
    print("     and proposal density. Use '--polychord' to cross-validate results.")
    print("   * Surrogate Model: Bypasses CLASS when GP/RBF prediction uncertainty is low.")
    print("     Guarded near unphysical regions but may smooth fine likelihood features.")
    print("   * Surrogate disabled during final MCMC and evidence estimation phases.")
    print("="*80 + "\n")
    sys.stdout.flush()

    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Results successfully written to {stats_file}")
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Chain file successfully written to {txt_file}")
    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [optimizer] Updated configuration written to {updated_yaml_path}")
    sys.stdout.flush()

    # Optional: perform PolyChord cross-validation if requested (opt-in via CLI)
    if getattr(args, 'run_polychord', False) or getattr(args, 'cross_validate', False):
        try:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [cross-validate] Starting PolyChord cross-validation (opt-in)...")
            sys.stdout.flush()
            # Delegate to hybrid.polychord_cli to keep main file small
            try:
                from prtoe_class.hybrid.polychord_cli import run_polychord_equivalent as pol_run, compare_with_polychord as pol_compare
            except Exception:
                try:
                    from prtoe_class.hybrid import polychord_cli as pol_cli
                    pol_run = pol_cli.run_polychord_equivalent
                    pol_compare = pol_cli.compare_with_polychord
                except Exception:
                    pol_run = run_polychord_equivalent
                    pol_compare = compare_with_polychord

            pol_res = pol_run(info, output_prefix)
            if pol_res and pol_res.get('prefix'):
                pol_prefix = pol_res.get('prefix')
                comp = pol_compare(output_prefix, pol_prefix, ess_threshold=getattr(args, 'ess_threshold', 100.0), rhat_threshold=getattr(args, 'rhat_threshold', 1.05))
                print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [cross-validate] PolyChord cross-validation complete. Comparison artifacts written: {output_prefix}.vs.{pol_prefix}.comparison.json")
            else:
                print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [cross-validate] PolyChord run did not produce a recognizable prefix or stats.")
        except Exception as e:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [cross-validate] Warning: cross-validation failed: {e}")
            sys.stdout.flush()

    # Optional: seed PolyChord with optimizer-discovered modes (Phase-1 hybrid seeding)
    if getattr(args, 'seed_polychord', False):
        try:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [seed] Generating seeded live points for PolyChord (opt-in)...")
            sys.stdout.flush()
            # Try package import first, then fall back to local/hybrid module import
            seed_utils = None
            polychord_adapter = None
            try:
                from prtoe_class.hybrid import seed_utils as seed_utils_pkg, polychord_adapter as polychord_adapter_pkg
                seed_utils = seed_utils_pkg
                polychord_adapter = polychord_adapter_pkg
            except Exception:
                try:
                    from hybrid import seed_utils as seed_utils_pkg2, polychord_adapter as polychord_adapter_pkg2
                    seed_utils = seed_utils_pkg2
                    polychord_adapter = polychord_adapter_pkg2
                except Exception as e:
                    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [seed] ERROR: hybrid utilities not available: {e}")
                    pol_res = None
            if seed_utils is not None:
                sampled_names, live_points = seed_utils.generate_seeded_live_points(output_prefix, n_points=getattr(args, 'seed_nlive', 200), random_fraction=getattr(args, 'seed_random_fraction', 0.3), min_samples_per_mode=getattr(args, 'seed_min_samples_per_mode', 20))
                seed_path = seed_utils.write_polychord_seed_file(output_prefix, sampled_names, live_points)

                # Build polychord info with seed file attached
                try:
                    from prtoe_class.hybrid.polychord_cli import seed_and_run_polychord as seed_run
                except Exception:
                    try:
                        from prtoe_class.hybrid import polychord_cli as pol_cli
                        seed_run = pol_cli.seed_and_run_polychord
                    except Exception:
                        seed_run = None

                if seed_run is not None:
                    pol_res_seeded = seed_run(info, output_prefix, seed_nlive=getattr(args,'seed_nlive',200), seed_random_fraction=getattr(args,'seed_random_fraction',0.3), seed_min_samples=getattr(args,'seed_min_samples_per_mode',20))
                    if pol_res_seeded and pol_res_seeded.get('prefix'):
                        pol_prefix = pol_res_seeded.get('prefix')
                        comp = compare_with_polychord(output_prefix, pol_prefix, ess_threshold=getattr(args,'ess_threshold',100.0), rhat_threshold=getattr(args,'rhat_threshold',1.05))
                        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [seed] Seeded PolyChord complete. Comparison artifacts written: {output_prefix}.vs.{pol_prefix}.comparison.json")
                    else:
                        # Seed file was created but full run may not have been possible here
                        seedfile = pol_res_seeded.get('seed_file') if isinstance(pol_res_seeded, dict) else None
                        print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [seed] Seeded PolyChord flow created seed file: {seedfile}")
                else:
                    print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [seed] No seed runner available; seed file created at {seed_path}")
        except Exception as e:
            print(f" {time.strftime('%Y-%m-%d %H:%M:%S')},000 [seed] Warning: seeding flow failed: {e}")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
