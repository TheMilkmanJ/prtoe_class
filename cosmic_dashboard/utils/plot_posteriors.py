import sys
import re
import ast
import glob
import getdist
from getdist import plots, mcsamples
import matplotlib.pyplot as plt
import os

def find_log_file(prefix):
    # Try direct .log extension
    possible_log = prefix + ".log"
    if os.path.exists(possible_log):
        return possible_log
    # Try appending chord.log or similar
    possible_log = prefix + "chord.log"
    if os.path.exists(possible_log):
        return possible_log
    # Try replacing '_poly' or '_poly_optimized' and checking for .log
    base = prefix
    for suffix in ["_poly_optimized", "_poly", "_polychord"]:
        if base.endswith(suffix):
            base = base[:-len(suffix)]
            break
    possible_log = base + ".log"
    if os.path.exists(possible_log):
        return possible_log
        
    # Check in chains/ directory for any .log file matching the name prefix
    chains_dir = os.path.dirname(prefix)
    if os.path.exists(chains_dir):
        base_name = os.path.basename(prefix).split('_')[0] # e.g. 'prtoe' or 'lcdm'
        logs = glob.glob(os.path.join(chains_dir, f"*{base_name}*.log"))
        if logs:
            return logs[0]
    return None

def extract_chi2_from_log(log_path):
    if not log_path or not os.path.exists(log_path):
        return None, []
    
    chi2_sequences = []
    # We match lines like: Computed derived parameters: {'A_s': ..., 'chi2__BAO': 290.87, 'chi2__CMB': 21473.0, 'chi2__SN': 1476.6}
    pattern = re.compile(r"Computed derived parameters:\s*(\{.*\})")
    
    with open(log_path, 'r') as f:
        for line in f:
            match = pattern.search(line)
            if match:
                try:
                    params_dict = ast.literal_eval(match.group(1))
                    # Extract keys starting with chi2__
                    chi2_dict = {k: v for k, v in params_dict.items() if k.startswith('chi2__')}
                    if chi2_dict:
                        # Sort keys to ensure consistent order (e.g. BAO, CMB, SN)
                        sorted_keys = sorted(chi2_dict.keys())
                        sequence = [chi2_dict[k] for k in sorted_keys]
                        total_chi2 = sum(sequence)
                        chi2_sequences.append({
                            'keys': sorted_keys,
                            'sequence': sequence,
                            'total': total_chi2,
                            'dict': chi2_dict
                        })
                except Exception:
                    continue
                    
    if not chi2_sequences:
        return None, []
        
    # Find the best-fit sequence (minimum total chi2)
    best_fit = min(chi2_sequences, key=lambda x: x['total'])
    return best_fit, chi2_sequences

def main():
    # Define paths
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    lcdm_prefix = os.path.join(project_dir, "lcdm_poly")

    # Fallback to chains/ directory if moved
    if not os.path.exists(lcdm_prefix + ".1.txt") and not os.path.exists(lcdm_prefix + ".txt"):
        lcdm_prefix = os.path.join(project_dir, "chains", "lcdm_poly")

    prtoe_prefix = os.path.join(project_dir, "chains", "prtoe_poly_optimized")

    # --- Chi2 Extraction and Auditing from Terminal Log Files ---
    print("=" * 80)
    print(" COSMIC MONITOR - CHI2 LOG AUDIT REPORT")
    print("=" * 80)

    for model_name, prefix in [("ΛCDM Baseline", lcdm_prefix), ("PRTOE Optimized", prtoe_prefix)]:
        log_file = find_log_file(prefix)
        if not log_file:
            print(f"[{model_name}] No log file found matching prefix '{prefix}'.")
            continue
            
        print(f"\nSearching log file for {model_name}: {log_file}")
        best_fit, all_sequences = extract_chi2_from_log(log_file)
        
        if not best_fit:
            print(f"[{model_name}] No chi2 sequences found in the log.")
            continue
            
        # Print best-fit chi2
        print(f"[{model_name}] Found {len(all_sequences)} evaluation(s) with chi2 parameters.")
        print(f"[{model_name}] Best-Fit Chi2 (Total: {best_fit['total']:.4f}):")
        for k in best_fit['keys']:
            short_k = k.replace('chi2__', '')
            print(f"  - {short_k}: {best_fit['dict'][k]:.4f}")
            
        # Print all raw sequences (full sequence as singular groups, not mixed)
        print(f"[{model_name}] Raw Chi2 Sequences (Full Groups):")
        for idx, seq in enumerate(all_sequences):
            seq_str = ", ".join([f"{k.replace('chi2__', '')}={v:.4f}" for k, v in seq['dict'].items()])
            print(f"  Evaluation {idx + 1:3d}: [{seq_str}] (Total={seq['total']:.4f})")

    print("=" * 80)
    print()

    # --- Plotting Phase ---
    if not os.path.exists(lcdm_prefix + ".1.txt") and not os.path.exists(lcdm_prefix + ".txt"):
        print(f"Error: Final chain files not found for prefix '{lcdm_prefix}'.")
        print("LCDM PolyChord is likely still running! Cobaya only generates the final .txt files once nested sampling has finished.")
        sys.exit(1)

    if not os.path.exists(prtoe_prefix + ".1.txt") and not os.path.exists(prtoe_prefix + ".txt"):
        print(f"Error: Final chain files not found for prefix '{prtoe_prefix}'.")
        print("PRTOE PolyChord is likely still running! Please wait for both runs to finish before plotting.")
        sys.exit(1)

    print("Loading chain samples for plotting...")
    # Load the LCDM samples (ignoring the first 30% of the chain as burn-in)
    lcdm_samples = getdist.mcsamples.loadMCSamples(lcdm_prefix, settings={'ignore_rows': 0.3})

    # Load the PRTOE samples
    prtoe_samples = getdist.mcsamples.loadMCSamples(prtoe_prefix, settings={'ignore_rows': 0.3})

    # Parameters we want to visualize
    params = ['omega_b', 'omega_cdm', 'H0', 'n_s', 'z_reio']

    # Generate the corner plot
    g = plots.get_subplot_plotter()
    g.triangle_plot([lcdm_samples, prtoe_samples], params, filled=True, legend_labels=[r'$\Lambda$CDM Baseline', 'PRTOE Optimized'])

    # Save the figure
    output_path = os.path.join(project_dir, "comparison_corner_plot.png")
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    print(f"Plot successfully saved to {output_path}")
    plt.close('all')


if __name__ == "__main__":
    main()