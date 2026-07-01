#!/usr/bin/env python3

import sys
sys.path.insert(0, '.')
from classy import Class

params = {
    'use_prtoe': 'yes',
    'xi_prtoe': 5e-6,
    'zeta_prtoe': 1.0,
    'lambda_prtoe': 0.1,
    'm_prtoe': 0.1,
    'phi_c_prtoe': 0.1,
    
    'H0': 67.0,
    'Omega_b': 0.05,
    'Omega_cdm': 0.27,
    'Omega_Lambda': 0.68,
    
    'output': 'tCl',
    'l_max_scalars': 10,
}

print("Testing PRTOE index allocation...")
try:
    cosmo = Class()
    cosmo.set(params)
    cosmo.compute()
    print("✅ SUCCESS: PRTOE initialized and computed")
except Exception as e:
    error_str = str(e)[:200]
    if "singular" in error_str.lower() or "ludcmp" in error_str.lower():
        print(f"❌ SINGULAR JACOBIAN (as expected in this test)")
        print(f"   Error: {error_str}")
    else:
        print(f"❌ ERROR: {error_str}")
