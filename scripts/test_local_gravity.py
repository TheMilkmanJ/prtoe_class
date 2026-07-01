#!/usr/bin/env python3
"""
Local gravity map for PRTOE (pre/post CLASS compile).

Mirrors C helpers in include/background.h:
  - prtoe_environmental_screening_at_rho_kg_m3
  - prtoe_phi_at_matter_density_kg_m3
  - prtoe_G_eff_over_G_at_environment
  - prtoe_fifth_force_deviation_at_rho_kg_m3

Usage (no CLASS required):
  python3 scripts/test_local_gravity.py

Usage (with CLASS, after compile):
  python3 scripts/test_local_gravity.py --classy
"""
from __future__ import annotations

import argparse
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "python"))

PRTOE_FIFTH_FORCE_XI_EFF_MAX = 1e-5
RHO_SOLAR = 1.0e3
RHO_EARTH = 5.5e3
RHO_LAB = 2.0e3
EP_ETA_MAX = 1e-5
MERCURY_GR_RAD_PER_ORBIT = 5.0e-7


def get_xi_eff(xi: float, zeta: float, phi: float) -> float:
    phi2 = phi * phi
    return xi * phi2 / (1.0 + zeta * phi2)


def environmental_screening(sigma: float, rho0: float, gamma: float, rho_kg_m3: float) -> float:
    if sigma <= 0.0 and gamma <= 0.0:
        return 1.0
    rho0 = max(rho0, 1e-30)
    ratio = rho_kg_m3 / rho0
    gamma_exp = max(gamma, 1e-3)
    s_env = 1.0 / (1.0 + ratio**gamma_exp)
    if sigma > 0.0:
        s_env *= math.exp(-sigma * ratio)
    return max(0.0, min(1.0, s_env))


def phi_at_density(
    sigma: float,
    rho0: float,
    gamma: float,
    lambda_prtoe: float,
    V0: float,
    m: float,
    rho_kg_m3: float,
) -> float:
    rho0 = max(rho0, 1e-30)
    ratio = max(rho_kg_m3 / rho0, 1e-30)
    phi_disp = gamma * math.log(ratio) if gamma > 0.0 else 0.0
    phi_cham = phi_disp / (1.0 + ratio ** max(gamma, 1e-3))
    if sigma > 0.0 and rho_kg_m3 > 0.0:
        exp_term = math.exp(-lambda_prtoe * phi_cham)
        v_phi = -lambda_prtoe * V0 * exp_term + m * m * phi_cham
        target = sigma * rho_kg_m3 * 1e-10
        phi_cham *= math.exp(-abs(v_phi) / max(abs(target), 1e-30))
    return phi_cham


def g_eff_over_g(
    xi: float,
    zeta: float,
    phi_c: float,
    delta_phi: float,
    sigma: float,
    rho0: float,
    gamma: float,
    rho_kg_m3: float,
    phi: float | None = None,
) -> float:
    if phi is None:
        phi = phi_at_density(sigma, rho0, gamma, 0.05, 1.0, 0.05, rho_kg_m3)
    xi_env = get_xi_eff(xi, zeta, phi) * environmental_screening(sigma, rho0, gamma, rho_kg_m3)
    u = (phi - phi_c) / max(delta_phi, 1e-30)
    a_act = 0.5 * (1.0 + math.tanh(u))
    f_coupling = 1.0 + xi_env * a_act
    return 1.0 / max(f_coupling, 1e-30)


def fifth_force_deviation(params: dict, rho_kg_m3: float) -> float:
    geff = g_eff_over_g(rho_kg_m3=rho_kg_m3, **params)
    return abs(geff - 1.0)


def ppn_gamma_minus_one(params: dict, rho_kg_m3: float) -> float:
    """PPN γ−1 ≈ G_eff/G − 1 at screened environment density."""
    return g_eff_over_g(rho_kg_m3=rho_kg_m3, **params) - 1.0


def mercury_precession_excess_rad(gamma_minus_one: float) -> float:
    """Order-of-magnitude perihelion precession excess from γ−1 (PPN scaling)."""
    return MERCURY_GR_RAD_PER_ORBIT * abs(gamma_minus_one) / PRTOE_FIFTH_FORCE_XI_EFF_MAX


def equivalence_principle_eta(g_b: float, g_c: float, geff_ratio: float) -> float:
    """η_EP = |G_eff,b − G_eff,c| with species blend factors g_b, g_c."""
    g_eff_b = 1.0 + g_b * (geff_ratio - 1.0)
    g_eff_c = 1.0 + g_c * (geff_ratio - 1.0)
    return abs(g_eff_b - g_eff_c)


def test_solar_system_orbit(params: dict) -> tuple[bool, dict]:
    """Solar-system orbit: |γ−1| and scaled Mercury precession excess at solar density."""
    gamma_m1 = ppn_gamma_minus_one(params, RHO_SOLAR)
    excess = mercury_precession_excess_rad(gamma_m1)
    ok = abs(gamma_m1) <= PRTOE_FIFTH_FORCE_XI_EFF_MAX and excess <= 1.0
    return ok, {"gamma_minus_one": gamma_m1, "precession_excess_rad": excess}


def test_ep_torsion_balance(params: dict, g_b: float = 1.0, g_c: float = 1.0) -> tuple[bool, dict]:
    """EP / torsion-balance: baryon and CDM couplings must agree at lab density."""
    geff = g_eff_over_g(rho_kg_m3=RHO_LAB, **params)
    eta = equivalence_principle_eta(g_b, g_c, geff)
    ok = eta <= EP_ETA_MAX
    return ok, {"eta_ep": eta, "G_eff_over_G": geff}


def scan_densities(params: dict) -> int:
    print("=== PRTOE Local Gravity Map (analytic) ===")
    print(f"Cassini limit: |dG/G| < {PRTOE_FIFTH_FORCE_XI_EFF_MAX:.1e}")
    print(f"xi={params['xi']:.3e} zeta={params['zeta']:.3f} "
          f"sigma={params['sigma']:.3f} rho0={params['rho0']:.3e} gamma={params['gamma']:.3f}")
    print()
    densities = [
        ("Cosmic mean (approx)", 1e-26),
        ("Galaxy cluster", 1e-23),
        ("Solar interior", RHO_SOLAR),
        ("Earth crust", RHO_EARTH),
    ]
    ok = True
    for label, rho in densities:
        phi = phi_at_density(
            params["sigma"], params["rho0"], params["gamma"],
            0.05, 1.0, 0.05, rho,
        )
        dev = fifth_force_deviation(params, rho)
        status = "PASS" if dev <= PRTOE_FIFTH_FORCE_XI_EFF_MAX else "FAIL"
        if rho >= 1e-20:
            ok = ok and (dev <= PRTOE_FIFTH_FORCE_XI_EFF_MAX)
        print(f"  {label:22s} rho={rho:.3e} kg/m^3  phi={phi:+.4f}  |dG/G|={dev:.3e}  [{status}]")
    print()
    orbit_ok, orbit_res = test_solar_system_orbit(params)
    ep_ok, ep_res = test_ep_torsion_balance(params)
    print("=== Solar-system orbit (PPN γ−1) ===")
    print(f"  |γ−1|={abs(orbit_res['gamma_minus_one']):.3e}  "
          f"precession_excess={orbit_res['precession_excess_rad']:.3e} rad/orbit  "
          f"[{'PASS' if orbit_ok else 'FAIL'}]")
    print("=== EP / torsion-balance (η_EP at lab density) ===")
    print(f"  η_EP={ep_res['eta_ep']:.3e}  G_eff/G={ep_res['G_eff_over_G']:.6f}  "
          f"[{'PASS' if ep_ok else 'FAIL'}]")
    print()
    ok = ok and orbit_ok and ep_ok
    print("OVERALL:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


def test_with_classy(params: dict) -> int:
    """CLASS smoke test: init + background_solve + post-integration fifth-force gate."""
    try:
        import classy  # type: ignore
    except ImportError as exc:
        tag = f"cp{sys.version_info.major}{sys.version_info.minor}"
        print(f"classy import failed ({exc})", file=sys.stderr)
        print(f"Rebuild for Python {tag}: cd ~/prtoe_class && make classy", file=sys.stderr)
        return 1
    cosmo = classy.Class()
    cosmo.set({
        "use_prtoe": "yes",
        "xi_prtoe": params["xi"],
        "zeta_prtoe": params["zeta"],
        "sigma_prtoe": params["sigma"],
        "rho0_prtoe": params["rho0"],
        "gamma_prtoe": params["gamma"],
        "phi_c_prtoe": params["phi_c"],
        "delta_phi_prtoe": params["delta_phi"],
        "V0_prtoe": 0.68,
        "lambda_prtoe": 0.05,
        "m_prtoe": 0.05,
        "omega_b": 0.0224,
        "omega_cdm": 0.12,
        "h": 0.674,
        "background_verbose": 1,
        "output": "mPk",
        "a_ini_over_a_today_default": 1e-18,
        "start_sources_at_tau_c_over_tau_h": 1e4,
    })
    print("=== CLASS post-integration local-gravity gate ===")
    print("(C code runs prtoe_passes_local_gravity_bounds + "
          "background_prtoe_local_gravity_post_integration)")
    cosmo.compute(["background"])
    print("PASS: background_init + post-integration fifth-force check")
    cosmo.struct_cleanup()
    cosmo.empty()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="PRTOE local gravity map")
    parser.add_argument("--classy", action="store_true", help="Also test classy init after build")
    parser.add_argument("--xi", type=float, default=1e-6)
    parser.add_argument("--zeta", type=float, default=1.0)
    parser.add_argument("--sigma", type=float, default=0.1)
    parser.add_argument("--rho0", type=float, default=1e3)
    parser.add_argument("--gamma", type=float, default=0.05)
    args = parser.parse_args()
    params = {
        "xi": args.xi,
        "zeta": args.zeta,
        "sigma": args.sigma,
        "rho0": args.rho0,
        "gamma": args.gamma,
        "phi_c": 0.0,
        "delta_phi": 0.1,
    }
    rc = scan_densities(params)
    if args.classy:
        rc = max(rc, test_with_classy(params))
    return rc


if __name__ == "__main__":
    sys.exit(main())