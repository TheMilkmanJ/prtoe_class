"""Run summary helpers extracted from cosmo_dashboard_backend.
Provides build_run_summary(prefix=None) which aggregates parsed Polychord stats,
best-fit details, and optimizer-written summary/metadata into a single dict.
Designed for easy unit testing and to keep the FastAPI endpoint thin.

NOTE: FastAPI's HTTPException is NOT imported here to keep this module testable
without FastAPI. Callers (FastAPI endpoints) should catch ValueError/RuntimeError
and convert to HTTPException themselves.
"""
from pathlib import Path
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _load_json_if_exists(p: Path):
    try:
        if p.exists():
            return json.loads(p.read_text())
    except Exception as exc:
        logger.debug("Could not load JSON at %s: %s", p, exc)
    return None


def build_run_summary(output_prefix: Optional[str] = None) -> dict:
    """Aggregate parsed Polychord stats + best-fit details + optimizer summary.

    Parameters
    ----------
    output_prefix : str, optional
        If None, the function tries to read the active run prefix from the
        dashboard backend state (lazy import to avoid circular imports).

    Returns
    -------
    dict with keys: output_prefix, stats, best_fit, optimizer_summary,
                    optimizer_metadata, modes (all optional depending on what exists).

    Raises
    ------
    ValueError
        If no prefix can be determined.
    RuntimeError
        If an unexpected error occurs while aggregating data.
    """
    state = None
    try:
        if output_prefix is None:
            backend = __import__("prtoe_class.scripts.cosmo_dashboard_backend", fromlist=["*"])
            state = getattr(backend, 'state', None)
        prefix = output_prefix or (state.active_output_prefix if state else None)
        if not prefix:
            # Last resort: scan chains/ for most recently modified .summary.json
            # This handles the case where the optimizer was launched manually (not via dashboard)
            chains_dir = Path(__file__).resolve().parents[1] / 'chains'
            if chains_dir.exists():
                candidates = sorted(
                    chains_dir.glob('*.summary.json'),
                    key=lambda f: f.stat().st_mtime,
                    reverse=True
                )
                if candidates:
                    prefix = str(candidates[0]).replace('.summary.json', '')
                    logger.info("build_run_summary: auto-discovered prefix via chains/ scan: %s", prefix)
        if not prefix:
            raise ValueError("No output_prefix provided and no active run available.")

        p = Path(prefix)
        stats_f = p.with_suffix('.stats')
        # Fallback locations used by parsers
        if not stats_f.exists():
            alt = p.parent / f"{p.name}_polychord_raw" / f"{p.name}.stats"
            if alt.exists():
                stats_f = alt
        resume_f = p.with_suffix('.resume')
        if not resume_f.exists():
            alt_resume = p.parent / f"{p.name}_polychord_raw" / f"{p.name}.resume"
            if alt_resume.exists():
                resume_f = alt_resume

        stats = {}
        try:
            from prtoe_class.backend.parsers_adapter import parse_polychord_stats
            stats = parse_polychord_stats(stats_f, resume_f if resume_f.exists() else None)
        except Exception as exc:
            logger.debug("parse_polychord_stats failed: %s", exc)
            stats = {}

        best = None
        try:
            from prtoe_class.backend.parsers_adapter import get_best_fit_details
            # state may be None when output_prefix is caller-provided; handle gracefully
            active_yaml = (
                state.active_yaml_path
                if state is not None and hasattr(state, 'active_yaml_path')
                else ""
            )
            best = get_best_fit_details(prefix, state, active_yaml_path=active_yaml)
        except Exception as exc:
            logger.debug("get_best_fit_details failed: %s", exc)
            best = None

        response = {"output_prefix": prefix, "stats": stats, "best_fit": best}

        # Attach optimizer-written summary/metadata files if present
        summary = _load_json_if_exists(Path(f"{prefix}.summary.json"))
        if summary is not None:
            response['optimizer_summary'] = summary

        meta = _load_json_if_exists(Path(f"{prefix}.metadata.json"))
        if meta is not None:
            response['optimizer_metadata'] = meta

        modes = _load_json_if_exists(Path(f"{prefix}.modes.json"))
        if modes is not None:
            response['modes'] = modes

        return response

    except ValueError:
        raise
    except Exception as exc:
        raise RuntimeError(f"build_run_summary error: {exc}") from exc
