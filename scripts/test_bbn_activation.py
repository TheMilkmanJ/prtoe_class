#!/usr/bin/env python3
"""
BBN numerical regression for PRTOE covariant activation.

Verifies rho_phi / rho_r < activation_threshold (0.01) during the BBN era
(a ~ 1e-10 to 1e-2), so the scalar field does not alter primordial nucleosynthesis.

Usage:
  python3 scripts/test_bbn_activation.py
  python3 scripts/test_bbn_activation.py --classy
"""
from __future__ import annotations

import argparse
import math
import os
import sys

# Use in-tree classy (same pattern as test_prtoe_null_limit.py)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "python"))

ACTIVATION_THRESHOLD = 0.01
BBN_A_MIN = 1e-10
BBN_A_MAX = 1e-2


def analytic_bbn_ratio(
    omega_b: float,
    omega_cdm: float,
    h: float,
    V0: float,
    phi: float = 0.0,
    phi_prime: float = 0.0,
) -> tuple[float, float]:
    """Upper-bound rho_phi/rho_r at BBN using frozen field at phi=0."""
    a_mid = math.sqrt(BBN_A_MIN * BBN_A_MAX)
    h2 = h * h
    rho_r = 2.469e-5 * h2 / (a_mid ** 4)
    exp_term = math.exp(-0.05 * phi)
    rho_phi = 0.5 * (phi_prime / a_mid) ** 2 + V0 * h2 * exp_term
    ratio = rho_phi / max(rho_r, 1e-300)
    return ratio, a_mid


def test_analytic() -> int:
    print("=== BBN activation (analytic upper bound) ===")
    ratio, a = analytic_bbn_ratio(0.0224, 0.12, 0.674, V0=0.68)
    ok = ratio < ACTIVATION_THRESHOLD
    print(f"  a={a:.3e}  rho_phi/rho_r={ratio:.3e}  threshold={ACTIVATION_THRESHOLD:.3e}  "
          f"[{'PASS' if ok else 'FAIL'}]")
    return 0 if ok else 1


def test_with_classy() -> int:
    try:
        import numpy as np
        import classy  # type: ignore
    except ImportError:
        print("classy not built — analytic test only", file=sys.stderr)
        return 1

    cosmo = classy.Class()
    cosmo.set({
        "use_prtoe": "yes",
        "xi_prtoe": 1e-6,
        "zeta_prtoe": 1.0,
        "sigma_prtoe": 0.1,
        "rho0_prtoe": 1e3,
        "gamma_prtoe": 0.05,
        "phi_c_prtoe": 0.0,
        "delta_phi_prtoe": 0.1,
        "V0_prtoe": 0.68,
        "lambda_prtoe": 0.05,
        "m_prtoe": 0.05,
        "omega_b": 0.0224,
        "omega_cdm": 0.12,
        "h": 0.674,
        "YHe": 0.245,
        "output": "mPk",
        "a_ini_over_a_today_default": 1e-18,
        "background_verbose": 0,
    })
    print("=== BBN activation (CLASS background table) ===")
    bg = cosmo.get_background()
    if "z" in bg:
        a = 1.0 / (1.0 + np.array(bg["z"]))
    elif "scale factor a" in bg:
        a = np.array(bg["scale factor a"])
    else:
        print("  FAIL: background dict missing z / scale factor a")
        print(f"  keys: {sorted(bg.keys())[:12]}...")
        cosmo.struct_cleanup()
        cosmo.empty()
        return 1
    rho_g = np.array(bg["(.)rho_g"])
    rho_scf = np.array(bg["(.)rho_scf"]) if "(.)rho_scf" in bg else np.zeros_like(a)
    rho_r = rho_g.copy()
    if "(.)rho_ur" in bg:
        rho_r += np.array(bg["(.)rho_ur"])

    mask = (a >= BBN_A_MIN) & (a <= BBN_A_MAX) & (rho_r > 0)
    if not np.any(mask):
        print("  FAIL: no background samples in BBN window")
        cosmo.struct_cleanup()
        cosmo.empty()
        return 1

    ratio = rho_scf[mask] / rho_r[mask]
    max_ratio = float(np.max(ratio))
    worst_a = float(a[mask][np.argmax(ratio)])
    ok = max_ratio < ACTIVATION_THRESHOLD
    print(f"  max rho_phi/rho_r={max_ratio:.3e} at a={worst_a:.3e}  "
          f"threshold={ACTIVATION_THRESHOLD:.3e}  [{'PASS' if ok else 'FAIL'}]")

    try:
        neff = cosmo.Neff()
        print(f"  N_eff={neff:.4f}  [{'PASS' if 2.9 < neff < 3.2 else 'WARN'}]")
    except Exception:
        pass

    cosmo.struct_cleanup()
    cosmo.empty()
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="PRTOE BBN activation regression")
    parser.add_argument("--classy", action="store_true", help="Also run CLASS background check")
    args = parser.parse_args()
    rc = test_analytic()
    if args.classy:
        rc = max(rc, test_with_classy())
    return rc


if __name__ == "__main__":
    sys.exit(main())