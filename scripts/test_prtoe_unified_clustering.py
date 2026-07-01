#!/usr/bin/env python3
"""
Unified dark-sector clustering gate.

Compares P(k) at z=0 for:
  A) unify_dark_sector=yes  (CDM budget absorbed into PRTOE field)
  B) unify_dark_sector=no   (separate CDM + PRTOE DE, matched total budget)

Success: max relative P(k) difference < 5% on 0.01 <= k <= 1 h/Mpc.
"""
from __future__ import annotations

import os
import sys

import numpy as np

_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_root, "python"))

import classy  # noqa: E402

BASE = {
    "h": 0.674,
    "omega_b": 0.0224,
    "omega_cdm": 0.12,
    "A_s": 2.1e-9,
    "n_s": 0.965,
    "tau_reio": 0.054,
    "use_prtoe": "yes",
    "xi_prtoe": 1.0e-6,
    "beta_prtoe": 1.0e-6,
    "zeta_prtoe": 1.0,
    "lambda_prtoe": 0.05,
    "m_prtoe": 0.05,
    "V0_prtoe": 0.68,
    "phi_c_prtoe": 0.0,
    "delta_phi_prtoe": 0.1,
    "g_c_prtoe": 1.0,
    "sigma_prtoe": 0.1,
    "rho0_prtoe": 1000.0,
    "gamma_prtoe": 0.05,
    "gauge": "newtonian",
    "output": "mPk",
    "P_k_max_h/Mpc": 2.0,
    "l_max_scalars": 2508,
}


def _pk(cosmo, k_arr: np.ndarray) -> np.ndarray:
    return np.array([cosmo.pk(kk, 0.0) for kk in k_arr])


def main() -> int:
    print("=== PRTOE Unified Dark Sector Clustering Test ===")

    params_unified = dict(BASE)
    params_unified["unify_dark_sector"] = "yes"

    params_split = dict(BASE)
    params_split["unify_dark_sector"] = "no"

    try:
        cosmo_u = classy.Class()
        cosmo_u.set(params_unified)
        cosmo_u.compute()
        print("✓ unified run complete")

        cosmo_s = classy.Class()
        cosmo_s.set(params_split)
        cosmo_s.compute()
        print("✓ split (CDM+DE) run complete")
    except Exception as exc:
        print(f"FAIL: CLASS error: {exc}")
        return 1

    k = np.logspace(-2, 0, 40)
    pk_u = _pk(cosmo_u, k)
    pk_s = _pk(cosmo_s, k)

    mask = (k >= 0.01) & (k <= 1.0)
    rel = np.abs(pk_u[mask] - pk_s[mask]) / np.maximum(pk_s[mask], 1e-30) * 100.0
    max_diff = float(np.max(rel))
    s8_u = cosmo_u.sigma8()
    s8_s = cosmo_s.sigma8()

    print(f"   max P(k) rel diff (0.01-1 h/Mpc): {max_diff:.2f}%")
    print(f"   sigma8 unified: {s8_u:.5f}  split: {s8_s:.5f}")

    if max_diff > 5.0:
        print("FAIL: unified vs split P(k) exceeds 5% tolerance")
        return 1

    print("PASS: unified dark-sector clustering consistent with split reference")
    return 0


if __name__ == "__main__":
    sys.exit(main())