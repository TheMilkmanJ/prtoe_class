# CosmicDashboard + PRTOE (CLASS + Cobaya Controller)

**An experimental research dashboard for running, monitoring, and performing advanced Bayesian analysis on cosmological models (including PRTOE) with CLASS and Cobaya/PolyChord.**

**Author:** Justin Ryan Pulford

This repository provides the **PRTOE** (Pulford-Romsa scalar-tensor cosmology extension) model modifications to the CLASS C solver, plus **CosmicDashboard** — a prototype workflow UI that makes it easy to:
- Compile custom CLASS engines
- Run nested sampling (Cobaya + PolyChord)
- Perform rich diagnostics and comparisons
- **Add exploratory Bayesian diagnostics beyond simple information criteria** for complex models (see features below)

It is built on top of the excellent upstream [CLASS code](http://class-code.net) by Julien Lesgourgues et al.

> [!IMPORTANT]
> **Invitation to Researchers:** If you are downloading this code, we politely ask you to run the PRTOE model configurations and help us test its viability as an alternative cosmological model. By comparing its Bayesian evidence ($\Delta\ln\mathcal{Z}$), $\chi^2$ fits, and parameter pulls (such as the $H_0$ and $S_8$ tensions) against standard $\Lambda\text{CDM}$, you can help the cosmology community determine if PRTOE is a framework worth exploring further. Thank you for your contribution!

---

## CosmicDashboard: How This Dashboard Works

**See the UI in action:** Real screenshots and videos are encouraged in the [Screenshots & Demo Videos](#screenshots--demo-videos) section (user-captured from actual runs).

### Quick Start (Recommended)
Use the provided launch scripts (easiest for most users):

**Windows:** Double-click `launch_windows.bat`

**Mac/Linux:** `bash launch_mac_linux.sh` or `./launch_cosmic.sh` (the robust one with phone tunnel support)

Docker is used under the hood for a clean environment. Your chains and data live in the local `chains/` folder and persist across runs.

### 🎮 Fast Verification (Toy Mode)
If you want to verify that the entire hybrid optimization, Hessian, MCMC, and surrogate pipeline is working without compiling the full CLASS engine or running a heavy cosmological chain, you can run the toy model test:
```bash
python3 run_cosmicforge.py --test-toy --multistart 2 --mcmc-steps 20
```
This runs a 4D multimodal test likelihood in seconds and outputs full diagnostics.

### ⚠️ Statistical Disclaimer: Gelfand-Dey Evidence Approximation
The Hybrid Cosmo Optimizer uses the **Gelfand-Dey (GD) importance sampling estimator** to calculate the local Bayesian evidence $\ln(Z_k)$ for each identified mode. While GD is highly efficient and enables real-time evidence feedback from local MCMC chains, users must note:
* **Normality Assumption:** GD relies on a multivariate Gaussian proposal density $f(\theta)$ constructed from the MCMC sample covariance. For highly non-Gaussian, curved, or degenerate parameter regions, the estimator's variance can become large.
* **MCMC Sample Density:** The accuracy of the GD estimate is highly sensitive to the convergence and density of the MCMC chain. A minimum of 100–200 post-burn-in samples per mode is recommended for stable evidence estimation.
* **Reviewer Guidelines:** For final, publication-grade model selection claims (especially when reporting significant evidence for new physics or tension resolution), you should run a full **Nested Sampling** run (e.g., using the PolyChord sampler in the dashboard) to validate the approximate GD evidence.

See the detailed Quick Start section below for manual Docker options and more.

### Core Idea
Instead of fighting with terminal commands, log files, and manual post-processing, CosmicDashboard gives you:
- A live, updating web interface while your sampler runs
- Automatic Bayesian evidence comparison against ΛCDM baselines
- Advanced tools (detailed in the sections below) that go far beyond what AIC/BIC can tell you

The UI is fully responsive — you can even monitor and control runs from your phone using the built-in Phone Sync feature.

---

## CosmicDashboard: Working & Usable Control Suite

TAKING APPLICATION FEATURE REQUESTS!!! Please leave a detailed description of what you'd like to see from this application under the Issues tab and I'll add it in ASAP!

**See the UI in action:** Real screenshots and videos will be added to the [Screenshots & Demo Videos](#screenshots--demo-videos) section below (user-captured).

> **New in recent releases (see detailed sections below):** Full PSIS-LOO with Pareto k fragility audit, Bayesian Stacking weights, Savage-Dickey nested BFs, Parameter Evolution History that *only* captures on real posterior shifts + working GIF compiler, the "Alive" Nebula cosmic portal (always-visible, comes alive on run with flowing dust), hardened Phone Sync (file fallbacks, always-visible pill, manual set everywhere), the complete "Copy ALL AI Prompts" suite (with all new features baked into the prompts), and reliability fixes for wrappers / best-fit helpers so nothing crashes on derived/compare/status paths. The entire Bayesian comparison stack + visuals now provides advanced exploratory diagnostics.

**See the [Full Modern Bayesian Model Comparison Suite](#full-modern-bayesian-model-comparison-suite-adding-advanced-diagnostics-for-complex-models) and [Visual & UX Upgrades](#visual--ux-upgrades) sections below for everything that has been added or significantly upgraded.**

### Changelog

#### Recent Major Documentation Update (README for GitHub Repo Page)

README fully updated (I first read the entire 240-line file end-to-end via the tools to ensure all sections, cross-references, and existing descriptions were understood and lined up before editing).

Summary of changes made
• Top-level description (PRTOE + CosmicDashboard intro paragraph): Expanded to highlight the full modern Bayesian suite (PSIS-LOO + Pareto k, Stacking, Savage-Dickey, conditional evolution movies, etc.) that adds advanced diagnostics beyond simple information criteria, plus visuals (alive nebula), reliability fixes, AI prompts, phone/remote, etc.
• "New in recent releases" call-out (right after the "Working & Usable Control Suite" header): Added a prominent highlighted block listing all the major additions/upgrades (with links to the new detailed sections). This makes the "all the new features" immediately visible.
• Phone section: Left the existing detailed text mostly intact (it was already accurate from prior work) but added a short cross-reference at the end pointing to the new "Visual & UX Upgrades" section for the latest hardening (file fallbacks, always-visible pill, etc.). This keeps everything lined up without duplication.
• Advanced Academic & Diagnostic Features list: Kept all the pre-existing bullets (Playground, Live Sampler Health, Run-vs-Run, Per-Point Residuals, Provenance, Notebook Generator, Autopsy Timeline, Auto-Rebuilder) exactly as they were. Appended a clean new block of bullets for the major recent additions/upgrades so the list is now comprehensive and up-to-date.
• Two brand-new detailed sections (inserted after the legacy Advanced list, before Screenshots):
  • Full Modern Bayesian Model Comparison Suite (Adding Advanced Diagnostics for Complex Models): Comprehensive coverage of PSIS-LOO + Pareto k (with integration notes, k>0.7 fragility meaning, per-probe extraction), Bayesian Stacking (M-open vs BMA, weights explanation), Savage-Dickey (nested BF estimator, YAML prior loading, PRTOE example), and the upgraded Parameter Evolution History (now only on real posterior shifts via key-means signature, auto-advance in UI, working GIF compiler). Also notes exposure in UI, APIs, bundles, and AI prompts.
  • Visual & UX Upgrades: Details the "Alive" Nebula Cosmic Portal (always-visible, has-model glass name readability, fully-alive running state with flowing dust/pulse/energy/live glow, pure CSS), the hardened Phone Sync (with explicit pointers back to the phone section), the complete AI Prompt Suite ("Copy All" + specialized buttons, shared builder, new features baked into every prompt), and Production Reliability (wrapper _original_* captures, get_current_best_fit_params() helper + StateManager shim, no more crashes).
• Screenshots & Demo Videos section: Updated the placeholder text + "Coming soon" list to specifically call out the new visuals (alive nebula states, evolution scrubber + GIF, PSIS/Stacking/Savage buttons + results, always-visible phone pill, Copy ALL AI Prompts flow, new Bayesian cards). Added encouragement for user contributions of exactly these. Minor polish on the "cool integration" note.
• Cross-references and consistency: All new anchors (#full-modern-bayesian-model-comparison-suite-adding-advanced-diagnostics-for-complex-models and #visual--ux-upgrades) are used from the top call-out, the phone section, the screenshots section, etc. Language is consistent with current code (endpoint names, button text, exact behaviors like "only on noticeable posterior change", "k>0.7", "M-open", "flowing space dust", etc.). The classic upstream CLASS documentation (after the custom CosmicDashboard content) was left completely untouched.
• Overall flow: The README now reads as a single coherent story from quick start → phone/remote → (new) "New in recent releases" teaser → detailed Advanced list (legacy + new) → the two deep new sections (Bayesian suite + Visuals) → screenshots. Everything "lines up" with the actual implemented state (including recent evolution-history conditional logic + GIF path fix, nebula always-on + states, phone file fallback + always-visible pill, AI prompt refactoring, wrapper/helper reliability, etc.).

### Quick Start (One-Click Launch)

The absolute easiest way to run CosmicDashboard is using Docker. We have included automated launch scripts that will safely compile the C-engine, set up the Python environment, and launch the visual dashboard for you.

**Requirements:** You must have Docker Desktop installed and running on your machine.

1. Download or clone this repository.
2. **Windows Users:** Double-click `launch_windows.bat`.
3. **Mac/Linux Users:** Run `bash launch_mac_linux.sh` in your terminal.

*Note: The first time you run this, it will take a few minutes to download the compilers and build the CLASS engine. All your expensive nested sampling data will be safely saved to your local `/chains` folder, meaning you never lose your data even when you close the dashboard!*

### 🌌 Galactic Desktop Shortcut (One-Click Dashboard Launch)
We have added a custom desktop shortcut featuring a high-fidelity glowing spiral galaxy icon for both Windows and Linux:
- **Windows:** Launches the dashboard web UI from your desktop with a custom ICO icon accessed from WSL via UNC path (`\\wsl.localhost\Ubuntu\...`).
- **Linux:** Adds a standard `.desktop` application shortcut utilizing a PNG format galaxy icon.

To manually recreate or redeploy this shortcut, run:
```bash
conda activate prtoe_gold
python scripts/create_desktop_shortcut.py
```

### Manual Docker Commands (Alternative)
If you prefer to run it manually without the launch scripts:
```bash
docker build -t cosmic-dashboard .
docker run --rm -p 8000:8000 -v $(pwd)/chains:/app/chains cosmic-dashboard
```
Then manually open `dashboard/index.html` in any browser.

### 📱 Monitoring Runs Remotely on Your Phone (On-The-Go)
Since CosmicDashboard is built with responsive web layouts, you can securely monitor and interact with your active runs (start, stop, or tweak priors via the Watchdog alerts) directly from your phone's browser:

**Recommended (auto-managed):**
- Use `./launch_cosmic.sh` (or launch_cosmic.sh). It auto-starts a localtunnel + injects the URL into the dashboard.
- The 📱 "Phone Sync" link appears in the header (desktop) with the public https://...loca.lt address.
- Open that link on your phone's browser + log in with the printed DASHBOARD_USER/PASS.
- **Pro tip for "stable" name:** `LT_SUBDOMAIN=mycosmic ./launch_cosmic.sh` → tries https://mycosmic.loca.lt (free tier may still collide/expire).

**If the phone link "keeps breaking" (localtunnel / loca.lt is notoriously flaky — drops, changes, or dies after a while):**
- The launcher now auto health-checks and restarts the tunnel + clears the stale link.
- In the UI header: when a link is active you'll see extra controls (📋 copy / 🔄 refresh / 📝 set / ✕ clear).
- **Always-visible 📱 sync button** in the header lets you *manually paste* a working URL at any time:
  1. In another terminal: `npx localtunnel --port 8000` (or with --subdomain)
  2. Copy the printed URL.
  3. Click the 📱sync button (or the 📝 inside the phone pill) → paste → the link activates everywhere (shared backend state).
- You can also `cat chains/current_phone_url.txt` for the last known good URL.
- The in-app set posts to `/api/set_tunnel_url` (works with your login cookie or basic auth).

Manual tunnel (no launcher):
1. Start backend (launch script, docker, or `python scripts/cosmo_dashboard_backend.py`).
2. In *another* terminal: `npx localtunnel --port 8000`
3. Use the 📱sync button in the dashboard header to paste the printed URL (or POST it yourself with curl + your creds to /api/set_tunnel_url).
4. Auth on the phone using the same DASHBOARD_USER/PASS you set (export before starting backend; also written to chains/dashboard_credentials.txt).

* localtunnel is convenient but unreliable long-term. For production-like remote access consider ngrok, cloudflared, Tailscale, or a reverse proxy. The dashboard itself is fully responsive + works great over any tunnel.

(See the [Visual & UX Upgrades](#visual--ux-upgrades) section for the latest hardening: file-based fallbacks in the backend, always-visible phone pill in the UI that never hides, clickable "not active" state that triggers manual set, re-push + health re-checks inside the launcher, etc.)

### Advanced Academic & Diagnostic Features:

* **Interactive Modified Gravity Playground & Background Solver Emulator:**
  * Adjust cosmological parameters ($H_0$, $\omega_{cdm}$, $\omega_b$) and modified gravity modifiers ($\xi_{\text{prtoe}}$, $\delta_{\text{prtoe}}$, $\zeta_{\text{prtoe}}$, $\beta_{\text{prtoe}}$) via live sliders.
  * Emulate and instantly plot background Hubble expansion ratios $H(z)/H_{\Lambda\text{CDM}}(z)$, dark energy equation of state $w(z)$, and modified gravity coupling strength $\mu(z)$ with real-time DHOST stability boundary checks.
* **Live Sampler Health & MCMC Convergence Diagnostics:**
  * Ditch terminal log scrolling: monitor dead point counts, evaluation speeds, and live efficiency updates in a graphical GUI.
  * Real-time trace plots, autocorrelation time charts, and Gelman-Rubin ($R-1$) PSRF (Potential Scale Reduction Factor) metrics to verify parameter mixing *during* execution.
* **One-Click Run-vs-Run Comparator:**
  * Load and compare two run outputs side-by-side (e.g., standard $\Lambda\text{CDM}$ vs. your modified gravity model).
  * Automatically calculates evidence difference ($\Delta\log Z$), best-fit $\chi^2$ differences, and statistical parameter shifts in significance levels ($N_\sigma = |\Delta\mu| / \sqrt{\sigma_A^2 + \sigma_B^2}$).
* **Individual Per-Data-Point Residuals Explorer:**
  * Breaks down residuals, uncertainties, and individual $\chi^2$ contributions per individual bin/data-point: per multipole for Planck CMB, per bin for BAO (6dFGS, MGS, BOSS, eBOSS), and per supernova for Pantheon+.
* **Unified Scientific Provenance & Accountability Ledger:**
  * Generates a scientific metadata footprint of compilation flags, machine CPU/RAM specifications, Conda environment specifications, CLASS/Cobaya engine versions, active configuration checksums (SHA-256), and Git repository commit hashes for absolute paper reproducibility.
* **Jupyter Notebook Boilerplate Generator:**
  * Instantly export an interactive Python Jupyter notebook (`.ipynb`) pre-configured with the exact C-engine settings and cosmology parameters of your active run.
* **Diagnostic Run Autopsy Timeline:**
  * Scans active run logs for compilation errors, Cholesky decomposition issues, unphysical proposal widths, or stability wedge violations and maps them on a chronological event timeline.
* **Auto-Rebuilder & Parallel Solver Control:**
  * Easily toggle active CPU cores and run nested PolyChord samplers via multi-threaded MPI natively in the background, with automatic CLASS C-engine rebuilding.

### Full Modern Bayesian Model Comparison Suite (Adding Advanced Diagnostics for Complex Models)
CosmicDashboard now ships an experimental toolkit that adds posterior-aware, predictive, and nested-model diagnostics beyond simple information criteria. All are exposed in the UI "Analysis & Utilities Suite" (Tension & Compare tab), via dedicated REST endpoints, in the submit-bundle reports, and auto-injected into the AI prompt generators.

* **PSIS-LOO (Pareto-Smoothed Importance Sampling Leave-One-Out Cross-Validation) + Pareto k Fragility Audit** (`/api/psis_loo`, integrated in WAIC/evidence cards):
  * True out-of-sample predictive accuracy from a *single* run (no thousands of re-runs of CLASS/Cobaya).
  * Uses Generalized Pareto Distribution to smooth noisy importance weights in the tails.
  * Returns `elpd_loo`, SE, `p_loo` (effective parameters), per-observation/probe `pareto_k` list, `k_max`, and high-k warnings.
  * **k > 0.7** instantly flags high-leverage data points (e.g. one high-z DESI BAO bin or critical Planck multipole) that are driving your modified-gravity parameters. AIC/BIC are completely blind to this.
  * Extracts per-probe log-likelihoods from PolyChord raw/live chain files when available (or falls back gracefully). Upgrades the previous basic WAIC/LOO approx.
* **Bayesian Stacking Weights** (`/api/model_stacking` + UI button):
  * M-open predictive model averaging (Yao et al.). Optimizes weights $w_k$ ($\sum w_k = 1$, $w_k \ge 0$) to directly maximize the mixture's expected log predictive density on unseen data.
  * Complements (and often beats) BMA, which assumes the "true model" is inside your list (M-closed).
  * In cosmology this means: if $\Lambda$CDM nails high-$\ell$ CMB but your PRTOE model nails late-time lensing + $H_0$ distances, stacking will give *partial* weights to both and produce a superior predictive ensemble. No more "winner takes all" or single lowest-BIC model.
  * Full optimization when pointwise elpd vectors are available; softmax pseudo-weights on scalars (elpd_loo / logZ / -WAIC) otherwise. Displayed live in the UI.
* **Savage-Dickey Density Ratio** (`/api/savage_dickey` + UI button):
  * Exact Bayes factor for nested models directly from the posterior + prior (no expensive marginal likelihood re-runs).
  * For PRTOE: test whether extra parameters ($\xi_{\text{prtoe}}$, $\delta_{\text{prtoe}}$, etc.) are physically required. $BF_{10} = p(\xi=0 | \text{data}, M_{\text{custom}}) / \pi(\xi=0 | M_{\text{custom}})$.
  * Auto-loads current posterior draws for the chosen param + prior spec from the active YAML (supports uniform / Gaussian etc.).
  * Returns $BF_{10}$, densities at the nested point, and clear interpretation. Provides preliminary diagnostic signals that your modifications may be favored, pending validation with matched nested-sampling evidence.
* **Parameter Evolution History (Conditional "Movie" of Posterior Evolution)**:
  * Real-time capture of posterior triangle plots (`prtoe_posteriors.png` from the live GetDist monitor) into `dashboard/history/`.
  * **Only records a new frame when there is a detectable change in the actual posterior** (rounded means of key parameters H0/S8/Ωm + PRTOE params via `get_realtime_posterior_stats`; image-hash is now secondary). No more trivial updates from plot jitter.
  * Interactive scrubber + "▶ Play" animation in the UI (auto-advances to the newest frame when a real shift is detected).
  * One-click "🎬 Compile and Download Evolution GIF" (`/api/download_posterior_gif`) stitches the milestone frames into a presentation-ready animated GIF (duration/loop optimized). GIF path resolution was fixed so this actually works.
  * "Clear Cache" button + auto-FIFO (max 100 frames) + cleanup on reset.
  * Perfect for papers/presentations showing how your PRTOE contours tightened or shifted away from ΛCDM as dead points accumulated.

### Cosmo Optimizer & Parameter Profiling Suite (BOBYQA + MCMC + Profile Likelihood)
To make model exploration and parameter profiling fast and accessible, CosmicDashboard integrates a custom physics-aware optimization and profiling backend (`run_cosmicforge.py`):
* **Multi-Start Mode Clustering & Ranking:** Run BOBYQA from multiple starting points (Planck-preferred, SH0ES-preferred, strong/weak coupling) to map out the multimodal posterior. The dashboard automatically clusters similar solutions (using a 5% normalized parameter-space distance) and ranks the unique modes by penalized $\chi^2$.
* **Physical Viability Score (0–100%):** Separates the raw data fit quality ($\chi^2_{\text{raw}}$) from physical sanity. Unphysical regions (like negative $V_0$, unstable age of the universe, or ghost instabilities in the coupling $\xi_{\text{prtoe}}$) are penalized with a smooth, graduated quadratic penalty instead of hard walls, allowing the optimizer to navigate away safely. The resulting viability score is displayed live in the dashboard.
* **Laplace Uncertainty & MCMC Sampling:** Estimates correlated parameter errors by computing the full Hessian matrix at the best-fit point. It then automatically launches a short Metropolis-Hastings MCMC chain using the inverted Hessian as the proposal covariance, giving you fast, high-quality marginalized posterior contours for GetDist.
* **Laplace Bayesian Evidence:** Estimates the log evidence $\ln Z$ using the Laplace approximation (determinant of the Hessian) directly from the peak posterior:
  $$\ln Z \approx -0.5 \cdot \chi^2_{\text{best}} + \frac{N}{2} \ln(4\pi) - \frac{1}{2} \ln |H|$$
  This value is automatically written to the `.stats` file and compared against the $\Lambda\text{CDM}$ baseline in the dashboard.
* **Tension Resolution Heatmap:** Automatically computes the parameter-by-parameter Gaussian tension ($\sigma$) between the discovered modes (e.g., Planck-preferred vs. SH0ES-preferred):
  $$T_{ij} = \frac{|\mu_i - \mu_j|}{\sqrt{\sigma_i^2 + \sigma_j^2}}$$
  This is displayed in a dedicated "Mode Tension Analysis" table in the UI.
* **Targeted Profile Likelihood Scans:** Profile any parameter (e.g., $H_0$) by fixing it on a grid and optimizing all other parameters (with warm-starting for rapid convergence). The dashboard renders the resulting profile likelihood curve showing $\Delta\chi^2$ relative to the unconstrained global best-fit, complete with $1\sigma$ ($\Delta\chi^2=1$) and $2\sigma$ ($\Delta\chi^2=3.84$) threshold lines. Trigger it via the collapsible panel in the dashboard UI or directly from the CLI.

### Visual & UX Upgrades
* **"Alive" Nebula Cosmic Portal in the Configuration Upload Zone**:
  * The YAML drop-box is now a *permanent* deep-space visual (real Unsplash nebula photo + rich multi-layer artistic gas clouds in indigos/violets/crimsons/teals/magentas/golds + twinkling stars + dust).
  * **Always visible** — never disappears when you load a config (the old `.empty`-only scoping is gone).
  * `.has-model` state (when any config/default is active): nebula vivid, strong glassmorphic semi-transparent pills on the filename/icon/prompt so the exact model name ("Active Config: uploaded_config.yaml (Template: prtoe_standard)") remains perfectly readable while the cosmic background shows through the edges.
  * `.running` state (when sampler is executing): the image *comes fully alive* — faster nebulaDrift (13s), combined breathing `nebulaAlivePulse` (scale/rotate + saturation pop), space dust *flowing through* the clouds (`cosmicDustFlow` animated diagonal particle shifts at different speeds/layers), stars dancing faster, outer `portalEnergyPulse` cyan/green energy aura around the whole box, and the model-name pill itself gets a live neon-green glow pulse (`modelLiveGlow`).
  * Hover anywhere intensifies (even more on running). Pure self-contained CSS (no external images beyond the one Unsplash base, no JS deps). Framed like a portal with vignette + inner glows. Matches the "JUST MAKE IT ALIVE!!!!" request while still letting you see exactly what model is being ran.
* **Phone Sync / Remote Access — Production Hardened**:
  * (Already detailed above in the dedicated section — now even more robust with file fallbacks, re-push in health loop, always-visible pill that never hides, clickable "not active" state that triggers manual set, etc. The in-app controls + `chains/current_phone_url.txt` mean the link works even if you run the backend directly or loca.lt flakes.)

### AI Prompt Suite (First-Class "Copy All AI Prompts")
* Multiple specialized generators (all buttons live in the Analysis panel):
  * "✨ Copy AI Diagnostic Prompt" — the big unified context (now auto-includes full new Bayesian metrics + "NEW FEATURES" header telling the AI to use PSIS-LOO k values, stacking weights, Savage-Dickey BF10, etc., and to explain the advantages of these exploratory diagnostics).
  * Dedicated "📊 Copy Stacking / Ensemble Prompt" and "🔬 Copy Savage-Dickey / Nested Test Prompt".
  * **Master "📋 Copy ALL AI Prompts"** — concatenates Diagnostic + Stacking + Savage + new "Paper Writing Aid" (drafts abstract + model-selection paragraph + suggested LaTeX/figures for the new metrics) + "Full multi-turn context" block.
* All prompts are dynamically populated from live `lastStatusData` + scraped UI (advanced-metrics-body, phone link, evidence deltas, per-point chi², provenance, etc.) + explicit instructions to use the new tools and contrast with point-estimate penalties.
* The suite is also referenced in submit-bundle reports. Refactored around a shared `buildMainDiagnosticPrompt()` so everything stays in sync when new features are added.

### Production Reliability & Stability Upgrades
* Correct `_original_*` capture before any name rebinding for `get_best_fit_details` / `extract_model_struggles` / `get_best_fit_from_log` (prevents recursion and "takes 1 but 2 given" errors in compare_models and other call sites).
* `get_current_best_fit_params()` helper (uses the wrapped parser + "raw_params") used *everywhere* that needs best-fit data (derived params, curves, bundles, reports, etc.).
* `StateManager` now exposes a `@property best_fit_params` compatibility shim (plus robust wrappers that accept *args) so any legacy or "undo" paths never crash with AttributeError.
* These changes (plus the phone file fallback) make the whole system resilient to the exact classes of bugs that previously appeared after feature-add / undo cycles.

### Other Upgraded / Integrated Features
* Evidence / IC comparison cards and "Advanced Bayesian Diagnostics" explainer now surface PSIS-LOO + k diagnostics, stacking weights, and Savage-Dickey results with live buttons.
* Submit-bundle / report generator and provenance ledger now include the new metrics.
* Model Zoo presets (including EDE Test) and the configurable template system work seamlessly with all the new comparison tools.
* The "Advanced Bayesian Diagnostics" explainer (in UI + documentation) describes the advantages of these exploratory tools (prior volume sensitivity, effective parameters from posterior variance, predictive focus, data-leverage diagnostics, nested BF estimators).

All of the above is fully wired in the glassmorphic UI (glass panels, neon accents, copy buttons everywhere), exposed via clean REST APIs, and automatically available in the one-click launchers. The goal is a single tool that provides exploratory Bayesian diagnostics for complex cosmological models.

### Screenshots & Demo Videos

Real screenshots and videos of the live CosmicDashboard UI will be added here soon (user-captured from actual runs for 100% accuracy). **Especially welcome:** shots of the "Alive" Nebula portal (upload zone in different states), the Parameter Evolution History scrubber + compiled GIF, the PSIS/Stacking/Savage buttons + advanced-metrics results, the always-visible Phone Sync pill (with manual set), the full "Copy ALL AI Prompts" flow, and any of the new Bayesian comparison cards.

**Coming soon (or contribute your own!):**
- Main dashboard overview (with the living nebula upload zone)
- Live status & tensions (now including PSIS-LOO k + stacking weights)
- PRTOE Playground
- Diagnostics panels (new evolution movie + AI prompts)
- Login flow (with Remember Me) + remote phone view
- Walkthrough videos

*Once real assets are provided, they'll be placed in the `screenshots/` folder and referenced here in the README.*

*For the most accurate and up-to-date look and behavior, clone the repo and launch it yourself (see Quick Start above). The nebula "comes alive" only during an active run, the evolution history only records on real posterior shifts, etc.*

*See also the [screenshots/ directory](screenshots/) (currently empty, ready for real captures).*

**Optional "cool" integration:** After adding your real screenshot (e.g. `real-main-ui.png`), you can uncomment the preview `<img>` inside the YAML upload drop zone in `dashboard/index.html` (search for "OPTIONAL COOL PREVIEW EMBED") so visitors see a live thumbnail of the actual UI right where they upload configs. The backend now auto-mounts `/screenshots` for this. Screenshots of the new "Alive" nebula states or the evolution GIF player would look especially good there.

---

Compiling CLASS and getting started
-----------------------------------

(the information below can also be found on the webpage, just below
the download button)

Download the code from the webpage and unpack the archive (tar -zxvf
class_vx.y.z.tar.gz), or clone it from
https://github.com/lesgourg/class_public. Go to the class directory
(cd class/ or class_public/ or class_vx.y.z/) and compile (make clean;
make class). You can usually speed up compilation with the option -j:
make -j class. If the first compilation attempt fails, you may need to
open the Makefile and adapt the name of the compiler (default: gcc),
of the optimization flag (default: -O4 -ffast-math) and of the OpenMP
flag (default: -fopenmp; this flag is facultative, you are free to
compile without OpenMP if you don't want parallel execution; note that
you need the version 4.2 or higher of gcc to be able to compile with
-fopenmp). Many more details on the CLASS compilation are given on the
wiki page

https://github.com/lesgourg/class_public/wiki/Installation

(in particular, for compiling on Mac >= 10.9 despite of the clang
incompatibility with OpenMP).

To check that the code runs, type:

    ./class explanatory.ini

The explanatory.ini file is THE reference input file, containing and
explaining the use of all possible input parameters. We recommend to
read it, to keep it unchanged (for future reference), and to create
for your own purposes some shorter input files, containing only the
input lines which are useful for you. Input files must have a *.ini
extension. We provide an example of an input file containing a
selection of the most used parameters, default.ini, that you may use as a
starting point.

If you want to play with the precision/speed of the code, you can use
one of the provided precision files (e.g. cl_permille.pre) or modify
one of them, and run with two input files, for instance:

    ./class test.ini cl_permille.pre

The files *.pre are supposed to specify the precision parameters for
which you don't want to keep default values. If you find it more
convenient, you can pass these precision parameter values in your *.ini
file instead of an additional *.pre file.

The automatically-generated documentation is located in

    doc/manual/html/index.html
    doc/manual/CLASS_manual.pdf

On top of that, if you wish to modify the code, you will find lots of
comments directly in the files.

Python
------

To use CLASS from python, or ipython notebooks, or from the Monte
Python parameter extraction code, you need to compile not only the
code, but also its python wrapper. This can be done by typing just
'make' instead of 'make class' (or for speeding up: 'make -j'). More
details on the wrapper and its compilation are found on the wiki page

https://github.com/lesgourg/class_public/wiki

Plotting utility
----------------

Since version 2.3, the package includes an improved plotting script
called CPU.py (Class Plotting Utility), written by Benjamin Audren and
Jesus Torrado. It can plot the Cl's, the P(k) or any other CLASS
output, for one or several models, as well as their ratio or percentage
difference. The syntax and list of available options is obtained by
typing 'pyhton CPU.py -h'. There is a similar script for MATLAB,
written by Thomas Tram. To use it, once in MATLAB, type 'help
plot_CLASS_output.m'

Developing the code
--------------------

If you want to develop the code, we suggest that you download it from
the github webpage

https://github.com/lesgourg/class_public

rather than from class-code.net. Then you will enjoy all the feature
of git repositories. You can even develop your own branch and get it
merged to the public distribution. For related instructions, check

https://github.com/lesgourg/class_public/wiki/Public-Contributing

Using the code
--------------

You can use CLASS freely, provided that in your publications, you cite
at least the paper `CLASS II: Approximation schemes <http://arxiv.org/abs/1104.2933>`. Feel free to cite more CLASS papers!

Support
-------

To get support, please open a new issue on the

https://github.com/lesgourg/class_public

webpage!
