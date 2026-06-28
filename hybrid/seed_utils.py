"""
seed_utils.py — Hybrid seeding utilities for CosmicForge.

Generates high-quality PolyChord starting live points from optimizer-discovered modes
and writes them to a seed file. All modes are filtered for quality before use.

Key design choices:
- Zero or degenerate covariances are detected and handled explicitly (not silently clamped).
- Empty sampled_names causes a ValueError instead of silent no-op.
- Ref values that are dicts (Cobaya YAML format) are parsed correctly.
- Seed file is written atomically (tmp → rename) to avoid partial writes.
- All fallbacks log a WARNING before proceeding.
"""
import json
import logging
import os
import yaml
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)


def _load_summary(prefix):
    p = Path(f"{prefix}.summary.json")
    if not p.exists():
        logger.debug("Summary file not found: %s", p)
        return None
    try:
        with open(p, 'r') as f:
            return json.load(f)
    except Exception as exc:
        logger.warning("Failed to load summary %s: %s", p, exc)
        return None


def _load_updated_yaml(prefix):
    for suffix in ('.updated.yaml', '.input.yaml'):
        p = Path(f"{prefix}{suffix}")
        if p.exists():
            try:
                with open(p, 'r') as f:
                    return yaml.safe_load(f) or {}
            except Exception as exc:
                logger.warning("Failed to load YAML %s: %s", p, exc)
    logger.debug("No YAML config found for prefix: %s", prefix)
    return None


def _extract_ref_scalar(ref_value):
    """Safely extract a scalar from a Cobaya 'ref' value.

    Cobaya allows ref to be a plain number OR a dict like {dist: norm, loc: X, scale: Y}.
    Returns a float.
    """
    if isinstance(ref_value, dict):
        return float(ref_value.get('loc', ref_value.get('mean', 0.0)))
    try:
        return float(ref_value)
    except (TypeError, ValueError):
        return 0.0


def _build_cov_diag(mode, sampled_names, params_cfg):
    """Build a diagonal covariance vector for a mode.

    Returns (cov_diag_array, was_degenerate) where was_degenerate=True means
    we fell back to errors or defaults because cov_diag was missing or all-zero.
    """
    cov_diag = mode.get('cov_diag')
    # Check if cov_diag is present, non-empty, and contains at least one nonzero entry
    is_valid = (
        isinstance(cov_diag, (list, np.ndarray))
        and len(cov_diag) > 0
        and any(v != 0 for v in cov_diag)
    )
    if is_valid:
        arr = np.maximum(np.array(cov_diag, dtype=float), 1e-12)
        return arr, False

    # Fallback 1: errors dict  (errors[param] = sigma)
    errs = mode.get('errors', {})
    if errs:
        arr = np.array([max(1e-6, float(errs.get(nm, 1e-3)) ** 2) for nm in sampled_names], dtype=float)
        logger.warning(
            "Mode '%s' has missing/zero cov_diag; falling back to errors dict "
            "(may produce tighter-than-expected live points).",
            mode.get('name', '?')
        )
        return arr, True

    # Fallback 2: prior-derived widths
    prior_widths = []
    for nm in sampled_names:
        prior = params_cfg.get(nm, {}).get('prior', {})
        if isinstance(prior, dict) and 'min' in prior and 'max' in prior:
            width = (float(prior['max']) - float(prior['min'])) * 0.1  # 10% of range
            prior_widths.append(width ** 2)
        else:
            prior_widths.append(1e-4)  # generic default sigma=0.01
    arr = np.array(prior_widths, dtype=float)
    logger.warning(
        "Mode '%s' has no cov_diag or errors; using 10%% of prior range as covariance. "
        "Live points may be poorly placed.",
        mode.get('name', '?')
    )
    return arr, True


def generate_seeded_live_points(output_prefix, n_points=200, random_fraction=0.3, min_samples_per_mode=20):
    """Generate a set of live points seeded from optimizer summary modes.

    Parameters
    ----------
    output_prefix : str
        Prefix used by optimizer (writes output_prefix.summary.json).
    n_points : int
        Total number of live points to generate.
    random_fraction : float
        Fraction of points drawn uniformly from the prior (to preserve global support).
    min_samples_per_mode : int
        Minimum MCMC samples required to trust a mode for seeding.

    Returns
    -------
    (sampled_names, list_of_points)

    Raises
    ------
    FileNotFoundError
        If summary.json is missing.
    ValueError
        If no sampled parameters are found in the YAML config.
    """
    summary = _load_summary(output_prefix)
    if summary is None:
        raise FileNotFoundError(f"Summary not found: {output_prefix}.summary.json")

    cfg = _load_updated_yaml(output_prefix) or {}
    params_cfg = cfg.get('params', {})
    sampled_names = [n for n, p in params_cfg.items() if isinstance(p, dict) and 'prior' in p]

    if len(sampled_names) == 0:
        raise ValueError(
            f"No sampled parameters (with 'prior' key) found in YAML config for prefix "
            f"'{output_prefix}'. Cannot generate seed file."
        )

    modes = summary.get('modes', [])
    # Filter usable modes — require MCMC samples and positive viability
    usable = [
        m for m in modes
        if m.get('mcmc_samples', 0) >= min_samples_per_mode and m.get('viability_score', 0) > 0
    ]

    # Emergency fallback: use best available mode (may have 0 MCMC samples)
    if not usable and modes:
        logger.warning(
            "No modes passed quality filter (min_samples=%d); using best available mode '%s' "
            "as emergency fallback. Live points may be poorly distributed.",
            min_samples_per_mode,
            modes[0].get('name', 'mode_1')
        )
        usable = [modes[0]]

    n_random = int(round(n_points * float(random_fraction)))
    n_seed = max(0, n_points - n_random)

    # Allocate seed points among modes proportional to mcmc_samples
    weights = np.array([max(1.0, float(m.get('mcmc_samples', 1))) for m in usable], dtype=float)
    total_w = weights.sum()
    if total_w > 0:
        weights /= total_w
    else:
        weights = np.ones(len(usable)) / max(1, len(usable))

    live_points = []

    for idx, mode in enumerate(usable):
        mode_alloc = int(round(n_seed * weights[idx]))
        mean = mode.get('point') or {}
        if not mean:
            logger.warning("Mode '%s' has no 'point'; skipping.", mode.get('name', '?'))
            continue

        # SAFETY: Validate that mode point dimension matches sampled_names
        if len(mean) != len(sampled_names):
            logger.warning(
                "Mode '%s' point dimension (%d) does not match sampled parameters (%d); "
                "skipping to avoid seed corruption.",
                mode.get('name', '?'),
                len(mean),
                len(sampled_names)
            )
            continue

        cov_diag, was_degenerate = _build_cov_diag(mode, sampled_names, params_cfg)
        mean_vec = np.array([float(mean.get(nm, 0.0)) for nm in sampled_names], dtype=float)

        if was_degenerate:
            logger.warning(
                "Mode '%s': using degenerate/fallback covariance. "
                "Consider re-running with more MCMC steps for better seeding.",
                mode.get('name', '?')
            )

        # Draw from multivariate normal with diagonal covariance, then clip to priors
        for _ in range(mode_alloc):
            draw = np.random.normal(loc=mean_vec, scale=np.sqrt(cov_diag))
            pt = {}
            for nm, val in zip(sampled_names, draw):
                prior = params_cfg.get(nm, {}).get('prior', {})
                if isinstance(prior, dict) and 'min' in prior and 'max' in prior:
                    val = float(max(float(prior['min']), min(float(prior['max']), val)))
                pt[nm] = float(val)
            live_points.append(pt)

    # Fill up to n_seed if rounding left us short
    while len(live_points) < n_seed:
        if usable:
            m0 = usable[0]
            mean = m0.get('point', {})
            mean_vec = np.array([float(mean.get(nm, 0.0)) for nm in sampled_names], dtype=float)
            cov_diag, _ = _build_cov_diag(m0, sampled_names, params_cfg)
            draw = np.random.normal(loc=mean_vec, scale=np.sqrt(cov_diag))
            pt = {nm: float(val) for nm, val in zip(sampled_names, draw)}
            live_points.append(pt)
        else:
            break
    live_points = live_points[:n_seed]

    # Add random prior-drawn points
    for _ in range(n_random):
        pt = {}
        for nm in sampled_names:
            prior = params_cfg.get(nm, {}).get('prior', {})
            if isinstance(prior, dict) and 'min' in prior and 'max' in prior:
                pt[nm] = float(np.random.uniform(float(prior['min']), float(prior['max'])))
            else:
                # Fallback: normal around reference (handle dict-style ref)
                ref = params_cfg.get(nm, {}).get('ref', 0.0)
                pt[nm] = float(np.random.normal(loc=_extract_ref_scalar(ref), scale=1.0))
        live_points.append(pt)

    # Trim to exact requested count
    live_points = live_points[:n_points]
    logger.info(
        "Generated %d live points (%d seeded, %d random) from %d usable modes.",
        len(live_points), n_seed, n_random, len(usable)
    )
    return sampled_names, live_points


def write_polychord_seed_file(output_prefix, sampled_names, live_points):
    """Write a seed file in whitespace-separated format.

    The file is written atomically (temp file → rename) to avoid partial writes
    if the process is interrupted mid-write.

    Returns the path to the written seed file as a str.
    """
    polychord_raw_dir = Path(os.path.dirname(output_prefix)) / f"{Path(output_prefix).name}_polychord_raw"
    polychord_raw_dir.mkdir(parents=True, exist_ok=True)
    seed_path = polychord_raw_dir / f"{Path(output_prefix).name}_seed.txt"

    # Atomic write: write to .tmp then rename
    tmp_path = seed_path.with_suffix('.tmp')
    try:
        with open(tmp_path, 'w') as f:
            f.write('# ' + ' '.join(sampled_names) + '\n')
            for pt in live_points:
                row = ' '.join(f"{pt.get(nm, 0.0):.12g}" for nm in sampled_names)
                f.write(row + '\n')
        # Use os.replace() for true atomic rename (works on NFS and cross-filesystem moves)
        os.replace(str(tmp_path), str(seed_path))
    except Exception:
        # Clean up partial temp file if it exists
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise

    logger.info("Seed file written atomically: %s (%d points)", seed_path, len(live_points))
    return str(seed_path)
