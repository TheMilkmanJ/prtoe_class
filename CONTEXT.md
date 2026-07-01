# PRTOE Code Audit Context

Authoritative constraints for static analysis of the CLASS/PRTOE core.
Full derivations: `PRTOE_Working_Formulation.md` (Sections 2, 10.4–10.6).

## Core files (always cross-check together)

| File | Role |
|------|------|
| `source/background.c` | Background evolution, F/F_dot, activation, Friedmann |
| `include/background.h` | Activation gates, screening helpers, index API |
| `source/perturbations.c` | ICs, stress-energy, metric coupling, sources |
| `include/perturbations.h` | Perturbation indices and inline gates |

## Background contracts

### Friedmann (PRTOE active)

```
3 F H² + 3 H Ḟ = ρ_tot − 3 F K/a²
Ḟ = F_φ φ̇   (physical time derivative — same value in Friedmann solve AND index_bg_F_dot_prtoe storage)
```

### Coupling and screening

```
F(φ) = 1 + ξ_eff(φ) · A(φ)
A(φ) = ½(1 + tanh((φ − φ_c)/δφ))
ξ_eff includes φ² screening and environmental density screening
δφ = delta_phi_prtoe  MUST be finite and > 0 before any tanh division
```

### Covariant activation (time-dependent, inside an active run)

```
trans = ½(1 + tanh((log(ρ_φ/ρ_r) − log(0.01)) / 0.1))
ρ_φ = ½φ̇² + V(φ)
ρ_r = photons + UR + DR + IDR + relativistic NCDM  (NOT photons+UR only)
ρ_prtoe = trans · (½φ̇² + V)
p_prtoe   = trans · (½φ̇² − V)
```

### Allocation / mode gates (parameter-time, single predicate family)

```
prtoe_is_physically_active  ≡ use_prtoe AND NOT prtoe_explicit_null_de
                              AND (Omega0_prtoe > 0 OR xi ≥ 1e-7 OR beta > 1e-8)
prtoe_coupling_dynamical    ≡ xi ≥ 1e-7 OR beta > 1e-8  → de_mode = prtoe_active
else if Omega0_prtoe > 0    → de_mode = prtoe_frozen
else                        → de_mode = lambda_limit
```

Do **not** mix `xi > 1e-8`, `xi >= 1e-7`, and `Omega0 > 0` as separate allocation gates.

### Lambda routing

```
Add Omega0_lambda to rho_tot only when NOT prtoe_is_physically_active OR de_mode == lambda_limit
```

### Pressure derivative feed

```
p_tot_prime must include active PRTOE scalar contribution (same formula class as p_prime_scf, scaled by trans)
```

### Background table endpoint

```
When patching tau_table/z_table/loga_table[last], recompute background_table[last] via background_functions()
```

### Matter validation (non-unified)

```
Require Omega_b > 0 always.
Require Omega_cdm > 0 only when prtoe_has_separate_cdm() (null-limit / baryon-only must pass).
```

## Perturbation contracts

### Initial conditions (Section 10.4, superhorizon adiabatic)

```
Φ = −(2/3) ζ
δφ = −(F_φ/F) Φ   when metric IC active
η  = ζ             (never derive η from δφ)
δφ' = 0 at IC
```

### Newtonian gauge constraint (before alpha/phi solve)

```
rho_plus_p_shear must be initialized (neutrino shear at IC) before prtoe_add_to_newtonian_constraint()
prtoe_fill_scalar_stress_energy uses G_eff/F consistently with total_stress_energy
```

### Covariant perturbation gate

```
prtoe_is_covariantly_active_at_tau ≡ de_mode == prtoe_active AND rho_prtoe > 1e-30
```

### Unified dark sector

```
prtoe_unified_dark_sector_active → cluster weight 1.0, no separate CDM indices
partial unify → prtoe_clustering_weight_cdm(g_c_prtoe)
```

## Null-limit recovery (Section 10.5)

```
xi → 0, beta → 0, Omega0_prtoe → 0  ⇒  F → 1, Ḟ → 0, standard ΛCDM background + perturbations
```

## Fifth-force / screening bounds

```
|G_eff/G − 1| at solar-system densities must stay below PRTOE_FIFTH_FORCE_XI_EFF_MAX (~1e-5)
σ, rho0, gamma, zeta control environmental screening — flag ad-hoc scaling breaks
```

## Source-term normalization

```
delta_scf / theta_scf sources divide by rho_prtoe only when
  rho_prtoe > PRTOE_RHO_ACTIVATION_THRESHOLD (1e-30)
theta_scf uses |rho_prtoe + p_prtoe| > 1e-30 (same scale)
```

## Audit instruction for reviewers

Perform an **exhaustive** sweep of all four core files above. Do not stop after the first few findings. Verify every cross-file contract in this document. If output is truncated, continue in a follow-up response until all items are checked.

**Fix impact protocol:** For every proposed fix, trace all readers/writers of touched symbols in the four core files and report downstream inconsistencies in the same review pass.