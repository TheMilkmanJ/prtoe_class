#!/usr/bin/env bash
# Publication validation checklist — prints steps only; does NOT compile or run tests.
#
# Usage: ./scripts/prepare_publication_validation.sh

set -euo pipefail

cat <<'EOF'
=== PRTOE Publication Validation Checklist (prepare only) ===

Phase 1 — Build (run manually when ready)
  [ ] make -j4
  [ ] cd python && python3 setup.py build
  [ ] ./scripts/install_des_y3.sh   # DES Y3 CosmoLike (not CLASS)

Phase 2 — Physics gates (no data fits)
  [ ] ./class test_lambda_cdm.ini
  [ ] ./class test_prtoe_null_simple.ini
  [ ] ./class test_prtoe_null_publication.ini  # publication null-limit gate
  [ ] python3 scripts/test_prtoe_null_limit.py   # P(k), C_l < 2%
  [ ] python3 scripts/test_local_gravity.py          # analytic local gravity map
  [ ] ./class test_prtoe_unified_full.ini            # full DM/DE unification smoke
  [ ] Verify fifth-force: init abort if |dG/G| > 1e-5 at solar/Earth densities

Phase 2b — Ablations (after null-limit passes)
  [ ] ./class test_prtoe_ablation_xi_only.ini
  [ ] ./class test_prtoe_ablation_no_screening.ini
  [ ] ./class test_prtoe_ablation_unified_dm.ini

Phase 3 — Cobaya likelihood dry-run
  [ ] python3 scripts/verify_full_cosmo_likelihoods.py
  [ ] cobaya-run chains/lcdm_full_cosmo.yaml --test
  [ ] cobaya-run chains/prtoe_full_cosmo.yaml --test

Phase 4 — Evidence (last)
  [ ] Matched PolyChord: chains/lcdm_full_cosmo + chains/prtoe_full_cosmo
  [ ] Compare Delta log Z, H0, S8 posteriors

Configs:
  chains/prtoe_full_cosmo.yaml  — 17 likelihoods (with DES Y3 when installed)
  chains/lcdm_full_cosmo.yaml   — identical suite, use_prtoe=no

CodeRabbit:
  [ ] cd source && cr   # repeat until 0 findings
EOF