import os
import shutil
import getdist
from getdist import plots, MCSamples
import matplotlib.pyplot as plt
import numpy as np
import glob
import argparse
import time
import requests
import yaml

def stop_running_cobaya():
    """Sends a request to the dashboard backend to stop the current run."""
    api_url = 'http://localhost:8000/api/stop_run'
    try:
        print("\nAttempting to send stop signal to Cobaya run via dashboard API...")
        response = requests.post(api_url)
        if response.status_code == 200:
            print("Successfully sent stop signal. The run should terminate shortly.")
        else:
            print(f"Failed to send stop signal. Status: {response.status_code}, Response: {response.text}")
    except requests.exceptions.ConnectionError:
        print("\nERROR: Could not connect to the CosmicDashboard backend at http://localhost:8000.")
        print("Please ensure the backend server is running to use the auto-stop feature.")

def send_dashboard_log(message):
    """Sends a log message to the dashboard UI."""
    try:
        requests.post('http://localhost:8000/api/log', json={"message": message})
    except Exception:
        pass # Fail silently if dashboard isn't running

def get_best_fit_from_log(log_path):
    """Parses the log file to extract real-time evaluations and find the best fit chi2 and parameters."""
    if not log_path or not os.path.exists(log_path):
        return None
    import re
    import ast
    best_chi2 = float('inf')
    best_params = {}
    pattern = re.compile(r"Computed derived parameters:\s*(\{.*\})")
    try:
        with open(log_path, 'r') as f:
            for line in f:
                match = pattern.search(line)
                if match:
                    try:
                        params_dict = ast.literal_eval(match.group(1))
                        chi2_keys = [k for k in params_dict.keys() if k.startswith('chi2__')]
                        if chi2_keys:
                            cmb_vals = [params_dict[k] for k in chi2_keys if 'cmb' in k.lower() or 'planck' in k.lower()]
                            bao_vals = [params_dict[k] for k in chi2_keys if 'bao' in k.lower()]
                            sn_vals = [params_dict[k] for k in chi2_keys if 'sn' in k.lower() or 'pantheon' in k.lower() or 'shoes' in k.lower()]
                            
                            cmb_sum = sum(cmb_vals) if cmb_vals else None
                            bao_sum = sum(bao_vals) if bao_vals else None
                            sn_sum = sum(sn_vals) if sn_vals else None
                            
                            chi2_bao = params_dict.get('chi2__BAO', bao_sum)
                            chi2_cmb = params_dict.get('chi2__CMB', cmb_sum)
                            chi2_sn = params_dict.get('chi2__SN', sn_sum)
                            
                            tot = (chi2_bao or 0.0) + (chi2_cmb or 0.0) + (chi2_sn or 0.0)
                            if tot == 0.0:
                                tot = sum([params_dict[k] for k in chi2_keys])
                                
                            if tot < best_chi2:
                                best_chi2 = tot
                                best_params = params_dict
                    except Exception:
                        continue
    except Exception:
        pass
    if best_chi2 != float('inf'):
        return best_chi2, best_params
    return None

def get_output_prefix_from_yaml(config_path):
    """Parses the YAML file to find the 'output' key."""
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            if 'output' in config:
                return config['output']
    except Exception:
        pass
    # Fallback if not found
    return os.path.join("chains", "prtoe_polychord")

def main(args, first_run=False):
    # Dynamically determine the output prefix from the active YAML
    output_prefix = get_output_prefix_from_yaml(args.config)

    if first_run:
        prefix_path = os.path.basename(output_prefix)
        raw_path = os.path.join(os.path.dirname(output_prefix), f"{prefix_path}_polychord_raw", f"{prefix_path}.txt")
        print("-" * 60)
        print("Monitoring for chain files based on 'uploaded_config.yaml':")
        print(f"  - In-progress chain: {raw_path}")
        print(f"  - Final chain:       {output_prefix}.txt")
        print("-" * 60)

    # Check if run is finished (files in chains/) or still running (files in _polychord_raw/)
    root_finished = output_prefix
    root_raw = os.path.join(os.path.dirname(output_prefix), f"{os.path.basename(output_prefix)}_polychord_raw", os.path.basename(output_prefix))

    data = None
    data_parts = []
    is_initialization = False
    
    # Check for completed chains first
    if os.path.exists(root_finished + ".txt") and os.path.getsize(root_finished + ".txt") > 0:
        root_name = root_finished
        with open(root_name + ".txt", "r") as f:
            lines = f.readlines()
        if len(lines) > 1:
            d = np.loadtxt(lines[:-1])
            if d.size > 0: data_parts.append(np.atleast_2d(d))
    else:
        # If not finished, read the raw dead points AND live points from PolyChord
        raw_dead = root_raw + ".txt"
        raw_live = root_raw + "_phys_live.txt"
        
        if os.path.exists(raw_dead) and os.path.getsize(raw_dead) > 0:
            with open(raw_dead, "r") as f:
                lines = f.readlines()
            if len(lines) > 1:
                d = np.loadtxt(lines[:-1])
                if d.size > 0: data_parts.append(np.atleast_2d(d))
                
        # Only use live points if dead points are not yet populated (Initialization Phase)
        if not data_parts and os.path.exists(raw_live) and os.path.getsize(raw_live) > 0:
            is_initialization = True
            with open(raw_live, "r") as f:
                lines = f.readlines()
            if len(lines) > 1:
                d = np.loadtxt(lines[:-1])
                if d.size > 0:
                    d = np.atleast_2d(d)
                    # phys_live format is [p1..pN, logL]. Mock it to [weight, -2logL, p1..pN]
                    weights = np.ones((d.shape[0], 1))
                    logL = -2.0 * d[:, -1:]  # -2 logL to match PolyChord's raw chain Col 1 format!
                    params = d[:, :-1]
                    d_mock = np.hstack((weights, logL, params))
                    data_parts.append(d_mock)
                
        root_name = root_raw
        
    if not data_parts:
        if args.monitor_and_stop:
            print("Waiting for chain files (or live points) to be created...")
            return
        else:
            print(f"Error: Could not find chain files for {root_finished} or in the raw PolyChord folder.")
            return

    print(f"\n[{time.ctime()}] Loading data from {root_name} (including live points if active)...")
    try:
        data = data_parts[0]
        
        # PolyChord format: Col 0 = weight, Col 1 = -2 log(Likelihood), Col 2+ = Parameters
        weights = data[:, 0]
        loglikes = data[:, 1]
        samps = data[:, 2:]
        
        is_raw = is_initialization or not (os.path.exists(root_finished + ".txt") and os.path.getsize(root_finished + ".txt") > 0)
        
        # 2. Dynamically load parameter names from the .paramnames file
        names = []
        labels = []
        
        if not is_raw:
            paramnames_file = root_finished + ".paramnames"
            if os.path.exists(paramnames_file):
                with open(paramnames_file, "r") as f:
                    for line in f:
                        parts = line.strip().split(None, 1)
                        if parts:
                            names.append(parts[0])
                            labels.append(parts[1].strip().replace('*', '') if len(parts) > 1 else parts[0])

        # Fallback to updated.yaml for raw or missing paramnames
        if not names:
            updated_yaml = root_finished + ".updated.yaml"
            if os.path.exists(updated_yaml):
                try:
                    with open(updated_yaml, 'r') as f:
                        up_cfg = yaml.safe_load(f)
                    if 'params' in up_cfg:
                        params = up_cfg.get('params', {})
                        likelihoods = up_cfg.get('likelihood', {})
                        
                        sampled = []
                        derived = []
                        
                        for name, p_dict in params.items():
                            if not isinstance(p_dict, dict):
                                continue
                            if 'value' in p_dict:
                                val = p_dict['value']
                                if isinstance(val, str) and 'lambda' in val:
                                    derived.append(name)
                            elif 'prior' in p_dict:
                                sampled.append(name)
                            else:
                                derived.append(name)
                                
                        if is_raw:
                            priors = ["logprior__0"]
                            likes = [f"loglike__{name}" for name in likelihoods.keys()]
                            names = sampled + derived + priors + likes
                        else:
                            sampled_clean = [p for p in sampled if not params[p].get('drop')]
                            names = sampled_clean + derived
                            
                        labels = []
                        for name in names:
                            p_dict = params.get(name)
                            label = name
                            if isinstance(p_dict, dict):
                                label = p_dict.get('latex', name)
                            elif name.startswith("loglike__"):
                                l_name = name.replace("loglike__", "")
                                label = r"\log\mathcal{L}_\mathrm{" + l_name.replace("_", r"\ ") + r"}"
                            elif name.startswith("logprior__"):
                                label = r"\log\pi_0"
                            labels.append(label)
                except Exception as e:
                    print(f"Error parsing updated.yaml: {e}")

        # Ensure dimensions match
        if len(names) > samps.shape[1]:
            names = names[:samps.shape[1]]
            labels = labels[:samps.shape[1]]
        while len(names) < samps.shape[1]:
            names.append(f"param_{len(names)}")
            labels.append(f"param_{len(labels)}")
            
        print(f"Data successfully loaded: {samps.shape[0]} points, {samps.shape[1]} parameters.")
        
        # --- BEST-FIT PARAMETER EXTRACTION ---
        best_idx = np.argmin(loglikes)
        best_chi2 = loglikes[best_idx]
        
        # Look for a better fit or derived parameters in the log file
        log_fit = get_best_fit_from_log(root_finished + ".log")
        use_log_params = False
        if log_fit:
            log_best_chi2, log_best_params = log_fit
            if is_initialization or log_best_chi2 < best_chi2:
                best_chi2 = log_best_chi2
                use_log_params = True
        
        print("="*60)
        print(f"CURRENT BEST-FIT PARAMETERS (chi2 = {best_chi2:.4f})")
        print("-" * 60)
        for i, name in enumerate(names):
            if use_log_params and name in log_best_params:
                print(f"{name:<20} : {log_best_params[name]:.6g}")
            else:
                print(f"{name:<20} : {samps[best_idx, i]:.6g}")
        print("="*60 + "\n")

        # --- FILTER FOR MEANINGFUL POINTS ---
        # To avoid false alarms, we only audit boundaries against "good" points that the 
        # sampler actually wants to keep (e.g. within d(chi2) < 30 of the best-fit, or the top 20%)
        threshold = best_chi2 + 30.0
        good_indices = loglikes < threshold
        if np.sum(good_indices) < len(loglikes) * 0.2:
            good_indices = np.argsort(loglikes)[:max(1, int(len(loglikes)*0.2))]
        good_samps = samps[good_indices]
        if len(good_samps) == 0:
            good_samps = samps

        # --- PRIOR BOUNDS AUDIT ---
        # Define hard physical limits that the sampler should NEVER exceed
        # This prevents the auto-updater from pushing parameters into the DHOST wall
        HARD_LIMITS = {
            'xi_prtoe': (1.0e-7, 1.2e-5),
            'm_ncdm': (0.0, 0.15)
        }
        
        # Dynamically read the current prior bounds from the active YAML config
        prior_bounds = {}
        if not is_initialization:
            yaml_path = args.config
            if os.path.exists(yaml_path):
                try:
                    with open(yaml_path, 'r') as f:
                        config = yaml.safe_load(f)
                        if 'params' in config:
                            for p_name, p_dict in config['params'].items():
                                if isinstance(p_dict, dict) and 'prior' in p_dict and isinstance(p_dict['prior'], dict):
                                    if 'min' in p_dict['prior'] and 'max' in p_dict['prior']:
                                        prior_bounds[p_name] = (float(p_dict['prior']['min']), float(p_dict['prior']['max']))
                except Exception:
                    pass

        audit_lines = []
        audit_lines.append("\n" + "="*125)
        audit_lines.append("[MONITOR] PRIOR BOUNDS AUDIT REPORT")
        
        has_warnings = False
        dash_warnings = []
        proposed_new_bounds = {}
        dash_alerts = []

        if is_initialization:
            audit_lines.append("SKIPPED: Sampler is in Initialization Phase (points naturally span the entire prior).")
            audit_lines.append("="*125 + "\n")
        else:
            audit_lines.append("="*125)
            audit_lines.append(f"{'Parameter':<15} | {'Prior Min':<10} | {'Sample Min':<10} | {'Sample Max':<10} | {'Prior Max':<10} | {'Status':<35} | {'Suggestion'}")
            audit_lines.append("-" * 125)
            for i, name in enumerate(names):
                if name in prior_bounds:
                    p_min, p_max = prior_bounds[name]
                    s_min = np.min(good_samps[:, i])
                    s_max = np.max(good_samps[:, i])
                    
                    range_span = p_max - p_min
                    sample_range = s_max - s_min
                    
                    status_list = []
                    suggestion_list = []

                    # Check lower bound
                    if range_span > 0 and s_min < p_min + 0.05 * range_span:
                        if name in HARD_LIMITS and p_min <= HARD_LIMITS[name][0]:
                            status_list.append("Lower Bound (HARD LIMIT)")
                            new_min = p_min
                        else:
                            status_list.append("Lower Bound")
                            # Suggest a new bound with 20% headroom based on the sampled range
                            headroom = 0.2 * sample_range if sample_range > 0 else 0.1 * range_span
                            new_min = s_min - headroom
                            if name in HARD_LIMITS: new_min = max(new_min, HARD_LIMITS[name][0])
                            suggestion_list.append(f"min -> {new_min:.4g}")
                    else:
                        new_min = p_min

                    # Check upper bound
                    if range_span > 0 and s_max > p_max - 0.05 * range_span:
                        if name in HARD_LIMITS and p_max >= HARD_LIMITS[name][1]:
                            status_list.append("Upper Bound (HARD LIMIT)")
                            new_max = p_max
                        else:
                            status_list.append("Upper Bound")
                            headroom = 0.2 * sample_range if sample_range > 0 else 0.1 * range_span
                            new_max = s_max + headroom
                            if name in HARD_LIMITS: new_max = min(new_max, HARD_LIMITS[name][1])
                            suggestion_list.append(f"max -> {new_max:.4g}")
                    else:
                        new_max = p_max
                    
                    if status_list:
                        if suggestion_list:
                            has_warnings = True
                            proposed_new_bounds[name] = (new_min, new_max)
                            dash_warnings.append(f"{name} hitting {' & '.join(status_list)}")
                            status = f"WARNING: Hitting {' & '.join(status_list)}!"
                        else:
                            status = f"INFO: Hitting {' & '.join(status_list)}"
                    else:
                        # If not hitting bounds, check if the prior is unnecessarily wide (< 10% of space used)
                        if range_span > 0 and sample_range > 0 and sample_range < 0.1 * range_span:
                            status = "INFO: Prior too wide"
                            new_min_tight = max(p_min, s_min - 0.2 * sample_range)
                            new_max_tight = min(p_max, s_max + 0.2 * sample_range)
                            suggestion_list.append(f"tighten -> [{new_min_tight:.4g}, {new_max_tight:.4g}]")
                        else:
                            status = "OK"

                    suggestion = ", ".join(suggestion_list) if suggestion_list else "None"

                    if status != "OK":
                        dash_alerts.append({
                            "parameter": name,
                            "status": status,
                            "suggestion": suggestion,
                            "new_min": float(f"{new_min:.4g}"),
                            "new_max": float(f"{new_max:.4g}")
                        })

                    audit_lines.append(f"{name:<15} | {p_min:<10.4g} | {s_min:<10.4g} | {s_max:<10.4g} | {p_max:<10.4g} | {status:<35} | {suggestion}")
            audit_lines.append("="*125 + "\n")
        
        # Print to terminal and append to the active log file so it appears in the CosmicDashboard
        audit_output = "\n".join(audit_lines)
        print(audit_output)
        try:
            # Safely clear the terminal log so the UI doesn't lag from thousands of lines of output
            open(f"{output_prefix}.log", "w").close()
            with open(f"{output_prefix}.log", "a") as lf:
                lf.write(audit_output + "\n")
        except Exception:
            pass

        # Send structured payload to the Dashboard Watchdog API
        try:
            requests.post('http://localhost:8000/api/watchdog', json={"alerts": dash_alerts})
        except Exception:
            pass
        # --------------------------

        if args.monitor_and_stop and has_warnings:
            warning_msg = (
                "\n" + "!"*85 + "\n"
                "! WATCHDOG ALERT: Good-fit samples are piling up against prior boundaries.\n"
                "! Recommendations have been sent to the CosmicDashboard for your review.\n"
                + "!"*85 + "\n"
            )
            print(warning_msg, end="")
            try:
                with open(f"{output_prefix}.log", "a") as lf:
                    lf.write(warning_msg)
            except Exception:
                pass
            
            dash_msg = "Prior hit! Auto-updating YAML and restarting. Issues: " + ", ".join(dash_warnings)
            send_dashboard_log(dash_msg)
            
            update_yaml_priors(proposed_new_bounds, args.config)
            
            print("\nTriggering Dashboard Backend to handle clean restart sequence...")
            try:
                # Use a short timeout because the backend will kill this script during the stop phase
                requests.post('http://localhost:8000/api/watchdog_restart', json={"config_name": args.config}, timeout=2)
            except requests.exceptions.Timeout:
                pass
            except Exception as e:
                print(f"Failed to trigger watchdog restart: {e}")
                
            import sys
            sys.exit(0) # Exit the script immediately

        # 3. Create the GetDist MCSamples object directly in memory
        # We override weights to 1.0 because N_eff is too low for KDE contours right now.
        print("NOTE: Forcing weights to 1.0 to reveal the raw geometry of the degeneracy valley.")
        samples = MCSamples(samples=samps, weights=np.ones_like(weights), loglikes=loglikes, names=names, labels=labels)
        
        # Parameters we want to visualize
        params_to_plot = ['H0', 'omega_cdm', 'delta_prtoe', 'xi_prtoe', 'log_beta_prtoe', 'zeta_prtoe', 'sigma8', 'S8']
        existing_params = [p for p in params_to_plot if p in samples.getParamNames().list()]
        
        print(f"Plotting contours for: {existing_params}")
        if not existing_params:
            print("Requested parameters not found. Plotting first 4 parameters instead.")
            existing_params = names[:4]
            
        # 4. Plot
        plt.style.use('dark_background')
        g = plots.get_subplot_plotter(width_inch=10)
        g.settings.figure_legend_frame = False
        g.settings.title_limit_fontsize = 12
        g.triangle_plot([samples], existing_params, filled=True, title_limit=1, contour_colors=['#00d2d3'])
        
        output_file = "prtoe_posteriors.png"
        g.export(output_file)
        print(f"Plot successfully saved to {output_file}!")
        
        # --- COMPREHENSIVE SUMMARY GENERATION ---
        summary_file = f"{output_prefix}_summary.txt"
        print(f"Generating comprehensive summary file at {summary_file}...")
        try:
            with open(summary_file, "w") as f:
                f.write("="*80 + "\n")
                f.write(" COSMIC DASHBOARD - RUN SUMMARY\n")
                f.write("="*80 + "\n\n")
                f.write(f"Configuration: {args.config}\n")
                f.write(f"Output Prefix: {output_prefix}\n")
                f.write(f"Total Samples: {samps.shape[0]}\n\n")
                
                f.write("-" * 60 + "\n")
                f.write(f" BEST-FIT POINT (Total chi2 = {best_chi2:.4f})\n")
                f.write("-" * 60 + "\n")
                for i, name in enumerate(names):
                    f.write(f"{name:<20} : {samps[best_idx, i]:.6g}\n")
                f.write("\n")
                
                f.write("-" * 60 + "\n")
                f.write(" PARAMETER CONSTRAINTS (Mean & 1-Sigma)\n")
                f.write("-" * 60 + "\n")
                try:
                    marge = samples.getMargeStats()
                    for p in marge.names:
                        f.write(f"{p.name:<20} : {p.mean:.6g}  +/-  {p.err:.6g}\n")
                except Exception as e:
                    f.write(f"Could not generate constraints: {e}\n")
                f.write("\n")
                
        except Exception as e:
            print(f"Error generating summary file: {e}")
            
    except Exception as e:
        print(f"Error loading samples or plotting: {e}")
    finally:
        plt.close('all')

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Plot chains and/or monitor for prior boundary issues.")
    parser.add_argument('--config', type=str, default='uploaded_config.yaml', help='The YAML configuration file to monitor.')
    parser.add_argument('--monitor-and-stop', action='store_true', help='Run in a loop to monitor prior boundaries and auto-stop the run if they are hit.')
    parser.add_argument('--interval', type=int, default=300, help='Check interval in seconds for monitoring mode (default: 300s / 5min).')
    
    args = parser.parse_args()

    if args.monitor_and_stop:
        print("Starting in MONITOR mode. The script will now periodically check for prior boundary issues.")
        print(f"Check interval is set to {args.interval} seconds.")
        first_run = True
        while True:
            main(args, first_run=first_run)
            first_run = False # Only print the startup message once

            # Dynamically determine raw folder path to check for run completion
            output_prefix = get_output_prefix_from_yaml(args.config)
            final_txt = output_prefix + ".txt"
            if os.path.exists(final_txt) and os.path.getsize(final_txt) > 0:
                 # Run one final time to ensure the plot reflects the exact completed chain
                 main(args, first_run=False)
                 print("\n[MONITOR] Run appears to have completed successfully (final chains found). Exiting monitor.")
                 break
            time.sleep(args.interval)
    else:
        main(args, first_run=False)