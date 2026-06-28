import copy
import os
from pathlib import Path

# BUG-24 fix: import shared constant so nlive default is defined in exactly one place
try:
    from prtoe_class.hybrid.polychord_cli import DEFAULT_NLIVE
except ImportError:
    try:
        from hybrid.polychord_cli import DEFAULT_NLIVE
    except ImportError:
        DEFAULT_NLIVE = 250  # last-resort local fallback


def build_polychord_info(base_info, output_prefix, seed_file=None, nlive=None, polychord_opts=None):
    """Create a cobaya-compatible info dict for running PolyChord, optionally attaching a seed file.

    This function is conservative: it does not attempt to force Polychord to accept seeds if the
    downstream implementation doesn't support them. Instead it records the seed_file in the
    sampler options so adapters or users can pick it up.
    """
    pol_info = copy.deepcopy(base_info)
    base_dir = os.path.dirname(output_prefix) or "."
    file_root = os.path.basename(output_prefix)
    pol_opts = {
        "nlive": DEFAULT_NLIVE,
        "num_repeats": 30,
        "precision_criterion": 0.01,
        "fast_fraction": 0.0,
        "base_dir": base_dir,
        "file_root": file_root,
        "write_resume": True,
        "read_resume": True,
    }
    if isinstance(polychord_opts, dict):
        pol_opts.update(polychord_opts)
    if nlive is not None:  # BUG-25 fix: 'if nlive' skips nlive=0; use explicit None check
        pol_opts['nlive'] = int(nlive)

    pol_info['sampler'] = {'polychord': pol_opts}

    # Expose seed_file path into the sampler options for downstream adapters
    if seed_file:
        pol_info['sampler']['polychord']['seed_file'] = str(seed_file)
        # Copy seed file into polychord_raw dir for convenience
        try:
            raw_dir = Path(base_dir) / f"{file_root}_polychord_raw"
            raw_dir.mkdir(parents=True, exist_ok=True)
            dest = raw_dir / Path(seed_file).name
            # BUG-26 fix: always overwrite — a stale file from a previous run must not be reused
            import shutil
            shutil.copy2(seed_file, dest)
            pol_info['sampler']['polychord']['seed_file_local'] = str(dest)
        except Exception:
            pass

    return pol_info
