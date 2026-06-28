# Evidence Estimation Transparency & Hybrid Workflow Guidance

## Overview

This document explains the evidence estimation methods used in the hybrid cosmology optimizer, their limitations, and best practices for scientific publication.

---

## 1. Gelfand-Dey Evidence: What It Is & Why It Matters

### The Method
Gelfand-Dey is a **post-hoc evidence approximation** computed from existing MCMC samples:

```
ln(Z) ≈ - ln( < 1/L(θ|D) > )
```

where the expectation is over posterior samples. It uses the posterior samples themselves to estimate the evidence without exploring the full prior volume.

### Key Advantages
- ✅ **Fast**: Requires only MCMC samples, no expensive nested sampling
- ✅ **Multi-modal friendly**: Can estimate evidence for each mode independently
- ✅ **Online computation**: Can be calculated as chains accumulate

### Critical Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| **Assumes local Gaussian proposal** | Underestimates evidence if posterior is far from Gaussian | Check diagnostic plots; increase MCMC steps |
| **Sensitive to chain length** | Short chains → unreliable estimates | Use `--mcmc-steps` >= 10,000 |
| **Biased by sample correlation** | Correlated samples → inflated evidence | Monitor ESS; use multiple independent chains |
| **Fails in low-density regions** | Evidence breaks down if proposal doesn't cover posterior well | Check viability scores; inspect posterior samples |
| **Not proper for model comparison** | Gelfand-Dey evidence is NOT suitable for Bayesian model selection (Bayes factors) | Use `--run-polychord` for publication-quality evidence |

### Honest Assessment

**Gelfand-Dey is best used for:**
- Fast exploration and mode finding
- Internal diagnostics and sanity checks
- Parameter estimation within a single model

**Gelfand-Dey is NOT suitable for:**
- Publishable model comparison (Bayes factors)
- Formal hypothesis testing
- Claiming statistical significance of model differences

---

## 2. The Hybrid Workflow: Optimization + Nested Sampling

### Why Combine Them?

Standard nested sampling (e.g., PolyChord) blindly explores the entire prior volume, wasting evaluations in low-likelihood regions. The hybrid workflow:

1. **Optimization Phase** → quickly locates high-likelihood modes
2. **MCMC Phase** → characterizes posterior around each mode (ESS, R̂ diagnostics)
3. **Seeded Nested Sampling** → feeds high-quality starting points to PolyChord

### The Workflow (Recommended)

```bash
# Step 1: Fast optimization + Gelfand-Dey evidence (for diagnostics)
python run_cosmicforge.py lcdm_config.yaml \
  --multistart 5 \
  --mcmc-steps 20000 \
  --mcmc-chains 4

# Step 2: Seed PolyChord with discovered modes
python run_cosmicforge.py lcdm_config.yaml \
  --seed-polychord \
  --seed-nlive 250 \
  --seed-min-samples-per-mode 20

# Step 3 (if needed): Full unseeded PolyChord for robustness
python run_cosmicforge.py lcdm_config.yaml --polychord
```

### What This Gives You

| Phase | Output | Quality | Use Case |
|-------|--------|---------|----------|
| Optimizer + Gelfand-Dey | Fast, mode discovery, ESS/R̂ | Approximate | Internal checks, poster presentations |
| Seeded PolyChord | Focused sampling, hybrid evidence | High | Publication (if documented as hybrid) |
| Unseeded PolyChord | Unbiased sampling, rigorous evidence | Highest | Conservative publication, reviewers |

---

## 3. Diagnostic Checklist: Is Your Evidence Valid?

Before using Gelfand-Dey evidence in a result, verify:

- [ ] **MCMC Acceptance Rate**: 10–50% (not too low, not too high)
- [ ] **Effective Sample Size (ESS)**: > 100 per parameter (more is better)
- [ ] **Potential Scale Reduction (R̂)**: < 1.01 per parameter (< 1.05 is acceptable)
- [ ] **Chain Length**: >= 10,000 steps (preferably 20,000+)
- [ ] **Number of Chains**: >= 4 independent chains (for R̂ calculation)
- [ ] **Viability Score**: > 80% (modes respect physical constraints)
- [ ] **Mode Isolation**: > 0.3 (not overlapping with other modes)

If any diagnostic is poor, **increase `--mcmc-steps` or `--mcmc-chains`** and re-run.

---

## 4. Surrogate Model: Acceleration with Caveats

The optimizer uses a **local GP/RBF surrogate** to accelerate evaluations:

### Safety Features
- ✅ Disabled during MCMC/evidence phases (prevents bias)
- ✅ Guarded near unphysical regions (doesn't bypass hard constraints)
- ✅ Hit-rate logged in mode metadata (transparency)
- ✅ Can be disabled entirely with `--no-surrogate` (if needed)

### When Surrogate May Fail
- Likelihood has sharp discontinuities or edges
- Parameter space has multiple isolated modes far apart
- Prior volume is large relative to posterior volume

**Mitigation**: Run `--polychord` to verify evidence without surrogate bias.

---

## 5. Physical Constraints: Model-Agnostic Sanity Checks

The optimizer enforces user-defined physical constraints (e.g., H0 in valid range, V0_prtoe in [0,1]).

### Constraint Handling
- **Violations are penalized**, not rejected outright (allows exploration near boundaries)
- **Viability score** reports % of constraints satisfied at each point
- **Constraint violations logged** in mode diagnostics for transparency

### Interpretation
- `Viability = 100%` → All constraints satisfied
- `Viability = 50%` → Half of constraint volume is violated
- `Viability = 0%` → Point is completely unphysical

**Important**: Constraints are soft penalties, not hard cuts. The optimizer can find modes in slightly unphysical regions if the likelihood is strong enough. Always inspect best-fit parameters manually.

---

## 6. When to Use --run-polychord vs --seed-polychord

### Use `--run-polychord` (Unseeded PolyChord)
- Publication-quality results required
- Reviewer insists on standard nested sampling
- Comparing to legacy codes (PolyChord, Cobaya standard)
- Large prior volume; optimization may miss regions

### Use `--seed-polychord` (Hybrid Seeding)
- Hybrid approach acceptable to reviewers
- Multiple distinct modes; optimization found all of them
- Tight time constraints (faster than unseeded)
- Documentation is thorough and honest

### Skip Both (Optimization Only)
- Internal exploration, poster presentations
- Parameter estimation within a fixed model
- Comparing to other optimization results
- Quick proof-of-concept

---

## 7. Files & Metadata Generated

Each optimizer run produces:

```
output_prefix.summary.json         # Structured summary (modes, evidence, diagnostics)
output_prefix.summary.md           # Human-readable markdown
output_prefix.modes.json           # Aggregated mode metadata
output_prefix.mode_1.meta.json     # Per-mode diagnostics (ESS, R̂, etc.)
output_prefix_modes_comparison.txt # Side-by-side mode comparison
output_prefix.txt                  # MCMC chain samples (primary mode)
```

All files are **self-documenting** with diagnostics for reproducibility.

---

## 8. Citation & Transparency

When publishing with this hybrid workflow, cite:

> "We performed rapid multimodal optimization using [Optimizer Name] with Gelfand-Dey evidence estimation for mode finding. Physical constraints were applied via penalty functions. Evidence estimates were validated by seeding a PolyChord nested sampler with optimizer-discovered modes."

And include in supplementary material:
- Full `.summary.json` from optimizer
- Seeded vs unseeded PolyChord comparison (if available)
- MCMC diagnostics (ESS, R̂ for all parameters)
- Viability scores and constraint violations per mode

---

## 9. Troubleshooting

### "ESS is very low (< 50)"
→ Increase `--mcmc-steps` to 50,000 or `--mcmc-chains` to 8

### "R̂ > 1.05 for some parameters"
→ Chains are not converged; increase steps and/or run again with tighter starting bounds

### "Different modes found on different runs"
→ Multimodality is real; increase `--multistart` to 10–20 to sample more initial guesses

### "Gelfand-Dey evidence is negative (ln(Z) < -1000)"
→ May indicate weak constraint satisfaction or extremely sharp likelihood; inspect viability and chi2 values

### "Surrogate hit-rate > 80%, but PolyChord gives very different result"
→ Surrogate may be biased; run with `--no-surrogate` and compare

---

## 10. References & Further Reading

- **Gelfand & Dey (1994)** – Original paper on harmonic-mean evidence estimation
- **Skilling (2004)** – Nested sampling (PolyChord's theoretical foundation)
- **Handley et al. (2015)** – PolyChord paper
- **Cobaya documentation** – https://cobaya.readthedocs.io/

---

## Summary

**Bottom Line:**
- Gelfand-Dey is fast but approximate; use for exploration, not publication
- The hybrid workflow (optimization + seeded PolyChord) offers a practical middle ground
- Always verify diagnostics (ESS, R̂, acceptance rate) before trusting any evidence
- Be transparent about methods in publications; include diagnostics in supplements
- When in doubt, run standard unseeded PolyChord as a validation check

---

*Last updated: 2026-06-27*
*Document version: 1.0 (aligned with Phase 1 hybrid seeding implementation)*
