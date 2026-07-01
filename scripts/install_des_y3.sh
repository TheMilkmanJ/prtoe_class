#!/usr/bin/env bash
# Install DES Y3 CosmoLike likelihood for Cobaya (does NOT compile CLASS).
#
# Prerequisites: gcc, gfortran, python3, cobaya installed.
# Run once before using des_y3.* likelihoods in chains/*_full_cosmo.yaml.
#
# Usage: ./scripts/install_des_y3.sh

set -euo pipefail

DES_Y3_ROOT="${DES_Y3_ROOT:-/home/themilkmanj/cobaya_packages_clean/des_y3}"
COBAYA_LIK="${COBAYA_LIK:-$(python3 -c "import cobaya.likelihoods, os; print(os.path.dirname(cobaya.likelihoods.__file__))")}"

echo "=== DES Y3 CosmoLike install ==="
echo "DES_Y3_ROOT: ${DES_Y3_ROOT}"
echo "Cobaya likelihoods: ${COBAYA_LIK}"

if [[ ! -d "${DES_Y3_ROOT}/interface" ]]; then
  echo "ERROR: ${DES_Y3_ROOT}/interface not found."
  echo "Clone CosmoLike DES-Y3 into cobaya_packages_clean/des_y3 first."
  exit 1
fi

echo "--- Compiling cosmolike_des_y3_interface.so ---"
cd "${DES_Y3_ROOT}/interface"
make -f MakefileCosmolike clean 2>/dev/null || true
make -j"$(nproc)" -f MakefileCosmolike all

if [[ ! -f "${DES_Y3_ROOT}/interface/cosmolike_des_y3_interface.so" ]]; then
  echo "ERROR: cosmolike_des_y3_interface.so not produced."
  exit 1
fi
echo "OK: interface .so built"

echo "--- Linking des_y3 likelihood into Cobaya ---"
mkdir -p "${COBAYA_LIK}/des_y3"
for f in "${DES_Y3_ROOT}/likelihood/"*.py "${DES_Y3_ROOT}/likelihood/"*.yaml; do
  ln -sf "${f}" "${COBAYA_LIK}/des_y3/$(basename "${f}")"
done
touch "${COBAYA_LIK}/des_y3/__init__.py" 2>/dev/null || true

export_msg="export LD_LIBRARY_PATH=\"${DES_Y3_ROOT}/interface:\${LD_LIBRARY_PATH}\""
export_msg2="export PYTHONPATH=\"${DES_Y3_ROOT}/interface:\${PYTHONPATH}\""

echo ""
echo "=== DES Y3 install complete ==="
echo "Add to your shell or cobaya-run wrapper:"
echo "  ${export_msg}"
echo "  ${export_msg2}"
echo ""
echo "Likelihood names for YAML:"
echo "  des_y3.cosmic_shear   (DES Y3 lensing / 2pt shear)"
echo "  des_y3.combo_xi_gg    (DES Y3 clustering / galaxy-galaxy)"