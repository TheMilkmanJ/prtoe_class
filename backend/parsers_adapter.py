"""Adapters for parser utilities with robust fallbacks and workspace safety.
Provides:
 - parse_polychord_stats(stats_file, resume_file=None)
 - get_best_fit_details(output_prefix, state=None, active_yaml_path="")
 - get_output_prefix_from_yaml(config_path)
 - get_model_yaml_path(output_prefix, active_yaml_path=None)

These wrappers try to import the authoritative parsers (scripts.parsers.polychord)
and log warnings on fallback to conservative defaults.

Design notes:
 - sys.path is NOT mutated at module load time (BUG-01 fix). Instead we use
   importlib.util.spec_from_file_location to load by absolute path, keeping
   the process sys.path clean and avoiding name collisions with third-party 'parsers'.
 - All import failures are logged at DEBUG level with traceback details (BUG-02 fix).
 - The infallible dict-literal try/except has been removed (BUG-03 fix).
 - The parsers.logs fallback is guarded by its own safe loader (BUG-04 fix).
"""
from pathlib import Path
import importlib.util
import logging
import sys
import traceback

logger = logging.getLogger("cosmic_dashboard.parsers_adapter")

# ─── Module import (by absolute path, no sys.path mutation) ──────────────────

def _load_module_from_path(module_name: str, file_path: Path):
    """Load a Python module by absolute file path without mutating sys.path.

    Uses importlib.util.spec_from_file_location, which is the correct way to
    import a file by path. sys.modules is updated so the module is cached.
    Returns the module object or None on failure.
    """
    try:
        spec = importlib.util.spec_from_file_location(module_name, str(file_path))
        if spec is None or spec.loader is None:
            logger.debug("spec_from_file_location returned None for %s", file_path)
            return None
        mod = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = mod
        spec.loader.exec_module(mod)
        return mod
    except Exception:
        logger.debug("Failed to load %s from %s:\n%s", module_name, file_path, traceback.format_exc())
        return None


def _import_polychord_module():
    """Try different strategies to import the polychord parser module.

    Strategy order:
    1. Already-installed top-level 'parsers.polychord' package.
    2. Load by absolute file path (scripts/parsers/polychord.py) — no sys.path mutation.
    3. Package-qualified import (prtoe_class.scripts.parsers.polychord).

    Returns module or None.
    """
    # Strategy 1: top-level package install
    if 'parsers.polychord' in sys.modules:
        return sys.modules['parsers.polychord']
    try:
        import parsers.polychord as pc
        logger.debug("parsers.polychord imported from top-level package")
        return pc
    except Exception:
        logger.debug("Strategy 1 (top-level) failed:\n%s", traceback.format_exc())

    # Strategy 2: load by absolute file path (preferred — no sys.path mutation)
    scripts_dir = Path(__file__).resolve().parents[1] / 'scripts'
    candidate = scripts_dir / 'parsers' / 'polychord.py'
    if candidate.exists():
        mod = _load_module_from_path('_prtoe_parsers_polychord', candidate)
        if mod is not None:
            logger.debug("parsers.polychord loaded from absolute path: %s", candidate)
            return mod
        logger.debug("Strategy 2 (absolute path %s) failed", candidate)
    else:
        logger.debug("Strategy 2 candidate not found: %s", candidate)

    # Strategy 3: fully-qualified package import
    try:
        import prtoe_class.scripts.parsers.polychord as pc
        logger.debug("parsers.polychord imported via prtoe_class.scripts.parsers.polychord")
        return pc
    except Exception:
        logger.warning(
            "All polychord parser import strategies failed. "
            "Adapter will use conservative fallbacks.\n%s",
            traceback.format_exc()
        )
        return None


def _import_logs_module():
    """Try to import parsers.logs using the same non-mutating strategy."""
    scripts_dir = Path(__file__).resolve().parents[1] / 'scripts'
    candidate = scripts_dir / 'parsers' / 'logs.py'
    if candidate.exists():
        mod = _load_module_from_path('_prtoe_parsers_logs', candidate)
        if mod is not None:
            return mod
    try:
        import prtoe_class.scripts.parsers.logs as plogs
        return plogs
    except Exception:
        logger.debug("parsers.logs not available:\n%s", traceback.format_exc())
        return None


# Module-level singletons — loaded once at import time
_polychord_mod = _import_polychord_module()
_logs_mod = _import_logs_module()

# ─── Public adapter functions ─────────────────────────────────────────────────

def parse_polychord_stats(stats_file: Path, resume_file: Path = None):
    """Parse a PolyChord .stats file and optionally the .resume file.

    Returns a dict with evidence, dead_points, etc.
    Falls back to a safe empty dict on failure.
    """
    if _polychord_mod is not None and hasattr(_polychord_mod, 'parse_polychord_stats'):
        try:
            return _polychord_mod.parse_polychord_stats(
                Path(stats_file),
                Path(resume_file) if resume_file else None
            )
        except Exception as e:
            logger.warning("parse_polychord_stats failed: %s", e)
    # Conservative fallback (BUG-03 fix: no try/except around dict literal)
    return {
        "dead_points": 0,
        "log_evidence": None,
        "log_evidence_error": None,
        "evidence_source": None,
        "evidence_is_final": False,
        "evidence_quality": "missing",
    }


def get_best_fit_details(output_prefix: str, state=None, active_yaml_path: str = ""):
    """Get best-fit parameter details for a run.

    Returns a dict or None.
    """
    if _polychord_mod is not None and hasattr(_polychord_mod, 'get_best_fit_details'):
        try:
            return _polychord_mod.get_best_fit_details(output_prefix, state, active_yaml_path)
        except Exception as e:
            logger.warning("get_best_fit_details failed: %s", e)

    # Fallback: try parsers.logs if available (BUG-04 fix: use pre-loaded _logs_mod)
    if _logs_mod is not None and hasattr(_logs_mod, 'get_best_fit_from_log'):
        log_file = Path(f"{output_prefix}.log")
        try:
            return _logs_mod.get_best_fit_from_log(log_file, state)
        except Exception as exc:
            logger.debug("parsers.logs fallback also failed: %s", exc)

    return None


def get_output_prefix_from_yaml(config_path: str) -> str:
    """Extract the output prefix from a Cobaya YAML config file."""
    if _polychord_mod is not None and hasattr(_polychord_mod, 'get_output_prefix_from_yaml'):
        try:
            return _polychord_mod.get_output_prefix_from_yaml(config_path)
        except Exception as e:
            logger.warning("get_output_prefix_from_yaml failed: %s", e)
    # Fallback: parse YAML directly
    try:
        p = Path(config_path)
        if not p.exists():
            return "chains/cobaya_run"
        import yaml
        with open(p, 'r') as f:
            cfg = yaml.safe_load(f) or {}
        return cfg.get('output', 'chains/cobaya_run')
    except Exception:
        return "chains/cobaya_run"


def get_model_yaml_path(output_prefix: str, active_yaml_path: str = ""):
    """Locate the model YAML file for a given output prefix."""
    if _polychord_mod is not None and hasattr(_polychord_mod, 'get_model_yaml_path'):
        try:
            return _polychord_mod.get_model_yaml_path(output_prefix, active_yaml_path)
        except Exception as e:
            logger.warning("get_model_yaml_path failed: %s", e)
    # Fallback: attempt conventional locations
    for suffix in ('.updated.yaml', '.input.yaml'):
        cand = Path(f"{output_prefix}{suffix}")
        if cand.exists():
            return cand
    if active_yaml_path and Path(active_yaml_path).exists():
        return Path(active_yaml_path)
    return None
