"""Helpers to run Polychord/Cobaya in a safe, optional way and compare outputs.
This module is opt-in and robust to missing cobaya/polychord. It focuses on running cobaya.run when available,
writing metadata, and producing comparison artifacts.
"""
import copy
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# BUG-24 fix: single source of truth for the default PolyChord nlive.
# polychord_adapter.py imports this so both code paths stay in sync.
DEFAULT_NLIVE: int = 250


def run_polychord_equivalent(info_cfg, output_prefix, polychord_opts=None):
    """Run a PolyChord-equivalent nested sampling job using the same model/prior setup.
    Returns dict with keys: prefix, stats, updated_info or None if cobaya unavailable or run failed.
    """
    try:
        from cobaya.run import run as cobaya_run
    except Exception:
        print("[polychord_cli] Warning: cobaya.run not available; cannot run PolyChord.")
        return None

    pol_info = copy.deepcopy(info_cfg)
    # Ensure sampler settings for PolyChord are sensible for cross-checks
    pol_info["sampler"] = {
        "polychord": {
            "nlive": DEFAULT_NLIVE,
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

    print(f" [polychord_cli] Running PolyChord cross-check -> prefix: {output_prefix}_polychord")
    try:
        updated_info, sampler = cobaya_run(pol_info)
    except Exception as e:
        print(f" [polychord_cli] PolyChord run failed: {e}")
        return None

    # After run, parse stats using the centralized adapter
    pol_prefix = f"{output_prefix}_polychord"
    stats = None
    try:
        from prtoe_class.backend.parsers_adapter import parse_polychord_stats
        stats_path = Path(f"{pol_prefix}.stats")
        resume_path = Path(os.path.join(os.path.dirname(pol_prefix), f"{os.path.basename(pol_prefix)}.resume"))
        stats = parse_polychord_stats(stats_path, resume_path)
    except Exception:
        stats = None

    return {"prefix": pol_prefix, "stats": stats, "updated_info": updated_info}


def compare_with_polychord(optimizer_prefix, polychord_prefix, ess_threshold=100.0, rhat_threshold=1.05):
    """Compare optimizer outputs to PolyChord run. Produces a JSON+MD summary similar to previous helper.
    """
    comp = {
        "optimizer_prefix": optimizer_prefix,
        "polychord_prefix": polychord_prefix,
        "delta_chi2": None,
        "delta_logZ": None,
        "parameter_shifts": {},
        "notes": []
    }

    # Load optimizer summary
    opt = None
    try:
        opt_summary_file = Path(f"{optimizer_prefix}.summary.json")
        if opt_summary_file.exists():
            with open(opt_summary_file, 'r') as f:
                opt = json.load(f)
    except Exception:
        opt = None

    # Load polychord summary or parse stats
    pol = None
    try:
        pol_summary_file = Path(f"{polychord_prefix}.summary.json")
        if pol_summary_file.exists():
            with open(pol_summary_file, 'r') as f:
                pol = json.load(f)
        else:
            # Fallback: parse polychord stats via adapter
            from prtoe_class.backend.parsers_adapter import parse_polychord_stats
            stats_file = Path(f"{polychord_prefix}.stats")
            pol_stats = parse_polychord_stats(stats_file, None)
            pol = {"stats": pol_stats} if pol_stats else None
    except Exception:
        pol = None

    # Delta chi2
    try:
        opt_chi2 = opt.get('best_fit', {}).get('penalized_chi2') if opt else None
        pol_chi2 = pol.get('best_fit', {}).get('penalized_chi2') if pol and 'best_fit' in pol else None
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

    # Parameter shifts
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

    # Write comparison artifacts atomically (tmp → rename) to avoid partial JSON on failure
    try:
        pol_name = Path(polychord_prefix).name
        cmp_json = Path(f"{optimizer_prefix}.vs.{pol_name}.comparison.json")
        tmp_json = cmp_json.with_suffix('.tmp')
        with open(tmp_json, 'w') as f:
            json.dump(comp, f, indent=2)
        tmp_json.rename(cmp_json)

        cmp_md = Path(f"{optimizer_prefix}.vs.{pol_name}.comparison.md")
        tmp_md = cmp_md.with_suffix('.tmp')
        with open(tmp_md, 'w') as f:
            f.write(f"Comparison: {Path(optimizer_prefix).name} vs {pol_name}\n\n")
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
        tmp_md.rename(cmp_md)
    except Exception as exc:
        logger.warning('Could not write comparison artifacts: %s', exc)

    return comp


def seed_and_run_polychord(info, output_prefix, seed_nlive=200, seed_random_fraction=0.3, seed_min_samples=20):
    """Generate seeded live points using hybrid.seed_utils, build Polychord info if adapter exists, and attempt to run.
    Returns the polychord run result (same as run_polychord_equivalent) or None.
    """
    try:
        from prtoe_class.hybrid import seed_utils, polychord_adapter
    except Exception:
        try:
            from hybrid import seed_utils, polychord_adapter
        except Exception as e:
            logger.error("hybrid utilities not available: %s", e)
            return None

    # BUG-21 fix: wrap seeding calls explicitly so partial failures have clear context
    try:
        sampled_names, live_points = seed_utils.generate_seeded_live_points(
            output_prefix, n_points=seed_nlive,
            random_fraction=seed_random_fraction,
            min_samples_per_mode=seed_min_samples
        )
        seed_path = seed_utils.write_polychord_seed_file(output_prefix, sampled_names, live_points)
    except Exception as exc:
        logger.error("Seeding failed (no seed file produced): %s", exc)
        return {'error': f'Seeding failed: {exc}', 'seed_file': None}

    # Build polychord info if adapter available
    pol_info = None
    try:
        pol_info = polychord_adapter.build_polychord_info(info, output_prefix, seed_file=seed_path, nlive=seed_nlive)
    except Exception as exc:
        logger.warning("polychord_adapter.build_polychord_info failed: %s", exc)

    # BUG-22 fix: if pol_info is None, don't call cobaya_run with empty dict
    if pol_info is None:
        logger.warning("pol_info is None (adapter failed); seed file written but PolyChord cannot be launched.")
        return {'seed_file': seed_path, 'pol_info': None, 'error': 'build_polychord_info failed'}

    # Try to run via cobaya.run if possible
    try:
        from cobaya.run import run as cobaya_run
    except Exception:
        logger.info('cobaya.run not available; seed file written but cannot launch Polychord here.')
        return {'seed_file': seed_path, 'pol_info': pol_info}

    try:
        updated_info, sampler = cobaya_run(pol_info)
        pol_prefix = f"{output_prefix}_polychord"
        return {'prefix': pol_prefix, 'updated_info': updated_info, 'seed_file': seed_path}
    except Exception as e:
        logger.error("Seeded PolyChord run failed: %s", e)
        return {'seed_file': seed_path, 'pol_info': pol_info, 'error': str(e)}
