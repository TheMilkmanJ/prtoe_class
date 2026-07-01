#!/usr/bin/env python3
"""Verify data files and Cobaya model load for chains/*_full_cosmo.yaml."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
PKG = Path("/home/themilkmanj/cobaya_packages_clean")
DATA = PKG / "data"

# Likelihood name -> primary data file(s) under packages_path/data
DATA_CHECKS: dict[str, list[str]] = {
    "planck_2018_lowl.TT": ["planck_2018_lowT_native"],
    "planck_2018_lowl.EE": ["planck_2018_lowE_native"],
    "planck_2018_highl_plik.TTTEEE_lite": ["planck_2018/baseline"],
    "planck_2018_lensing.clik": ["planck_2018/baseline"],
    "bao.sixdf_2011_bao": [],
    "bao.sdss_dr7_mgs": [],
    "bao.sdss_dr12_consensus_final": [
        "bao_data/sdss_DR12Consensus_final.dat",
        "bao_data/final_consensus_covtot_dM_Hz_fsig.txt",
    ],
    "bao.sdss_dr16_baoplus_lrg": [
        "bao_data/sdss_DR16_BAOplus_LRG_FSBAO_DMDHfs8.dat",
    ],
    "bao.sdss_dr16_baoplus_qso": [
        "bao_data/sdss_DR16_BAOplus_QSO_FSBAO_DMDHfs8.dat",
    ],
    "bao.desi_2024_bao_all": [
        "bao_data/desi_2024_gaussian_bao_ALL_GCcomb_mean.txt",
        "bao_data/desi_2024_gaussian_bao_ALL_GCcomb_cov.txt",
    ],
    "bao.desi_2024_eboss_bao_lya": [
        "bao_data/desi_2024_eboss_gaussian_bao_Lya_GCcomb_mean.txt",
        "bao_data/desi_2024_eboss_gaussian_bao_Lya_GCcomb_cov.txt",
    ],
    "sn.pantheonplusshoes": ["sn_data/PantheonPlus"],
    "sn.union3": ["sn_data/Union3"],
    "des_y1.clustering": ["des_data/DES_1YR_final.dataset"],
    "des_y1.shear": ["des_data/DES_1YR_final.dataset"],
    "des_y3.cosmic_shear": [],  # checked separately under DES_Y3_ROOT
    "des_y3.combo_xi_gg": [],
}

UNAVAILABLE = {
    "kids": "No standard Cobaya KiDS likelihood module (dashboard uses reference μ/σ only).",
    "planck_2018_cluster_counts": "Not in standard Cobaya; old chains used invalid name.",
    "des_y3_clustering": "Installed as des_y3.combo_xi_gg — run scripts/install_des_y3.sh first.",
    "des_y3_shear": "Installed as des_y3.cosmic_shear — run scripts/install_des_y3.sh first.",
    "eboss_dr16_lya_auto": "Use bao.sdss_dr16_baoplus_lyauto or bao.desi_2024_eboss_bao_lya.",
    "eboss_dr16_lya_cross": "Use bao.sdss_dr16_baoplus_lyxqso or bao.desi_2024_eboss_bao_lya.",
    "desi_y5_forecast": "Forecast/mock only — sn.desy5 is real DES SN data, not a forecast.",
    "cmb_s4_mock": "No Cobaya mock likelihood installed.",
}


DES_Y3_DATA = Path("/home/themilkmanj/cobaya_packages_clean/des_y3/data")


def check_data_files() -> tuple[list[str], list[str]]:
    ok, missing = [], []
    for like, paths in DATA_CHECKS.items():
        if not paths:
            if like.startswith("des_y3."):
                des_files = ["des_y3_real.dataset", "des_y3_unblinded_final.txt",
                             "des_y3_cov_unblinded_final.txt"]
                bad = [f for f in des_files if not (DES_Y3_DATA / f).exists()]
                if bad:
                    missing.append(f"{like}: {', '.join(bad)}")
                else:
                    ok.append(like)
            else:
                ok.append(like)
            continue
        bad = [p for p in paths if not (DATA / p).exists()]
        if bad:
            missing.append(f"{like}: {', '.join(bad)}")
        else:
            ok.append(like)
    des_so = Path("/home/themilkmanj/cobaya_packages_clean/des_y3/interface/cosmolike_des_y3_interface.so")
    if not des_so.exists():
        missing.append(f"des_y3 interface: {des_so} (run scripts/install_des_y3.sh)")
    return ok, missing


def check_classy_build() -> str | None:
    builds = sorted((REPO / "build").glob("lib.*"))
    if builds:
        return str(builds[-1])
    return None


def try_cobaya_load(config_path: Path) -> tuple[bool, str]:
    try:
        from cobaya.model import get_model
    except ImportError as e:
        return False, f"cobaya not installed: {e}"

    if not check_classy_build():
        return False, (
            "classy Python bindings missing. Build with: "
            "cd python && python3 setup.py build"
        )

    try:
        model = get_model(
            str(config_path),
            packages_path=str(PKG),
            stop_at_error=True,
        )
        likes = list(model.likelihood.keys())
        del model
        return True, f"loaded {len(likes)} likelihoods: {', '.join(likes)}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def compare_configs() -> tuple[bool, str]:
    prtoe = yaml.safe_load((REPO / "chains/prtoe_full_cosmo.yaml").read_text())
    lcdm = yaml.safe_load((REPO / "chains/lcdm_full_cosmo.yaml").read_text())
    p_likes = set(prtoe.get("likelihood", {}))
    l_likes = set(lcdm.get("likelihood", {}))
    if p_likes != l_likes:
        only_p = p_likes - l_likes
        only_l = l_likes - p_likes
        return False, f"likelihood mismatch PRTOE-only={only_p} LCDM-only={only_l}"
    if prtoe.get("packages_path") != lcdm.get("packages_path"):
        return False, "packages_path mismatch"
    return True, f"PRTOE/LCDM share {len(p_likes)} likelihoods"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--config",
        default=str(REPO / "chains/lcdm_full_cosmo.yaml"),
        help="Cobaya YAML to test model load (default: lcdm_full_cosmo)",
    )
    parser.add_argument("--skip-model", action="store_true", help="Only check data files")
    args = parser.parse_args()

    print("=== Full-cosmo likelihood verification ===\n")

    matched, msg = compare_configs()
    print(f"Config parity: {'PASS' if matched else 'FAIL'} — {msg}\n")

    ok_data, missing_data = check_data_files()
    print(f"Data files: {len(ok_data)}/{len(DATA_CHECKS)} present")
    for m in missing_data:
        print(f"  MISSING {m}")
    print()

    build = check_classy_build()
    print(f"classy build: {build or 'NOT FOUND'}\n")

    print("Unavailable / needs extra setup:")
    for name, note in UNAVAILABLE.items():
        print(f"  - {name}: {note}")
    print()

    # Compare against legacy configs
    legacy = {
        "prtoe_standard.yaml": REPO / "prtoe_standard.yaml",
        "lcdm_comparison.yaml": REPO / "lcdm_comparison.yaml",
    }
    full = set(yaml.safe_load((REPO / "chains/lcdm_full_cosmo.yaml").read_text())["likelihood"])
    for label, path in legacy.items():
        likes = set(yaml.safe_load(path.read_text())["likelihood"])
        print(f"{label}: {len(likes)} likelihoods (+{len(full - likes)} in full_cosmo)")

    cobaya_pkgs = REPO / ".." / "cobaya_packages_clean/code/classy/chains"
    for name in ("prtoe_polychord.input.yaml", "lcdm_polychord.input.yaml"):
        p = cobaya_pkgs / name
        if p.exists():
            bad = [k for k in yaml.safe_load(p.read_text()).get("likelihood", {}) if "." not in k]
            print(f"\nLegacy {name}: uses non-standard names: {bad}")

    if args.skip_model:
        return 0 if matched and not missing_data else 1

    loaded, load_msg = try_cobaya_load(Path(args.config))
    print(f"\nCobaya model load: {'PASS' if loaded else 'FAIL'} — {load_msg}")
    return 0 if matched and not missing_data and loaded else 1


if __name__ == "__main__":
    sys.exit(main())