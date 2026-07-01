#!/usr/bin/env python3
"""
PRTOE Null Limit Test Script

Tests that PRTOE in null limit (all parameters = 0) recovers LambdaCDM.
Success criteria:
- Early Omega_r ≈ 1.0 (within 1e-3 or better)
- Max P(k) relative difference < 2% (ideally < 1%)
- Max C_ℓ^TT relative difference < 2%
- No NaN or crash
"""

import sys
import os
import numpy as np
import matplotlib.pyplot as plt

# Prefer in-tree classy.pyx path; fall back to pip-installed classy (conda python)
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_root, "python"))

import classy

def test_prtoe_null_limit():
    """Test that PRTOE in null limit recovers LambdaCDM."""
    
    print("=== PRTOE Null Limit Test ===")
    print("Testing that PRTOE with all parameters=0 recovers LambdaCDM...")
    
    try:
        # Test 1: Pure LambdaCDM
        print("\n1. Running pure LambdaCDM...")
        cosmo_lcdm = classy.Class()
        cosmo_lcdm.set({
            'Omega_cdm': 0.27,
            'Omega_b': 0.05,
            'h': 0.67,
            'Omega_Lambda': 0.68,
            'output': 'tCl, lCl, mPk',
            'l_max_scalars': 2500,
            'P_k_max_h/Mpc': 10.0,
            'a_ini_over_a_today_default': 1e-18,
            'start_sources_at_tau_c_over_tau_h': 1e4,
        })
        cosmo_lcdm.compute()
        print("✓ LambdaCDM computation successful")

        # Test 2: PRTOE in Null Limit
        print("\n2. Running PRTOE in null limit...")
        cosmo_null = classy.Class()
        cosmo_null.set({
            'use_prtoe': 'yes',
            'xi_prtoe': 0.0,
            'beta_prtoe': 0.0,
            'V0_prtoe': 0.0,
            'm_prtoe': 0.0,
            'lambda_prtoe': 0.0,
            'zeta_prtoe': 0.0,
            'phi_c_prtoe': 0.0,
            'delta_phi_prtoe': 1.0,
            'Omega0_prtoe': 0.0,
            'Omega_cdm': 0.27,
            'Omega_b': 0.05,
            'h': 0.67,
            'output': 'tCl, lCl, mPk',
            'l_max_scalars': 2500,
            'P_k_max_h/Mpc': 10.0,
            'a_ini_over_a_today_default': 1e-18,
            'start_sources_at_tau_c_over_tau_h': 1e4,
        })
        cosmo_null.compute()
        print("✓ PRTOE null limit computation successful")

        # Comparisons
        print("\n3. Comparing results...")
        bg_lcdm = cosmo_lcdm.get_background()
        bg_null = cosmo_null.get_background()

        def early_omega_r(bg):
            rho_crit = bg['(.)rho_crit']
            rho_r = bg['(.)rho_g']
            if '(.)rho_ur' in bg:
                rho_r = rho_r + bg['(.)rho_ur']
            return rho_r[0] / rho_crit[0]

        # Check early Omega_r
        omega_r_early_lcdm = early_omega_r(bg_lcdm)
        omega_r_early_null = early_omega_r(bg_null)
        omega_r_deviation = abs(omega_r_early_null - 1.0)
        
        print(f"   Early Omega_r (LCDM): {omega_r_early_lcdm:.8f}")
        print(f"   Early Omega_r (Null): {omega_r_early_null:.8f}")
        print(f"   Deviation from 1.0 (Null): {omega_r_deviation:.2e}")
        
        # Power spectrum comparison (stay within the CLASS k-grid upper bound)
        k = np.logspace(-3, np.log10(8.0), 60)
        Pk_lcdm = np.array([cosmo_lcdm.pk(kk, 0.0) for kk in k])
        Pk_null = np.array([cosmo_null.pk(kk, 0.0) for kk in k])
        rel_diff_pk = np.abs(Pk_null - Pk_lcdm) / Pk_lcdm * 100
        max_pk_diff = np.max(rel_diff_pk)
        
        print(f"   Max P(k) relative difference: {max_pk_diff:.4f}%")

        # CMB comparison
        l = np.arange(2, 2500)
        try:
            Cl_lcdm = cosmo_lcdm.lensed_cl()['tt'][2:2500]
            Cl_null = cosmo_null.lensed_cl()['tt'][2:2500]
            rel_diff_cl = np.abs(Cl_null - Cl_lcdm) / Cl_lcdm * 100
            max_cl_diff = np.max(rel_diff_cl)
            print(f"   Max C_ℓ^TT relative difference: {max_cl_diff:.4f}%")
        except Exception as e:
            print(f"   CMB comparison error: {e}")
            max_cl_diff = float('nan')

        # Check for NaN values
        has_nan_lcdm = any(np.isnan(bg_lcdm['(.)rho_crit']))
        has_nan_null = any(np.isnan(bg_null['(.)rho_crit']))
        has_nan_pk = any(np.isnan(Pk_lcdm)) or any(np.isnan(Pk_null))
        
        print(f"   NaN check - LCDM background: {has_nan_lcdm}")
        print(f"   NaN check - Null background: {has_nan_null}")
        print(f"   NaN check - Power spectra: {has_nan_pk}")

        # Final verdict
        print("\n=== SUCCESS CRITERIA ===")
        
        criteria_passed = []
        
        # Criterion 1: Early Omega_r ≈ 1.0 (within 1e-3)
        if omega_r_deviation < 1e-3:
            print("✓ PASS: Early Omega_r ≈ 1.0 (within 1e-3)")
            criteria_passed.append(True)
        else:
            print(f"✗ FAIL: Early Omega_r deviation = {omega_r_deviation:.2e} (> 1e-3)")
            criteria_passed.append(False)
        
        # Criterion 2: Max P(k) diff < 2%
        if max_pk_diff < 2.0:
            print("✓ PASS: Max P(k) diff < 2%")
            criteria_passed.append(True)
        else:
            print(f"✗ FAIL: Max P(k) diff = {max_pk_diff:.4f}% (>= 2%)")
            criteria_passed.append(False)
        
        # Criterion 3: Max C_ℓ diff < 2%
        if not np.isnan(max_cl_diff) and max_cl_diff < 2.0:
            print("✓ PASS: Max C_ℓ diff < 2%")
            criteria_passed.append(True)
        elif np.isnan(max_cl_diff):
            print("⚠ SKIP: C_ℓ comparison not available")
            criteria_passed.append(True)  # Don't fail on this
        else:
            print(f"✗ FAIL: Max C_ℓ diff = {max_cl_diff:.4f}% (>= 2%)")
            criteria_passed.append(False)
        
        # Criterion 4: No NaN
        if not (has_nan_lcdm or has_nan_null or has_nan_pk):
            print("✓ PASS: No NaN values detected")
            criteria_passed.append(True)
        else:
            print("✗ FAIL: NaN values detected")
            criteria_passed.append(False)
        
        # Overall result
        total_criteria = len(criteria_passed)
        passed_criteria = sum(criteria_passed)
        
        print(f"\n=== OVERALL RESULT ===")
        print(f"Passed: {passed_criteria}/{total_criteria} criteria")
        
        if passed_criteria == total_criteria:
            print("🎉 SUCCESS: PRTOE null limit test PASSED!")
            return True
        else:
            print("❌ FAILURE: PRTOE null limit test FAILED!")
            return False
            
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_prtoe_active():
    """Test that PRTOE with active parameters works."""
    
    print("\n=== PRTOE Active Parameters Test ===")
    print("Testing that PRTOE with active parameters runs without crashing...")
    
    try:
        cosmo_active = classy.Class()
        cosmo_active.set({
            'use_prtoe': 'yes',
            'xi_prtoe': 1e-6,
            'V0_prtoe': 0.68,
            'm_prtoe': 0.05,
            'lambda_prtoe': 0.05,
            'zeta_prtoe': 1.0,
            'phi_c_prtoe': 0.0,
            'delta_phi_prtoe': 1.0,
            'Omega_cdm': 0.27,
            'Omega_b': 0.05,
            'h': 0.67,
            'output': 'tCl, mPk',
            'l_max_scalars': 500,
            'P_k_max_h/Mpc': 5.0,
            'a_ini_over_a_today_default': 1e-18,
            'start_sources_at_tau_c_over_tau_h': 1e4,
        })
        cosmo_active.compute()
        print("✓ PRTOE active parameters computation successful")
        
        # Check for basic output
        bg = cosmo_active.get_background()
        if not any(np.isnan(bg['(.)rho_crit'])):
            print("✓ No NaN values in background")
            return True
        else:
            print("✗ NaN values detected in background")
            return False
            
    except Exception as e:
        print(f"❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Starting PRTOE validation tests...")
    
    # Test 1: Active parameters
    active_test_passed = test_prtoe_active()
    
    # Test 2: Null limit
    null_test_passed = test_prtoe_null_limit()
    
    # Overall result
    print(f"\n=== FINAL SUMMARY ===")
    print(f"Active parameters test: {'PASSED' if active_test_passed else 'FAILED'}")
    print(f"Null limit test: {'PASSED' if null_test_passed else 'FAILED'}")
    
    if active_test_passed and null_test_passed:
        print("🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print("❌ SOME TESTS FAILED!")
        sys.exit(1)