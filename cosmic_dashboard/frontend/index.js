const API_URL = window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin;
let statusInterval = null;
let activeConfig = 'lcdm_config.yaml';
let lastStatusData = null;
let baselineBestChi2 = null;
let baselineLogEvidence = null;
let lastBaselineUpdateRun = null;
let lastBaselineUpdateEvidence = null;
let isUploadingConfig = false;

// Global chart instances
let chartWMu = null;
let chartFSigma8 = null;
let chartInfluence = null;
let chartCompareW = null;
let chartCompareFs8 = null;
let chartSensitivity = null;
let chartPlaygroundRatio = null;
let chartTerrain = null;
let chartResiduals = null;
let chartQualityTrace = null;
let chartQualityAutocorr = null;
let chartPerPointResiduals = null;
let chartRunCompareShifts = null;

// Evolution animation variables
let evolutionPlayInterval = null;
let isPlayingEvolution = false;

// DOM Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

const yamlZone = document.getElementById('yaml-upload-zone');
const yamlInput = document.getElementById('yaml-input');
const yamlName = document.getElementById('yaml-name');
const btnResetYaml = document.getElementById('btn-reset-yaml');

const btnStart = document.getElementById('btn-start');
const btnStartOpt = document.getElementById('btn-start-opt');
const btnLoadLastRun = document.getElementById('btn-load-last-run');
const btnResume = document.getElementById('btn-resume');
const btnStop = document.getElementById('btn-stop');
const btnApplyCosmicForge = document.getElementById('btn-apply-cosmicforge');
const btnDownload = document.getElementById('btn-download');

// Abort confirmation modal elements
const abortModal = document.getElementById('abort-modal');
const btnAbortCancel = document.getElementById('btn-abort-cancel');
const btnAbortConfirm = document.getElementById('btn-abort-confirm');

const statDead = document.getElementById('stat-dead');
const statEvidence = document.getElementById('stat-evidence');
const statChi2 = document.getElementById('stat-chi2');
const statChi2File = document.getElementById('stat-chi2-file');
const statChi2Cmb = document.getElementById('stat-chi2-cmb');
const statChi2Bao = document.getElementById('stat-chi2-bao');
const statChi2Sn = document.getElementById('stat-chi2-sn');
const statRawParams = document.getElementById('stat-raw-params');
const statCpu = document.getElementById('stat-cpu');
const cpuGaugePath = document.getElementById('cpu-gauge-path');
const progressFill = document.getElementById('progress-fill');
const progressPercent = document.getElementById('progress-percent');
const consoleBody = document.getElementById('console-body');

// Confidence Tracker (new main-screen confidence in likelihood + parameters)
const statConfidence = document.getElementById('stat-confidence');
const confEvidenceEl = document.getElementById('conf-evidence');
const confParamsEl = document.getElementById('conf-params');
const confSamplerEl = document.getElementById('conf-sampler');
const confMessageEl = document.getElementById('conf-message');

const classyBadge = document.getElementById('classy-badge');
const initFill = document.getElementById('init-fill');
const initPercent = document.getElementById('init-percent');
const statSpeed = document.getElementById('stat-speed');
const statEta = document.getElementById('stat-eta');
const constraintsCard = document.getElementById('constraints-card');
const constraintsBody = document.getElementById('constraints-body');
const tensionsCard = document.getElementById('tensions-card');
const statTensionsBadge = document.getElementById('stat-tensions-badge');
const statStrugglesBody = document.getElementById('stat-struggles-body');

// Optimizer Monitor Elements
const optStatEvals = document.getElementById('opt-stat-evals');
const optStatChi2 = document.getElementById('opt-stat-chi2');
const optStatChi2File = document.getElementById('opt-stat-chi2-file');
const optStatChi2Cmb = document.getElementById('opt-stat-chi2-cmb');
const optStatChi2Bao = document.getElementById('opt-stat-chi2-bao');
const optStatChi2Sn = document.getElementById('opt-stat-chi2-sn');
const optStatPhase = document.getElementById('opt-stat-phase');
const optCpuGaugePath = document.getElementById('opt-cpu-gauge-path');
const optStatCpu = document.getElementById('opt-stat-cpu');
const optStatSpeed = document.getElementById('opt-stat-speed');
const optStatEta = document.getElementById('opt-stat-eta');
const optProgressPercent = document.getElementById('opt-progress-percent');
const optProgressFill = document.getElementById('opt-progress-fill');

let monitorTabAutoSwitched = false;

window.switchMonitorTab = function(tabName) {
    const btnSampler = document.getElementById('btn-monitor-tab-sampler');
    const btnOptimizer = document.getElementById('btn-monitor-tab-optimizer');
    const viewSampler = document.getElementById('monitor-view-sampler');
    const viewOptimizer = document.getElementById('monitor-view-optimizer');
    
    if (!btnSampler || !btnOptimizer || !viewSampler || !viewOptimizer) return;
    
    if (tabName === 'optimizer') {
        btnSampler.classList.remove('active');
        btnOptimizer.classList.add('active');
        viewSampler.style.display = 'none';
        viewOptimizer.style.display = 'block';
    } else {
        btnSampler.classList.add('active');
        btnOptimizer.classList.remove('active');
        viewSampler.style.display = 'block';
        viewOptimizer.style.display = 'none';
    }
};

let localLogs = ['Waiting for run execution...'];
let lastTerminalLogs = [];
let plotCheckCounter = 0;

const plotContainer = document.getElementById('live-plot-container');
const plotImg = document.getElementById('live-plot-img');
const plotTimestamp = document.getElementById('plot-timestamp');

const valBaseline = document.getElementById('val-baseline');
const valCustom = document.getElementById('val-custom');
const valDelta = document.getElementById('val-delta');
const multimodalComparisonCard = document.getElementById('multimodal-comparison-card');
const multimodalComparisonBody = document.getElementById('multimodal-comparison-body');

const jeffreysCard = document.getElementById('jeffreys-card');
const jeffreysText = document.getElementById('jeffreys-text');
const jeffreysDesc = document.getElementById('jeffreys-desc');

const watchdogCard = document.getElementById('watchdog-card');
const watchdogText = document.getElementById('watchdog-text');
const watchdogDesc = document.getElementById('watchdog-desc');
const watchdogIcon = document.getElementById('watchdog-icon');

const inputCores = document.getElementById('input-cores');
const checkAutoRebuild = document.getElementById('check-autorebuild');
const btnToggleLcdm = document.getElementById('btn-toggle-lcdm');
const btnTogglePrtoe = document.getElementById('btn-toggle-prtoe');
const checkAutoRunLcdm = document.getElementById('check-autorun-lcdm');
const checkAutoRunCustom = document.getElementById('check-autorun-custom');

let currentProposedUpdates = {};
let isAutoRunning = false; // Flag to track and prevent duplicate auto-run triggers
let watchdogIgnored = false; // Flag to temporarily ignore watchdog
let lastRunStartTime = null; // Track run start time to persist ignore state across refreshes
let lastWatchdogAlertCount = 0; // Track watchdog alert count for audio alerts
let autoWatchdogEnabled = false;

function updateToggleUI() {
    const toggle = document.getElementById('toggle-auto-watchdog');
    if (!toggle) return;
    const handle = toggle.querySelector('.toggle-handle');
    if (!handle) return;
    if (autoWatchdogEnabled) {
        toggle.style.background = '#10ac84';
        handle.style.left = '18px';
    } else {
        toggle.style.background = 'rgba(255,255,255,0.15)';
        handle.style.left = '2px';
    }
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    // PERF: Fire checkStatus first so the main UI populates immediately.
    // Stagger non-critical fetches so they don't compete with first paint.
    checkStatus();
    setTimeout(() => fetchBaselines(), 300);   // baselines: slight delay, non-critical
    updateToggleUI();

    const toggleAutoWatchdog = document.getElementById('toggle-auto-watchdog');
    if (toggleAutoWatchdog) {
        toggleAutoWatchdog.addEventListener('click', async () => {
            const previousState = autoWatchdogEnabled;
            autoWatchdogEnabled = !autoWatchdogEnabled;
            updateToggleUI();
            try {
                const response = await fetch(`${API_URL}/api/settings/watchdog`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ auto_apply: autoWatchdogEnabled })
                });
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}`);
                }
            } catch (err) {
                console.error("Error updating watchdog settings:", err);
                appendLog(`[WATCHDOG] Failed to update settings: ${err.message}. Reverting toggle.`);
                autoWatchdogEnabled = previousState;
                updateToggleUI();
            }
        });
    }
    // PERFORMANCE FIX: Reduce polling from 3s to 5s to reduce server load and page refresh lag
    // 5 seconds is still very responsive for long-running MCMC chains
    statusInterval = setInterval(checkStatus, 5000);

    // Run Complete Summary Card event listeners
    const btnCloseSummary = document.getElementById('btn-close-summary');
    if (btnCloseSummary) {
        btnCloseSummary.addEventListener('click', () => {
            const card = document.getElementById('run-complete-summary-card');
            if (card) card.style.display = 'none';
        });
    }
    const btnViewOptimizerDetails = document.getElementById('btn-view-optimizer-details');
    if (btnViewOptimizerDetails) {
        btnViewOptimizerDetails.addEventListener('click', () => {
            const optTabBtn = document.getElementById('tab-btn-optimizer');
            if (optTabBtn) optTabBtn.click();
        });
    }

    // WebSocket for real-time (production improvement, fallback to poll)
    try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/status`;
        const ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'status_update' && msg.data) {
                // Update key UI elements live (extend as needed)
                if (window.updateStatusUI) window.updateStatusUI(msg.data);
                else console.log('WS status update (real-time):', msg.data.status);
                refreshDerivedParameters();
            }
        };
        ws.onerror = () => console.log('WS not available, using polling');
    } catch(e) { /* polling fallback */ }
    fetchSysInfo();
    loadClassEngines(true);
    // PERF: refreshDerivedParameters is slow on first load when no data exists.
    // Defer 800ms so it doesn't block initial paint.
    setTimeout(() => refreshDerivedParameters(), 800);

    // PERF: Lazy-load the nebula background image after first paint is done.
    // This avoids the Unsplash image blocking LCP (Largest Contentful Paint).
    requestIdleCallback(() => {
        document.body.style.backgroundImage =
            "linear-gradient(to bottom, rgba(3,0,8,0.4), rgba(3,0,8,0.9)), " +
            "url('https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=2560&auto=format&fit=crop')";
    }, { timeout: 1000 });

    // Wire Manage Engines button (prompt UI for adding/selecting engines)
    const manageBtn = document.getElementById('btn-manage-engines');
    if (manageBtn) {
        manageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const list = (classEnginesCache || []).map(e => `${e.id}: ${e.name} @ ${e.class_path}`).join('\n') || 'None';
            const choice = prompt(
                `Current CLASS Engines:\n${list}\n\nType "add" to register a new CLASS build,\n an engine ID to select it, or "refresh":`,
                'refresh'
            );
            if (!choice) return;
            const lc = choice.toLowerCase();
            if (lc === 'add') {
                addClassEngineQuick();
            } else if (lc === 'refresh') {
                loadClassEngines(true);
            } else {
                fetch(`${API_URL}/api/class_engines/select`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({id: choice})
                }).then(r => r.ok ? r.json() : Promise.reject()).then(() => {
                    loadClassEngines(true);
                    fetchSysInfo();
                }).catch(() => alert('Select failed'));
            }
        });
    }
    
    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetContent = document.getElementById(tabId);
            if (targetContent) targetContent.classList.add('active');

            // Trigger resize of charts in the selected tab to fix hidden dimensions issue
            setTimeout(() => {
                if (tabId === 'tab-curves') {
                    if (chartWMu) chartWMu.resize();
                    if (chartFSigma8) chartFSigma8.resize();
                } else if (tabId === 'tab-influence') {
                    if (chartInfluence) chartInfluence.resize();
                    refreshJacobianAndPulls();
                } else if (tabId === 'tab-compare') {
                    if (chartCompareW) chartCompareW.resize();
                    if (chartCompareFs8) chartCompareFs8.resize();
                    refreshCompare(); // Auto refresh comparison on tab switch
                } else if (tabId === 'tab-stability') {
                    if (chartSensitivity) chartSensitivity.resize();
                } else if (tabId === 'tab-playground') {
                    if (chartPlaygroundRatio) chartPlaygroundRatio.resize();
                    updatePlayground(); // Auto draw playground line
                    buildGeneralPlaygroundSliders(); // load dynamic generalized sliders
                } else if (tabId === 'tab-health') {
                    refreshSamplerBrain();
                    if (chartQualityTrace) chartQualityTrace.resize();
                    if (chartQualityAutocorr) chartQualityAutocorr.resize();
                    refreshChainQuality();
                } else if (tabId === 'tab-corner') {
                    if (chartTerrain) chartTerrain.resize();
                    refreshLikelihoodTerrain();
                } else if (tabId === 'tab-autopsy') {
                    if (chartResiduals) chartResiduals.resize();
                    refreshAutopsyAndResiduals();
                } else if (tabId === 'tab-perpoint') {
                    if (chartPerPointResiduals) chartPerPointResiduals.resize();
                    refreshPerPointChi2();
                } else if (tabId === 'tab-runcompare') {
                    if (chartRunCompareShifts) chartRunCompareShifts.resize();
                    populateRunsLists();
                    computeIcVsEvidence();  // auto refresh IC/evidence for comparison
                } else if (tabId === 'tab-provenance') {
                    refreshProvenanceLedger();
                } else if (tabId === 'tab-utils') {
                    refreshCheckpointsList();
                    refreshErrorLog();
                } else if (tabId === 'tab-tension') {
                    refreshDerivedParameters();
                    computeIcVsEvidence();
                }
            }, 50);
        });
    });

    // PERF: Defer chart initialization until after first paint and Chart.js is confirmed loaded.
    // initCharts() creates 13 Chart.js instances — doing it synchronously blocks the main thread.
    const _initChartsWhenReady = () => {
        if (typeof Chart !== 'undefined') {
            initCharts();
        } else {
            // Chart.js (deferred) not yet parsed — retry in 100ms
            setTimeout(_initChartsWhenReady, 100);
        }
    };
    setTimeout(_initChartsWhenReady, 200); // yield to browser paint first

    // Rebuild CLASS Wizard Compile Button
    const btnWizardCompile = document.getElementById('btn-wizard-compile');
    if (btnWizardCompile) {
        btnWizardCompile.addEventListener('click', handleWizardCompile);
    }

    // Export Figure Button
    const btnExportFigure = document.getElementById('btn-export-figure');
    if (btnExportFigure) {
        btnExportFigure.addEventListener('click', handleExportFigure);
    }

    // Download Notebook Button
    const btnDownloadNotebook = document.getElementById('btn-download-notebook');
    if (btnDownloadNotebook) {
        btnDownloadNotebook.addEventListener('click', () => {
            window.location.href = `${API_URL}/api/generate_notebook`;
        });
    }

    // Reset History Button
    const btnResetHistory = document.getElementById('btn-reset-history');
    if (btnResetHistory) {
        btnResetHistory.addEventListener('click', handleResetHistory);
    }

    // Evolution slider and play controls
    const evoSlider = document.getElementById('evolution-slider');
    if (evoSlider) {
        evoSlider.addEventListener('input', () => {
            showEvolutionFrame(parseInt(evoSlider.value));
        });
    }
    const btnPlayEvolution = document.getElementById('btn-play-evolution');
    if (btnPlayEvolution) {
        btnPlayEvolution.addEventListener('click', toggleEvolutionPlayback);
    }

    // Manual login button to force modal (ensures in-app modal is used, no native Basic prompt)
    const btnManualLogin = document.getElementById('btn-manual-login');
    const btnLogout = document.getElementById('btn-logout');
    if (btnManualLogin) {
        btnManualLogin.addEventListener('click', () => showLoginModal());
    }
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await fetch(`${API_URL}/api/logout`, { method: 'POST', credentials: 'include' });
            } catch(e) {}
            location.reload();
        });
    }
    // Both buttons always visible for easy access to the cool modal login flow or logout.

    // Phone link controls (make the often-breaking phone sync more robust + manual recovery)
    const btnPhoneCopy = document.getElementById('btn-phone-copy');
    const btnPhoneRefresh = document.getElementById('btn-phone-refresh');
    const btnPhoneSet = document.getElementById('btn-phone-set');
    const btnPhoneClear = document.getElementById('btn-phone-clear');
    const phoneLinkHrefEl = document.getElementById('phone-link-href');
    const phoneContainerEl = document.getElementById('phone-link-container');

    if (btnPhoneCopy && phoneLinkHrefEl) {
        btnPhoneCopy.addEventListener('click', (e) => {
            e.preventDefault();
            const fullUrl = phoneLinkHrefEl.href;
            if (fullUrl && fullUrl !== '#') {
                navigator.clipboard.writeText(fullUrl).then(() => {
                    const orig = btnPhoneCopy.textContent;
                    btnPhoneCopy.textContent = '✅';
                    setTimeout(() => { btnPhoneCopy.textContent = orig; }, 1200);
                }).catch(() => {
                    // fallback
                    prompt('Copy this phone URL:', fullUrl);
                });
            }
        });
    }
    if (btnPhoneRefresh) {
        btnPhoneRefresh.addEventListener('click', (e) => {
            e.preventDefault();
            checkStatus();
        });
    }
    if (btnPhoneSet) {
        btnPhoneSet.addEventListener('click', async (e) => {
            e.preventDefault();
            const current = (lastStatusData && lastStatusData.localtunnel_url) || (phoneLinkHrefEl ? phoneLinkHrefEl.href : '');
            const pasted = prompt('Paste a working phone tunnel URL (e.g. https://abc123.loca.lt) or leave empty to cancel.\n\nUse this for manual "npx localtunnel --port 8000" or if the auto link broke.', current || '');
            if (pasted === null) return; // cancel
            const urlVal = pasted.trim();
            // Validate URL is HTTP(S) before storing
            if (urlVal && !urlVal.match(/^https?:\/\//i)) {
                alert('Invalid URL: must start with http:// or https://');
                return;
            }
            try {
                const resp = await fetch(`${API_URL}/api/set_tunnel_url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ url: urlVal })
                });
                if (resp.ok) {
                    appendLog('[Phone] Tunnel URL set manually.');
                    checkStatus();
                } else {
                    const err = await resp.json().catch(() => ({}));
                    alert('Failed to set phone URL: ' + (err.detail || resp.status));
                }
            } catch (err) {
                alert('Error setting phone URL: ' + err.message);
            }
        });
    }
    if (btnPhoneClear) {
        btnPhoneClear.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('Clear the current phone tunnel link?')) return;
            try {
                const resp = await fetch(`${API_URL}/api/set_tunnel_url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ url: '' })
                });
                if (resp.ok) {
                    appendLog('[Phone] Tunnel URL cleared.');
                    checkStatus();
                }
            } catch (err) {
                // still refresh
                checkStatus();
            }
        });
    }

    // Global phone button (always visible compact control so you can fix the link even when hidden / auto broken)
    const btnPhoneGlobal = document.getElementById('btn-phone-set-global');
    if (btnPhoneGlobal) {
        btnPhoneGlobal.addEventListener('click', async (e) => {
            e.preventDefault();
            const current = (lastStatusData && lastStatusData.localtunnel_url) || (phoneLinkHrefEl ? phoneLinkHrefEl.href : '');
            const pasted = prompt('Paste a working phone tunnel URL (e.g. https://abc123.loca.lt) — this activates the Phone Sync link for remote/phone access.\n\nUseful if the launcher phone link "broke", tunnel expired, or you ran npx localtunnel manually in another terminal.', current || '');
            if (pasted === null) return;
            const urlVal = pasted.trim();
            // Validate URL is HTTP(S) before storing
            if (urlVal && !urlVal.match(/^https?:\/\//i)) {
                alert('Invalid URL: must start with http:// or https://');
                return;
            }
            try {
                const resp = await fetch(`${API_URL}/api/set_tunnel_url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ url: urlVal })
                });
                if (resp.ok) {
                    appendLog('[Phone] Tunnel URL set via global control.');
                    checkStatus();
                } else {
                    const err = await resp.json().catch(() => ({}));
                    alert('Failed to set phone URL: ' + (err.detail || resp.status));
                }
            } catch (err) {
                alert('Error setting phone URL: ' + err.message);
            }
        });
    }

    const btnBundle = document.getElementById('btn-submit-bundle');
    if (btnBundle) {
        btnBundle.addEventListener('click', () => {
            window.location.href = `${API_URL}/api/generate_submit_bundle`;
        });
    }

    const btnPPC = document.getElementById('btn-ppc');
    const btnFisher = document.getElementById('btn-fisher');
    const ppcResult = document.getElementById('ppc-fisher-result');
    if (btnPPC) {
        btnPPC.addEventListener('click', async () => {
            if (ppcResult) ppcResult.textContent = 'Running PPC...';
            const r = await fetch(`${API_URL}/api/posterior_predictive`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({n:20})});
            const j = await r.json();
            if (ppcResult) ppcResult.textContent = JSON.stringify(j, null, 2);
        });
    }
    if (btnFisher) {
        btnFisher.addEventListener('click', async () => {
            if (ppcResult) ppcResult.textContent = 'Running Fisher...';
            const r = await fetch(`${API_URL}/api/fisher_forecast`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({params:['H0','w0_fld']})});
            const j = await r.json();
            if (ppcResult) ppcResult.textContent = JSON.stringify(j, null, 2);
        });
    }

    const btnComputeExpr = document.getElementById('btn-compute-expr');
    if (btnComputeExpr) {
        btnComputeExpr.addEventListener('click', computeDerivedExpression);
    }
    const exprInput = document.getElementById('derived-expr-input');
    if (exprInput) {
        exprInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') computeDerivedExpression();
        });
    }

    const btnIcEvidence = document.getElementById('btn-ic-evidence');
    if (btnIcEvidence) {
        btnIcEvidence.addEventListener('click', computeIcVsEvidence);
    }
    // Basic copy for the IC card (extend as needed)
    const btnCopyIc = document.getElementById('btn-copy-ic-evidence');
    if (btnCopyIc) {
        btnCopyIc.addEventListener('click', () => {
            const body = document.getElementById('ic-evidence-body');
            if (body) copyToClipboard(body.innerText || 'IC vs Evidence comparison', 'btn-copy-ic-evidence');
        });
    }

    const btnReweight = document.getElementById('btn-reweight');
    if (btnReweight) {
        btnReweight.addEventListener('click', async () => {
            const body = document.getElementById('ic-evidence-values');
            if (body) body.textContent = 'Reweighting...';
            const r = await fetch(`${API_URL}/api/reweight`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({})});
            const j = await r.json();
            if (body) body.innerHTML = `Reweighted: ESS=${j.ess} ΔlogZ≈${j.approx_delta_logz}<br>${JSON.stringify(j.reweighted_params)}`;
        });
    }

    // New obsolete-AIC/BIC buttons: PSIS-LOO, Stacking, Savage-Dickey
    const btnPsis = document.getElementById('btn-psis-loo');
    const advBody = document.getElementById('advanced-metrics-body');
    if (btnPsis && advBody) {
        btnPsis.addEventListener('click', async () => {
            advBody.style.display = 'block';
            advBody.textContent = 'Computing PSIS-LOO + Pareto k...';
            try {
                const r = await fetch(`${API_URL}/api/psis_loo`);
                const j = await r.json();
                const p = j.psis_loo || {};
                let h = `PSIS-LOO elpd: ${p.elpd_loo || '?'} (SE ${p.se_elpd_loo || '?'}) p_loo=${p.p_loo || '?'} max_k=${p.pareto_k_max || '?'}`;
                if (p.high_k_warnings && p.high_k_warnings.length) h += `<br><span style="color:#ff9f43">⚠ ${p.high_k_warnings.join('; ')}</span>`;
                if (p.pareto_k_per_obs) h += `<br>k per probe: ${p.pareto_k_per_obs.join(', ')}`;
                advBody.innerHTML = h + `<br><small>${p.note || ''}</small>`;
            } catch(e) { advBody.textContent = 'PSIS error (run a model).'; }
        });
    }
    const btnStack = document.getElementById('btn-model-stacking');
    if (btnStack && advBody) {
        btnStack.addEventListener('click', async () => {
            advBody.style.display = 'block';
            advBody.textContent = 'Computing Bayesian Stacking weights...';
            try {
                const r = await fetch(`${API_URL}/api/model_stacking`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({})});
                const j = await r.json();
                const s = j.stacking || {};
                advBody.innerHTML = `Stacking weights: ${JSON.stringify(s.stacking_weights || {})}<br><small>${s.note || ''}</small>`;
            } catch(e) { advBody.textContent = 'Stacking error.'; }
        });
    }
    const btnSavage = document.getElementById('btn-savage-dickey');
    if (btnSavage && advBody) {
        btnSavage.addEventListener('click', async () => {
            advBody.style.display = 'block';
            advBody.textContent = 'Computing Savage-Dickey BF (nested)...';
            try {
                const r = await fetch(`${API_URL}/api/savage_dickey?param=xi_prtoe&point=0`);
                const j = await r.json();
                const sd = j.savage_dickey || {};
                advBody.innerHTML = `Savage-Dickey BF10 (xi=0): ${sd.bf10 || '?'}<br>post@0=${sd.posterior_density_at_point || '?'} prior@0=${sd.prior_density_at_point || '?'}<br><small>${sd.note || ''}</small>`;
            } catch(e) { advBody.textContent = 'Savage-Dickey error (needs samples + yaml prior).'; }
        });
    }

    // Toggle Neutrino Details
    const statNcdmHeader = document.getElementById('stat-ncdm-header');
    const statNcdmDetails = document.getElementById('stat-ncdm-details');
    const statNcdmArrow = document.getElementById('stat-ncdm-arrow');
    if (statNcdmHeader && statNcdmDetails && statNcdmArrow) {
        statNcdmHeader.addEventListener('click', () => {
            const isHidden = statNcdmDetails.style.display === 'none';
            statNcdmDetails.style.display = isHidden ? 'flex' : 'none';
            statNcdmArrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
        });
    }

    // Corner Plot Button
    const btnGenerateCorner = document.getElementById('btn-generate-corner');
    if (btnGenerateCorner) {
        btnGenerateCorner.addEventListener('click', handleGenerateCorner);
    }

    // Refresh Compare Button
    const btnRefreshCompare = document.getElementById('btn-refresh-compare');
    if (btnRefreshCompare) {
        btnRefreshCompare.addEventListener('click', refreshCompare);
    }

    // Run Scanner Button
    const btnRunScanner = document.getElementById('btn-run-scanner');
    if (btnRunScanner) {
        btnRunScanner.addEventListener('click', runStabilityScanner);
    }

    // Run Sensitivity Button
    const btnRunSensitivity = document.getElementById('btn-run-sensitivity');
    if (btnRunSensitivity) {
        btnRunSensitivity.addEventListener('click', runSensitivityAnalyzer);
    }

    // Playground Sliders
    const sliders = ['slide-delta', 'slide-xi', 'slide-zeta', 'slide-beta'];
    sliders.forEach(id => {
        const slideEl = document.getElementById(id);
        if (slideEl) {
            slideEl.addEventListener('input', updatePlayground);
        }
    });

    // Stagnation Recover & Manual Recover Buttons
    const btnStagRecover = document.getElementById('btn-stagnation-recover');
    if (btnStagRecover) {
        btnStagRecover.addEventListener('click', () => {
            showConfirmationModal(
                "Widen Priors & Proposals",
                "Are you sure you want to widen the parameter priors and proposal range? This will stop the active run and restart it using the Watchdog's recommendations.",
                "Widen & Restart",
                "Cancel",
                () => handleSamplerRecovery(0.20, 2.0)
            );
        });
    }
    const btnManualRecover = document.getElementById('btn-manual-recover');
    if (btnManualRecover) {
        btnManualRecover.addEventListener('click', () => {
            showConfirmationModal(
                "Widen Priors & Proposals",
                "Are you sure you want to widen the parameter priors and proposal range? This will stop the active run and restart it using the Watchdog's recommendations.",
                "Widen & Restart",
                "Cancel",
                () => handleSamplerRecovery(0.20, 2.0)
            );
        });
    }

    // Dismiss Stagnation Banner Button
    const btnStagDismiss = document.getElementById('btn-stagnation-dismiss');
    if (btnStagDismiss) {
        btnStagDismiss.addEventListener('click', () => {
            document.getElementById('stagnation-banner').style.display = 'none';
        });
    }

    // Download Repro Pack
    const btnDownloadRepro = document.getElementById('btn-download-repro');
    if (btnDownloadRepro) {
        btnDownloadRepro.addEventListener('click', () => {
            showConfirmationModal(
                "Package & Download",
                "Generate and download the journal submission reproducibility pack? This compiles the configuration, chains, best-fit stats, and plots into a single ZIP.",
                "Generate Pack",
                "Cancel",
                () => {
                    window.location.href = `${API_URL}/api/download_reproducibility_pack?config_name=${encodeURIComponent(activeConfig)}`;
                }
            );
        });
    }

    // Model Deformation Interpolator
    const slideDeform = document.getElementById('slide-deform-alpha');
    const valDeform = document.getElementById('val-deform-alpha');
    if (slideDeform && valDeform) {
        slideDeform.addEventListener('input', () => {
            const alpha = parseFloat(slideDeform.value);
            valDeform.textContent = alpha.toFixed(2);
            updateDeformation(alpha);
        });
    }

    // Parameter Freeze/Thaw
    document.querySelectorAll('.freeze-toggle').forEach(chk => {
        chk.addEventListener('change', async () => {
            const param = chk.getAttribute('data-param');
            const isSampled = chk.checked;
            appendLog(`[CONFIG] Sending freeze/thaw request: ${param} -> ${isSampled ? 'sampled (thawed)' : 'fixed (frozen)'}...`);
            try {
                const response = await fetch(`${API_URL}/api/freeze_thaw`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parameter: param,
                        sampled: isSampled,
                        config_name: activeConfig
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    appendLog(`[CONFIG] Success: ${data.message}`);
                } else {
                    const data = await response.json();
                    appendLog(`[CONFIG] Freeze/Thaw failed: ${data.detail || 'unknown error'}`);
                }
            } catch (err) {
                appendLog(`[CONFIG] Freeze/Thaw communication error: ${err.message}`);
            }
        });
    });

    // Posterior Evolution Movie Compiler
    const btnCompileGif = document.getElementById('btn-compile-gif');
    if (btnCompileGif) {
        btnCompileGif.addEventListener('click', async () => {
            const originalText = btnCompileGif.textContent;
            btnCompileGif.disabled = true;
            btnCompileGif.textContent = "🎬 Compiling GIF... (takes a few seconds)";
            appendLog("[PIPELINE] Compiling captured history frames into an animated GIF...");
            try {
                const response = await fetch(`${API_URL}/api/download_posterior_gif`);
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'posterior_evolution.gif';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                    appendLog("[PIPELINE] GIF compilation complete and downloaded.");
                } else {
                    const errData = await response.json();
                    appendLog(`[PIPELINE] GIF compilation failed: ${errData.detail || 'check logs'}`);
                }
            } catch(err) {
                appendLog(`[PIPELINE] GIF compiler error: ${err.message}`);
            } finally {
                btnCompileGif.disabled = false;
                btnCompileGif.textContent = originalText;
            }
        });
    }

    // Likelihood Terrain Dropdowns
    const xSelect = document.getElementById('terrain-param-x');
    const ySelect = document.getElementById('terrain-param-y');
    if (xSelect) {
        xSelect.addEventListener('change', () => {
            refreshLikelihoodTerrain();
        });
    }
    if (ySelect) {
        ySelect.addEventListener('change', () => {
            refreshLikelihoodTerrain();
        });
    }

    // Timeline Archival & Replay
    const btnArchiveRun = document.getElementById('btn-archive-run');
    if (btnArchiveRun) {
        btnArchiveRun.addEventListener('click', async () => {
            btnArchiveRun.disabled = true;
            appendLog(`[ARCHIVE] Archiving current run output prefix to timestamped backup...`);
            try {
                const response = await fetch(`${API_URL}/api/archive_run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config_name: activeConfig })
                });
                if (response.ok) {
                    const data = await response.json();
                    appendLog(`[ARCHIVE] Success: ${data.message || 'Archived successfully'}`);
                } else {
                    const data = await response.json();
                    appendLog(`[ARCHIVE] Archiving failed: ${data.detail || 'unknown error'}`);
                }
            } catch (err) {
                appendLog(`[ARCHIVE] Archiving error: ${err.message}`);
            } finally {
                btnArchiveRun.disabled = false;
            }
        });
    }

    const btnArchiveReplay = document.getElementById('btn-archive-replay');
    if (btnArchiveReplay) {
        btnArchiveReplay.addEventListener('click', async () => {
            btnArchiveReplay.disabled = true;
            appendLog(`[REPLAY] First archiving current run outputs...`);
            try {
                const response = await fetch(`${API_URL}/api/archive_run`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ config_name: activeConfig })
                });
                if (response.ok) {
                    const data = await response.json();
                    appendLog(`[REPLAY] Archive completed: ${data.message || 'Archived successfully'}`);
                    appendLog(`[REPLAY] Replaying/Starting new run...`);
                    triggerRun(true);
                } else {
                    const data = await response.json();
                    appendLog(`[REPLAY] Archive phase failed: ${data.detail || 'unknown error'}. Aborting replay.`);
                }
            } catch (err) {
                appendLog(`[REPLAY] Archiving/Replay error: ${err.message}`);
            } finally {
                btnArchiveReplay.disabled = false;
            }
        });
    }
    // Run Configuration Template System
    refreshTemplatesList();

    const btnLoadTemplate = document.getElementById('btn-load-template');
    if (btnLoadTemplate) {
        btnLoadTemplate.addEventListener('click', async () => {
            const selectEl = document.getElementById('select-config-template');
            const templateName = selectEl.value;
            if (!templateName) {
                alert("Please select a template to load.");
                return;
            }
            appendLog(`[TEMPLATES] Requesting load for template: ${templateName}...`);
            try {
                const response = await fetch(`${API_URL}/api/templates/load`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: templateName })
                });
                if (response.ok) {
                    const data = await response.json();
                    appendLog(`[TEMPLATES] SUCCESS: ${data.message}`);
                    activeConfig = "uploaded_config.yaml";
                    yamlName.textContent = `Active Config: uploaded_config.yaml (Template: ${templateName})`;
                    yamlName.classList.add('active');
                    if (yamlZone) {
                        yamlZone.classList.add('has-model');
                        yamlZone.classList.remove('empty');
                    }
                    appendLog(`[TEMPLATES] Active configuration has been updated.`);
                } else {
                    const data = await response.json();
                    appendLog(`[TEMPLATES] Load template failed: ${data.detail || 'unknown error'}`);
                }
            } catch (err) {
                appendLog(`[TEMPLATES] Connection error: ${err.message}`);
            }
        });
    }

    // Quick toggle buttons for LCDM and PRTOE
    if (btnToggleLcdm) {
        btnToggleLcdm.addEventListener('click', () => {
            const selectEl = document.getElementById('select-config-template');
            if (selectEl) {
                selectEl.value = 'lcdm_baseline';
                btnLoadTemplate.click();
            }
        });
    }
    if (btnTogglePrtoe) {
        btnTogglePrtoe.addEventListener('click', () => {
            const selectEl = document.getElementById('select-config-template');
            if (selectEl) {
                selectEl.value = 'prtoe_standard';
                btnLoadTemplate.click();
            }
        });
    }

    const btnSaveTemplate = document.getElementById('btn-save-template');
    if (btnSaveTemplate) {
        btnSaveTemplate.addEventListener('click', async () => {
            const nameEl = document.getElementById('input-template-name');
            const templateName = nameEl.value.trim();
            if (!templateName) {
                alert("Please enter a name for the custom template.");
                return;
            }
            appendLog(`[TEMPLATES] Saving current configuration as template: ${templateName}...`);
            try {
                const response = await fetch(`${API_URL}/api/templates/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: templateName,
                        config_name: activeConfig
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    appendLog(`[TEMPLATES] SUCCESS: ${data.message}`);
                    nameEl.value = '';
                    refreshTemplatesList();
                } else {
                    const data = await response.json();
                    appendLog(`[TEMPLATES] Save template failed: ${data.detail || 'unknown error'}`);
                }
            } catch (err) {
                appendLog(`[TEMPLATES] Connection error: ${err.message}`);
            }
        });
    }

    // Chain Quality Parameter Selector
    const qualityParamSelect = document.getElementById('select-quality-param');
    if (qualityParamSelect) {
        qualityParamSelect.addEventListener('change', () => {
            refreshChainQuality();
        });
    }

    // Save Checkpoint Button
    const btnSaveCheckpoint = document.getElementById('btn-save-checkpoint');
    if (btnSaveCheckpoint) {
        btnSaveCheckpoint.addEventListener('click', saveCheckpoint);
    }

    // Refresh Errors Button
    const btnRefreshErrors = document.getElementById('btn-refresh-errors');
    if (btnRefreshErrors) {
        btnRefreshErrors.addEventListener('click', refreshErrorLog);
    }

    // Clear Errors Button
    const btnClearErrors = document.getElementById('btn-clear-errors');
    if (btnClearErrors) {
        btnClearErrors.addEventListener('click', clearErrorLog);
    }

    // Initial load for Checkpoints and Errors
    refreshCheckpointsList();
    refreshErrorLog();

    // Initial: nebula ALWAYS visible as cosmic portal. Default counts as "model in" (has-model).
    // .running will be toggled live by status when sampler is executing.
    if (yamlZone) {
        yamlZone.classList.add('has-model');
        yamlZone.classList.remove('empty');
    }
});

function switchToLcdm() {
    activeConfig = 'lcdm_config.yaml';
    yamlName.textContent = 'Default: lcdm_config.yaml';
    yamlName.classList.remove('active');
    yamlInput.value = '';
    if (yamlZone) {
        yamlZone.classList.add('has-model');
        yamlZone.classList.remove('empty');
        yamlZone.classList.remove('running');
    }
    appendLog(`Reverted to default ΛCDM configuration: lcdm_config.yaml`);
}

function switchToCustom() {
    activeConfig = 'uploaded_config.yaml';
    yamlName.textContent = 'Custom: uploaded_config.yaml';
    yamlName.classList.add('active');
    if (yamlZone) {
        yamlZone.classList.add('has-model');
        yamlZone.classList.remove('empty');
    }
    appendLog(`Switched to custom configuration: uploaded_config.yaml`);
}

// Reset to ΛCDM
btnResetYaml.addEventListener('click', (e) => {
    e.preventDefault();
    switchToLcdm();
});

// Fetch active CLASS engine version
async function fetchSysInfo() {
    try {
        const response = await fetch(`${API_URL}/api/sysinfo`);
        const data = await response.json();
        classyBadge.textContent = `Engine: ${data.version}`;
        if (data.version.includes("PRTOE")) {
            classyBadge.style.borderColor = "#ff9ff3";
            classyBadge.style.color = "#ff9ff3";
            classyBadge.style.background = "rgba(255, 159, 243, 0.1)";
        } else {
            classyBadge.style.borderColor = "#00d2d3";
            classyBadge.style.color = "#00d2d3";
            classyBadge.style.background = "rgba(0, 210, 211, 0.1)";
        }
    } catch (err) {
        classyBadge.textContent = "Engine: Unknown";
    }
}

async function fetchMultimodalComparison() {
    if (!multimodalComparisonCard || !multimodalComparisonBody) return;
    try {
        const response = await fetch(`${API_URL}/api/multimodal_comparison`, { credentials: 'include' });
        if (!response.ok) {
            multimodalComparisonCard.style.display = 'none';
            return;
        }
        const data = await response.json();
        if (data.status === 'success' && data.modes && data.modes.length > 0) {
            multimodalComparisonCard.style.display = 'block';
            
            // Update the Run Complete Summary Card values
            const summaryCombinedLogZ = document.getElementById('summary-combined-logz');
            const summaryModesCount = document.getElementById('summary-modes-count');
            const summaryExplorationHealth = document.getElementById('summary-exploration-health');
            
            if (summaryCombinedLogZ) {
                summaryCombinedLogZ.textContent = data.combined_logz !== undefined && data.combined_logz !== null ? data.combined_logz.toFixed(4) : '-';
            }
            if (summaryModesCount) {
                summaryModesCount.textContent = data.modes.length;
            }
            if (summaryExplorationHealth) {
                summaryExplorationHealth.textContent = data.exploration_health || '100.0%';
            }
            
            // Show the card if the current run is completed and it's an optimizer run
            const runCompleteCard = document.getElementById('run-complete-summary-card');
            if (runCompleteCard && lastStatusData && lastStatusData.status === 'completed' && lastStatusData.is_optimizer) {
                runCompleteCard.style.display = 'block';
            }
            
            // Build the table html
            let html = `
                <table style="width: 100%; border-collapse: collapse; margin-top: 8px; text-align: left; font-size: 0.76rem; border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.15);">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(255,255,255,0.1); background: rgba(0, 210, 211, 0.1); color: #00d2d3;">
                            <th style="padding: 8px 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05);">Parameter / Metric</th>
            `;
            
            // Mode headers
            data.modes.forEach(mode => {
                html += `<th style="padding: 8px 6px; font-weight: bold; text-align: center; border-right: 1px solid rgba(255,255,255,0.05);">${escHtml(mode.name)}</th>`;
            });
            html += `</tr></thead><tbody>`;
            
            // Row for Total Chi2
            html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255, 159, 67, 0.05);">
                        <td style="padding: 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05); color: #ff9f43;">Total &chi;&sup2; (Raw)</td>`;
            data.modes.forEach(mode => {
                html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #ff9f43;">${mode.chi2 !== null ? mode.chi2.toFixed(4) : '-'}</td>`;
            });
            html += `</tr>`;

            // Row for Viability
            let hasViability = data.modes.some(mode => mode.viability_score !== undefined);
            if (hasViability) {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(16, 172, 132, 0.05);">
                            <td style="padding: 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05); color: #10ac84;">Physical Viability</td>`;
                data.modes.forEach(mode => {
                    const score = mode.viability_score;
                    let color = "#10ac84";
                    if (score && parseFloat(score) < 95.0) color = "#ee5253";
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: ${color};">${score ? escHtml(String(score)) : '-'}</td>`;
                });
                html += `</tr>`;
            }

            // Row for Penalized Chi2
            let hasPenalized = data.modes.some(mode => mode.penalized_chi2 !== undefined);
            if (hasPenalized) {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(95, 39, 205, 0.05);">
                            <td style="padding: 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05); color: #5f27cd;">Penalized &chi;&sup2;</td>`;
                data.modes.forEach(mode => {
                    const pen = mode.penalized_chi2;
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #5f27cd;">${pen !== undefined && pen !== null ? pen.toFixed(4) : '-'}</td>`;
                });
                html += `</tr>`;
            }

            // Row for Mode Stability
            let hasStability = data.modes.some(mode => mode.stability !== undefined && mode.stability !== null);
            if (hasStability) {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0, 210, 211, 0.05);">
                            <td style="padding: 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05); color: #00d2d3;">Mode Stability (Basin)</td>`;
                data.modes.forEach(mode => {
                    const stab = mode.stability;
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #00d2d3;">${stab ? escHtml(String(stab)) : '-'}</td>`;
                });
                html += `</tr>`;
            }

            // Row for Isolation Index
            let hasIsolation = data.modes.some(mode => mode.isolation !== undefined && mode.isolation !== null);
            if (hasIsolation) {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(241, 196, 15, 0.05);">
                            <td style="padding: 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05); color: #f1c40f;">Isolation Index</td>`;
                data.modes.forEach(mode => {
                    const isol = mode.isolation;
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #f1c40f;">${isol ? (parseFloat(isol) < 0 ? escHtml('N/A (Single Mode)') : escHtml(parseFloat(isol).toFixed(3))) : '-'}</td>`;
                });
                html += `</tr>`;
            }

            // Row for Mode Evidence
            let hasModeEvidence = data.modes.some(mode => mode.log_z !== undefined && mode.log_z !== null);
            if (hasModeEvidence) {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(155, 89, 182, 0.05);">
                            <td style="padding: 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05); color: #9b59b6;">Mode Evidence ln(Z)</td>`;
                data.modes.forEach(mode => {
                    const lz = mode.log_z;
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #9b59b6;">${lz ? escHtml(String(lz)) : '-'}</td>`;
                });
                html += `</tr>`;
            }

            // Row for MCMC Acceptance Rate
            let hasMcmcAcc = data.modes.some(mode => mode.acc_rate !== undefined && mode.acc_rate !== null);
            if (hasMcmcAcc) {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(52, 152, 219, 0.05);">
                            <td style="padding: 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05); color: #3498db;">MCMC Acc. Rate</td>`;
                data.modes.forEach(mode => {
                    const acc = mode.acc_rate;
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-weight: bold; color: #3498db;">${acc ? escHtml(String(acc)) : '-'}</td>`;
                });
                html += `</tr>`;
            }
            
            // Rows for parameters
            const allParams = new Set();
            data.modes.forEach(mode => {
                Object.keys(mode.params).forEach(k => allParams.add(k));
            });
            const sortedParams = Array.from(allParams).sort();
            
            sortedParams.forEach(param => {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 6px; border-right: 1px solid rgba(255,255,255,0.05); color: #a4b0be;">${escHtml(param)}</td>`;
                data.modes.forEach(mode => {
                    const val = mode.params[param];
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-family: var(--font-mono);">${val ? escHtml(String(val)) : '-'}</td>`;
                });
                html += `</tr>`;
            });
            
            // Rows for Derived Metrics
            const allMetrics = new Set();
            data.modes.forEach(mode => {
                Object.keys(mode.metrics).forEach(k => allMetrics.add(k));
            });
            const sortedMetrics = Array.from(allMetrics).sort();
            
            sortedMetrics.forEach(metric => {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0, 210, 211, 0.02);">
                            <td style="padding: 6px; border-right: 1px solid rgba(255,255,255,0.05); color: #00d2d3; font-weight: bold;">${escHtml(metric)}</td>`;
                data.modes.forEach(mode => {
                    const val = mode.metrics[metric];
                    let cellStyle = "";
                    if (val && val.includes("PHYSICALLY VIABLE")) {
                        cellStyle = "color: #10ac84; font-weight: bold;";
                    } else if (val && val.includes("UNPHYSICAL")) {
                        cellStyle = "color: #ee5a24; font-weight: bold;";
                    }
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); ${cellStyle}">${escHtml(val || '-')}</td>`;
                });
                html += `</tr>`;
            });
            
            // Rows for Likelihoods
            const allLikes = new Set();
            data.modes.forEach(mode => {
                Object.keys(mode.likes).forEach(k => allLikes.add(k));
            });
            const sortedLikes = Array.from(allLikes).sort();
            
            sortedLikes.forEach(like => {
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 6px; border-right: 1px solid rgba(255,255,255,0.05); color: #84817a; font-size: 0.72rem;">&chi;&sup2; (${escHtml(like.replace('chi2__', ''))})</td>`;
                data.modes.forEach(mode => {
                    const val = mode.likes[like];
                    html += `<td style="padding: 6px; text-align: center; border-right: 1px solid rgba(255,255,255,0.05); font-size: 0.72rem; color: #a4b0be;">${val ? parseFloat(val).toFixed(3) : '-'}</td>`;
                });
                html += `</tr>`;
            });
            
            html += `</tbody></table>`;
            
            let summaryHtml = "";
            if (data.combined_logz !== undefined && data.combined_logz !== null) {
                summaryHtml += `
                    <div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.8rem; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
                        <div><span style="color: #9b59b6; font-weight: bold;">Combined Multimodal Evidence ln(Z):</span> <span style="font-family: var(--font-mono); font-weight: bold; color: white;">${data.combined_logz.toFixed(4)}</span></div>
                        ${data.exploration_health ? `<div><span style="color: #10ac84; font-weight: bold;">Exploration Health:</span> <span style="font-weight: bold; color: white;">${escHtml(data.exploration_health)}</span></div>` : ''}
                    </div>
                `;
            }
            multimodalComparisonBody.innerHTML = summaryHtml + html;

            // Render Tension Analysis if present
            const tensionCard = document.getElementById('tension-analysis-card');
            const tensionBody = document.getElementById('tension-analysis-body');
            if (tensionCard && tensionBody) {
                if (data.tensions && data.tensions.length > 0) {
                    tensionCard.style.display = 'block';
                    let tHtml = `
                        <table style="width: 100%; border-collapse: collapse; margin-top: 8px; text-align: left; font-size: 0.76rem; border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.15);">
                            <thead>
                                <tr style="border-bottom: 2px solid rgba(255,255,255,0.1); background: rgba(238, 82, 83, 0.1); color: #ee5253;">
                                    <th style="padding: 8px 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05);">Modes Compared</th>
                                    <th style="padding: 8px 6px; font-weight: bold; border-right: 1px solid rgba(255,255,255,0.05);">Parameter</th>
                                    <th style="padding: 8px 6px; font-weight: bold; text-align: center;">Tension (&sigma;)</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;
                    data.tensions.forEach(t => {
                        let badgeColor = "#10ac84";
                        if (t.value >= 3.0) badgeColor = "#ee5253";
                        else if (t.value >= 2.0) badgeColor = "#ff9f43";
                        
                        tHtml += `
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <td style="padding: 6px; border-right: 1px solid rgba(255,255,255,0.05); color: #a4b0be;">${escHtml(t.mode1)} vs ${escHtml(t.mode2)}</td>
                                <td style="padding: 6px; border-right: 1px solid rgba(255,255,255,0.05); color: #00d2d3; font-weight: bold;">${escHtml(t.param)}</td>
                                <td style="padding: 6px; text-align: center; font-weight: bold; color: ${badgeColor};">${t.value.toFixed(2)} &sigma;</td>
                            </tr>
                        `;
                    });
                    tHtml += `</tbody></table>`;
                    tensionBody.innerHTML = tHtml;
                } else {
                    tensionCard.style.display = 'none';
                }
            }

            // Render Profile Likelihood Scan if present
            const profileCard = document.getElementById('profile-likelihood-card');
            const profilePlot = document.getElementById('profile-likelihood-plot');
            if (profileCard && profilePlot) {
                const imgUrl = `${API_URL}/profile_likelihood.png?` + new Date().getTime();
                const img = new Image();
                img.onload = function() {
                    profilePlot.src = imgUrl;
                    profilePlot.style.display = 'block';
                    profileCard.style.display = 'block';
                };
                img.onerror = function() {
                    profileCard.style.display = 'none';
                };
                img.src = imgUrl;
            }
        } else {
            multimodalComparisonCard.style.display = 'none';
            const tensionCard = document.getElementById('tension-analysis-card');
            if (tensionCard) tensionCard.style.display = 'none';
            const profileCard = document.getElementById('profile-likelihood-card');
            if (profileCard) profileCard.style.display = 'none';
        }
    } catch (err) {
        console.error("Error fetching multimodal comparison:", err);
        multimodalComparisonCard.style.display = 'none';
        const tensionCard = document.getElementById('tension-analysis-card');
        if (tensionCard) tensionCard.style.display = 'none';
        const profileCard = document.getElementById('profile-likelihood-card');
        if (profileCard) profileCard.style.display = 'none';
    }
}


async function refreshDerivedParameters() {
    const body = document.getElementById('derived-params-body');
    if (!body) return;
    try {
        const res = await fetch(`${API_URL}/api/derived_parameters`);
        if (!res.ok) {
            body.innerHTML = '<div style="color:#a4b0be">No derived data yet</div>';
            return;
        }
        const j = await res.json();
        if (j.status !== 'success' || !j.derived) {
            body.innerHTML = '<div style="color:#a4b0be">Run a model to populate derived quantities</div>';
            return;
        }
        const d = j.derived;
        let html = '';
        const nice = {
            'age': 'Age of Universe (Gyr)',
            'rs': 'Sound horizon r_s (Mpc)',
            '100_theta_s': '100 × θ_s',
            'sigma8': 'σ₈',
            'S8': 'S₈',
            'Omega_m': 'Ω_m',
            'Omega_Lambda': 'Ω_Λ',
            'z_reio': 'z_reio',
            'tau_reio': 'τ_reio'
        };
        Object.keys(d).forEach(k => {
            if (k === 'computed_at' || k === 'engine' || k === 'error') return;
            const label = nice[k] || k;
            const val = typeof d[k] === 'number' ? d[k].toFixed(5) : d[k];
            html += `<div><span style="color:#a4b0be">${escHtml(String(label))}:</span> <span style="color:#fff;font-weight:600">${escHtml(String(val))}</span></div>`;
        });
        if (d.engine) {
            html += `<div style="grid-column:1/-1; font-size:0.68rem; color:#666; margin-top:4px;">Computed with: ${escHtml(d.engine)}</div>`;
        }
        body.innerHTML = html || '<div style="color:#a4b0be">No standard deriveds available for this model</div>';
    } catch (e) {
        body.innerHTML = '<div style="color:#a4b0be">Error loading derived parameters</div>';
    }
}

async function computeDerivedExpression() {
    const input = document.getElementById('derived-expr-input');
    const resultDiv = document.getElementById('derived-expr-result');
    if (!input || !resultDiv) return;
    const expr = input.value.trim();
    if (!expr) return;
    try {
        const res = await fetch(`${API_URL}/api/derived_parameters`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({expressions: [expr]})
        });
        const j = await res.json();
        if (j.custom && j.custom[expr] !== undefined) {
            resultDiv.textContent = `${expr} = ${j.custom[expr]}`;
        } else {
            resultDiv.textContent = 'Error computing expression';
        }
    } catch(e) {
        resultDiv.textContent = 'Network error';
    }
}

async function computeIcVsEvidence() {
    const body = document.getElementById('ic-evidence-values');
    if (!body) return;
    body.textContent = 'Computing...';
    try {
        const [waicRes, compRes, bmaRes] = await Promise.all([
            fetch(`${API_URL}/api/waic_loo`),
            fetch(`${API_URL}/api/ic_vs_evidence_comparison`),
            fetch(`${API_URL}/api/bayes_factors_bma`)
        ]);
        const waic = await waicRes.json();
        const comp = await compRes.json();
        const bma = await bmaRes.json();
        let html = '';
        if (waic.waic_loo && waic.waic_loo.waic) {
            html += `WAIC: ${waic.waic_loo.waic} (p_eff=${waic.waic_loo.effective_params || '?'}) `;
        }
        if (waic.waic_loo && waic.waic_loo.psis_loo) {
            const p = waic.waic_loo.psis_loo;
            html += ` PSIS-LOO: ${p.elpd_loo || '?'} kmax=${p.pareto_k_max || '?'}`;
            if (p.high_k_warnings && p.high_k_warnings.length) html += ` <span style="color:#ff9f43">(k warning)</span>`;
        }
        if (comp.comparison) {
            html += ` AIC: ${comp.comparison.aic || '?'} BIC: ${comp.comparison.bic || '?'} `;
            if (comp.comparison.delta_logz_vs_lcdm) html += `ΔlogZ: ${comp.comparison.delta_logz_vs_lcdm}`;
            if (comp.comparison.psis_loo) {
                const p2 = comp.comparison.psis_loo;
                html += ` PSIS: elpd=${p2.elpd_loo || '?'} k=${p2.pareto_k_max || '?'}`;
            }
        }
        if (bma.bma && bma.bma.posterior_probs) {
            html += `<br>Model probs (BMA): ${bma.bma.posterior_probs.map((p,i) => `${bma.bma.names[i]}:${(p*100).toFixed(1)}%`).join(' ')}`;
        }
        html += `<br><small>${comp.comparison ? comp.comparison.recommendation || comp.comparison.note : ''}</small>`;
        body.innerHTML = html || 'Computed (see console for full). Evidence + WAIC/PSIS-LOO (k diagnostics) + Stacking + Savage-Dickey + PPC + tensions give the complete picture that obsoletes AIC/BIC.';
    } catch(e) {
        body.textContent = 'Error fetching comparison. Run models first for real numbers.';
    }
}

// Generalized playground: dynamic sliders from current model's YAML params
let generalPlaygroundDebounce = null;
async function buildGeneralPlaygroundSliders() {
    const container = document.getElementById('general-sliders-container');
    if (!container) return;
    container.innerHTML = '<div style="color:#a4b0be;font-size:0.7rem;">Loading parameters from active config...</div>';
    try {
        const res = await fetch(`${API_URL}/api/playground_params`);
        const data = await res.json();
        const params = data.params || [];
        container.innerHTML = '';
        if (params.length === 0) {
            container.innerHTML = '<div style="color:#a4b0be;font-size:0.7rem;">No adjustable params with priors found in YAML. Load a config with priors.</div>';
            return;
        }
        params.forEach(p => {
            const div = document.createElement('div');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.latex || p.name;
            const valSpan = document.createElement('span');
            valSpan.id = `val-gen-${p.name}`;
            valSpan.style.fontFamily = 'var(--font-mono)';
            valSpan.style.color = '#00d2d3';
            valSpan.textContent = p.ref.toFixed(4);
            
            const headerDiv = document.createElement('div');
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'space-between';
            headerDiv.style.color = '#fff';
            headerDiv.style.marginBottom = '2px';
            headerDiv.style.fontSize = '0.75rem';
            headerDiv.appendChild(nameSpan);
            headerDiv.appendChild(valSpan);
            
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'play-slider gen-slider';
            slider.dataset.param = p.name;
            slider.min = p.min;
            slider.max = p.max;
            slider.step = (p.max - p.min) / 100;
            slider.value = p.ref;
            slider.style.width = '100%';
            slider.style.height = '5px';
            slider.style.accentColor = '#00d2d3';
            slider.style.background = 'rgba(255,255,255,0.1)';
            slider.style.borderRadius = '3px';
            
            slider.addEventListener('input', () => {
                valSpan.textContent = parseFloat(slider.value).toFixed(4);
                // debounce update
                clearTimeout(generalPlaygroundDebounce);
                generalPlaygroundDebounce = setTimeout(() => {
                    updateGeneralPlayground();
                }, 200);
            });
            
            div.appendChild(headerDiv);
            div.appendChild(slider);
            container.appendChild(div);
        });
        // initial draw
        updateGeneralPlayground();
    } catch(e) {
        container.innerHTML = '<div style="color:#a4b0be;font-size:0.7rem;">Failed to load params</div>';
    }
}

async function updateGeneralPlayground() {
    const container = document.getElementById('general-sliders-container');
    if (!container) return;
    const sliders = container.querySelectorAll('.gen-slider');
    const extra = {};
    sliders.forEach(s => {
        extra[s.dataset.param] = parseFloat(s.value);
    });
    // call the existing playground curves with extra_args for general support
    try {
        // reuse the PRTOE request shape but with extra
        const payload = {
            // base cosmology from current or defaults
            omega_b: 0.0224,
            omega_cdm: 0.120,
            H0: 67.4,
            extra_args: extra
        };
        const res = await fetch(`${API_URL}/api/playground_curves`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        if (!res.ok) return;
        const curves = await res.json();
        // Update the playground ratio chart with the general results (same response format)
        if (chartPlaygroundRatio && curves.z && curves.H_ratio) {
            chartPlaygroundRatio.data.labels = curves.z.map(z => z.toFixed(2));
            chartPlaygroundRatio.data.datasets[0].data = curves.H_ratio;
            chartPlaygroundRatio.update('none');
        }
        console.log('General playground updated with extra_args:', extra);
    } catch(e) { console.warn('General playground update failed', e); }
}

// --- CLASS Engine Selector & Management (multi-engine support) ---
let classEnginesCache = [];

async function loadClassEngines(populateSelect = true) {
    try {
        const res = await fetch(`${API_URL}/api/class_engines`);
        if (!res.ok) return;
        const data = await res.json();
        classEnginesCache = data.engines || [];
        const activeId = data.active_id;

        if (populateSelect) {
            const sel = document.getElementById('select-class-engine');
            if (sel) {
                sel.innerHTML = '';
                if (classEnginesCache.length === 0) {
                    const opt = document.createElement('option');
                    opt.value = '';
                    opt.textContent = 'No engines registered';
                    sel.appendChild(opt);
                } else {
                    classEnginesCache.forEach(eng => {
                        const opt = document.createElement('option');
                        opt.value = eng.id;
                        opt.textContent = `${eng.name} (${eng.id})`;
                        if (eng.id === activeId) opt.selected = true;
                        sel.appendChild(opt);
                    });
                }
                // Wire change
                if (!sel._wired) {
                    sel.addEventListener('change', async () => {
                        const newId = sel.value;
                        if (!newId) return;
                        try {
                            const r = await fetch(`${API_URL}/api/class_engines/select`, {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({id: newId})
                            });
                            if (r.ok) {
                                // refresh badge with new engine
                                fetchSysInfo();
                                // optional: small toast
                                console.log('CLASS engine switched to', newId);
                            } else {
                                alert('Failed to switch CLASS engine');
                            }
                        } catch(e) { console.error(e); }
                    });
                    sel._wired = true;
                }
            }
        }
        return data;
    } catch (e) {
        console.warn('Could not load class engines', e);
    }
}

async function addClassEngineQuick() {
    // Simple prompt-based adder for quick use (full UI can be expanded in a tab later)
    const id = prompt('Engine ID (short, e.g. "standard" or "my_mg"):', 'standard');
    if (!id) return;
    const name = prompt('Display name:', 'Standard CLASS');
    const cp = prompt('Full path to CLASS source dir (must contain Makefile):', '/path/to/your/class');
    if (!cp) return;
    const notes = prompt('Notes (optional):', 'Standard CLASS for baseline comparisons');
    try {
        const r = await fetch(`${API_URL}/api/class_engines`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id, name, class_path: cp, notes, python_exe: null})
        });
        const j = await r.json();
        if (r.ok) {
            alert('Engine registered: ' + (j.engine ? j.engine.name : id));
            await loadClassEngines(true);
            // auto select the new one?
            const sel = document.getElementById('select-class-engine');
            if (sel) sel.value = id;
        } else {
            alert('Error: ' + (j.detail || 'could not register'));
        }
    } catch(e) { alert('Network error: ' + e); }
}

// File Upload Zones
setupUploadZone(yamlZone, yamlInput, handleYamlUpload);

function setupUploadZone(zone, input, handler) {
    if (!zone || !input) return;
    zone.addEventListener('click', (e) => {
        if (e.target === input) return;
        input.value = ''; // Reset value to force 'change' event even for the same file
        input.click();
    });
    zone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.value = '';
            input.click();
        }
    });
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('active');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('active'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('active');
        if (e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            handler(e.dataTransfer.files[0]);
        }
    });
    input.addEventListener('change', () => {
        if (input.files.length > 0) {
            handler(input.files[0]);
        }
    });
}

// YAML Configuration upload
async function handleYamlUpload(file) {
    isUploadingConfig = true;
    // Optimistically set the active config and UI immediately on selection.
    // Upload will copy content to uploaded_config.yaml on server.
    // This prevents starting with stale activeConfig (e.g. default lcdm) if user starts run
    // or auto-pipeline triggers while upload is in flight.
    activeConfig = 'uploaded_config.yaml';
    yamlName.textContent = file.name;
    yamlName.classList.add('active');
    if (yamlZone) {
        yamlZone.classList.add('has-model');
        yamlZone.classList.remove('empty');
        yamlZone.classList.remove('running'); // will be re-added live if running
    }
    appendLog(`Selected configuration: ${file.name}`);
    
    // Temporarily disable start/resume during upload to avoid race with activeConfig.
    if (btnStart) btnStart.disabled = true;
    if (btnStartOpt) btnStartOpt.disabled = true;
    if (btnResume) btnResume.disabled = true;
    if (btnApplyCosmicForge) btnApplyCosmicForge.disabled = true;
    if (btnLoadLastRun) btnLoadLastRun.disabled = true;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        appendLog('Uploading configuration to server...');
        const response = await fetch(`${API_URL}/api/upload_config`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (response.ok) {
            appendLog(`Configuration uploaded successfully (content copied to server active 'uploaded_config.yaml' slot + normalized for CLASS/Cobaya/PolyChord compatibility). Config loaded.`);
            // activeConfig already set to uploaded_config.yaml
        } else {
            appendLog(`Upload failed: ${data.detail}`);
            // Revert on failure
            switchToLcdm();
        }
    } catch (err) {
        appendLog(`Upload error: ${err.message}`);
        switchToLcdm();
    } finally {
        isUploadingConfig = false;
        // Re-enable buttons (status check will manage based on run state)
        if (btnStart) btnStart.disabled = false;
        if (btnStartOpt) btnStartOpt.disabled = false;
        if (btnResume) btnResume.disabled = false;
        if (btnApplyCosmicForge) btnApplyCosmicForge.disabled = false;
        if (btnLoadLastRun) btnLoadLastRun.disabled = false;
    }
}

// Start Run
btnStart.addEventListener('click', () => {
    showConfirmationModal(
        "Start New Run",
        "Are you sure you want to start a new cosmological run? This will terminate any active process group and overwrite previous sampling data.",
        "Yes, Start Run",
        "Cancel",
        () => triggerRun(true)
    );
});
if (btnStartOpt) {
    btnStartOpt.addEventListener('click', () => {
        showConfirmationModal(
            "Start CosmicForge",
            "Are you sure you want to start a fast cosmological optimization run using BOBYQA? This will terminate any active run and launch the new optimizer.",
            "Yes, Start CosmicForge",
            "Cancel",
            () => triggerRun(true, true)
        );
    });
}
const btnStartProfile = document.getElementById('btn-start-profile');
if (btnStartProfile) {
    btnStartProfile.addEventListener('click', () => {
        const param = document.getElementById('profile-param').value;
        const minVal = parseFloat(document.getElementById('profile-min').value);
        const maxVal = parseFloat(document.getElementById('profile-max').value);
        const steps = parseInt(document.getElementById('profile-steps').value) || 8;
        
        let range = null;
        if (!isNaN(minVal) && !isNaN(maxVal)) {
            range = [minVal, maxVal];
        }
        
        showConfirmationModal(
            "Start Profile Likelihood Scan",
            `Are you sure you want to start a Profile Likelihood Scan for parameter ${param}? This will fix ${param} at ${steps} points and optimize all other parameters at each step.`,
            "Yes, Start Scan",
            "Cancel",
            () => triggerRun(true, true, param, range, steps)
        );
    });
}
btnResume.addEventListener('click', () => triggerRun(false));

// Apply CosmicForge toggle - smart config mapping
if (btnApplyCosmicForge) {
    btnApplyCosmicForge.addEventListener('click', async () => {
        const configSelect = document.getElementById('select-config-template');
        if (!configSelect) {
            appendLog('[CosmicForge] Error: Config selector not found');
            return;
        }
        
        const selectedValue = configSelect.value;
        let cosmicForgeConfig = null;
        
        // Smart mapping: map selected config to CosmicForge version
        switch(selectedValue) {
            case 'prtoe_standard':
                cosmicForgeConfig = 'cosmic_dashboard/scripts/prtoe_standard_cosmicforge.yaml';
                break;
            case 'lcdm_baseline':
            case 'lcdm_config':
                cosmicForgeConfig = 'cosmic_dashboard/scripts/lcdm_config_cosmicforge.yaml';
                break;
            default:
                appendLog('[CosmicForge] Please select a valid preset config first (PRTOE Standard or ΛCDM Baseline)');
                return;
        }
        
        try {
            appendLog(`[CosmicForge] Applying CosmicForge settings for ${selectedValue}...`);
            
            const response = await fetch(`${API_URL}/api/templates/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: 'custom',
                    yaml_content: cosmicForgeConfig
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load: ${response.status}`);
            }
            
            const result = await response.json();
            appendLog(`✅ ${result.message}`);
            appendLog(`[CosmicForge] Ready to start with CosmicForge-optimized ${selectedValue} config`);
            
            // Update active config display
            activeConfig = cosmicForgeConfig;
            if (yamlName) {
                yamlName.textContent = `Active Config: ${cosmicForgeConfig}`;
            }
            
            // Refresh config display
            setTimeout(fetchConfigFile, 500);
            
        } catch (error) {
            appendLog(`[CosmicForge] Error: ${error.message}`);
        }
    });
}

// Load Last Run Configuration
if (btnLoadLastRun) {
    btnLoadLastRun.addEventListener('click', async () => {
        try {
            btnLoadLastRun.disabled = true;
            btnLoadLastRun.innerHTML = '⏳ Loading...';
            
            const response = await fetch(`${API_URL}/api/templates/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'last_run' })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load last run: ${response.status}`);
            }
            
            const result = await response.json();
            appendLog(`✅ ${result.message}`);
            appendLog('📝 Loaded configuration: last_run.yaml - Ready to start run with same settings');
            
            // Refresh config display
            setTimeout(fetchConfigFile, 500);
            
            btnLoadLastRun.innerHTML = '📱 Replay Last Run';
            btnLoadLastRun.disabled = false;
        } catch (error) {
            console.error('Error loading last run:', error);
            appendLog(`❌ Failed to load last run: ${error.message}`);
            btnLoadLastRun.innerHTML = '📱 Replay Last Run';
            btnLoadLastRun.disabled = false;
        }
    });
}

async function triggerRun(forceOverwrite, isOptimizer = false, profileParam = null, profileRange = null, profileSteps = 8) {
    // Authoritative upload gating: prevent run if config uploadis in progress
    if (isUploadingConfig) {
        appendLog('[PIPELINE] Cannot start run: configuration upload is in progress. Please wait for upload to complete.');
        return;
    }
    
    isAutoRunning = false;
    btnStart.disabled = true;
    if (btnStartOpt) btnStartOpt.disabled = true;
    btnResume.disabled = true;
    if (btnApplyCosmicForge) btnApplyCosmicForge.disabled = true;
    if (btnLoadLastRun) btnLoadLastRun.disabled = true;
    const cores = inputCores ? (parseInt(inputCores.value) || 24) : 24;
    
    // Only auto-rebuild if it's checked AND we are starting fresh. We shouldn't rebuild mid-resume.
    const autoRebuild = (checkAutoRebuild && checkAutoRebuild.checked && forceOverwrite);
    
    if (autoRebuild) {
        appendLog(`[CLASS ENGINE] Auto-rebuilding before run using ${cores} cores...`);
    } else {
        appendLog(`[CLASS ENGINE] Auto-rebuild disabled. Resuming previous run if available...`);
    }
    // Use friendly display name if user selected a specific file (e.g. cobaya_prtoe_polychord.yaml),
    // but the internal activeConfig for the API is the normalized 'uploaded_config.yaml' (or template).
    const configForLog = (yamlName && yamlName.textContent && yamlName.textContent.includes('.')) 
        ? yamlName.textContent 
        : activeConfig;
    if (isOptimizer) {
        if (profileParam) {
            appendLog(`Starting Profile Scan for ${profileParam} on ${cores} cores with config: ${configForLog}...`);
        } else {
            appendLog(`Starting Cosmo Optimizer on ${cores} cores with config: ${configForLog} (active slot: ${activeConfig})...`);
        }
    } else {
        appendLog(`Starting PolyChord nested sampling on ${cores} cores with config: ${configForLog} (active slot: ${activeConfig})...`);
    }
    
    try {
        const response = await fetch(`${API_URL}/api/start_run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                config_name: activeConfig,
                cores: cores,
                auto_rebuild: autoRebuild,
                force_overwrite: forceOverwrite,
                is_optimizer: isOptimizer,
                optimizer_method: "bobyqa",
                optimizer_multistart: isOptimizer && !profileParam ? 4 : 1,
                optimizer_mcmc_steps: isOptimizer && !profileParam ? 100 : 0,
                profile_param: profileParam,
                profile_range: profileRange,
                profile_steps: profileSteps
            })
        });
        const data = await response.json();
        if (response.ok) {
            appendLog(`Process started in background. PID: ${data.pid}`);
            localStorage.removeItem('intergalacticPlayed');
            if (autoRebuild) fetchSysInfo(); // Update engine badge
            checkStatus();
        } else {
            appendLog(`Failed to start: ${data.detail}`);
            btnStart.disabled = false;
            if (btnStartOpt) btnStartOpt.disabled = false;
            btnResume.disabled = false;
            if (btnApplyCosmicForge) btnApplyCosmicForge.disabled = false;
            if (btnLoadLastRun) btnLoadLastRun.disabled = false;
        }
    } catch (err) {
        appendLog(`Execution error: ${err.message}`);
        btnStart.disabled = false;
        if (btnStartOpt) btnStartOpt.disabled = false;
        btnResume.disabled = false;
        if (btnApplyCosmicForge) btnApplyCosmicForge.disabled = false;
        if (btnLoadLastRun) btnLoadLastRun.disabled = false;
    }
}

// Stop Run event listeners
if (btnStop && abortModal) {
    btnStop.addEventListener('click', () => {
        abortModal.classList.add('active');
    });

    btnAbortCancel.addEventListener('click', () => {
        abortModal.classList.remove('active');
    });

    // Close modal when clicking the overlay backdrop itself
    abortModal.addEventListener('click', (e) => {
        if (e.target === abortModal) {
            abortModal.classList.remove('active');
        }
    });

    btnAbortConfirm.addEventListener('click', async () => {
        abortModal.classList.remove('active');
        btnStop.disabled = true;
        const isOptimizerRun = (lastStatusData && lastStatusData.is_optimizer);
        appendLog(isOptimizerRun ? 'Sending termination signal to CosmicForge process tree...' : 'Sending termination signal to sampler process group...');
        
        try {
            const response = await fetch(`${API_URL}/api/stop_run`, {
                method: 'POST'
            });
            const data = await response.json();
            if (response.ok) {
                const message = isOptimizerRun 
                    ? 'Abort signal sent to CosmicForge. Multiple Cobaya sub-processes may take several seconds to terminate. Dashboard will update when complete.'
                    : 'Abort signal sent. For mpirun/Cobaya runs the process tree may take a few seconds to fully die (MPI ranks, workers). Dashboard state updated immediately; status will reflect "stopped" shortly.';
                appendLog(message);
                // Force local button disabled + optimistic status
                btnStop.disabled = true;
                // Poll a couple times quickly, then more for CosmicForge
                setTimeout(checkStatus, 800);
                setTimeout(checkStatus, 2500);
                if (isOptimizerRun) {
                    setTimeout(checkStatus, 5000);
                    setTimeout(checkStatus, 8000);
                }
            } else {
                appendLog(`Failed to stop process: ${data.detail}`);
                btnStop.disabled = false;
            }
        } catch (err) {
            appendLog(`Abort error: ${err.message}`);
            btnStop.disabled = false;
        }
    });
}

// Download Archive
if (btnDownload) {
    btnDownload.addEventListener('click', () => {
        appendLog('Packaging and downloading chain data archive...');
        window.location.href = `${API_URL}/api/download_chains`;
    });
}

// Fetch baseline evidence from server
async function fetchBaselines() {
    try {
        const response = await fetch(`${API_URL}/api/baselines`);
        const data = await response.json();
        const baseline = data["planck_bao_pantheonplus_shoes"];
        if (baseline !== undefined && baseline !== null) {
            if (typeof baseline === 'object') {
                baselineLogEvidence = baseline.log_evidence;
                baselineBestChi2 = baseline.best_chi2;
            } else {
                baselineLogEvidence = baseline;
                baselineBestChi2 = null;
            }
            valBaseline.textContent = baselineLogEvidence.toFixed(4);
        } else {
            valBaseline.textContent = "-";
            baselineLogEvidence = null;
            baselineBestChi2 = null;
        }
        updateEvidenceBreakdown();
    } catch (err) {
        valBaseline.textContent = "-";
        baselineLogEvidence = null;
        baselineBestChi2 = null;
        console.error('Error fetching baselines:', err);
    }
}

// Update baseline database
async function updateBaseline(dataset, evidence, chi2, evidenceIsFinal, evidenceSource) {
    if (!evidenceIsFinal) {
        appendLog('[PIPELINE] Baseline not updated: evidence is live/preview only. Waiting for final PolyChord stats.');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/api/update_baseline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataset: dataset,
                log_evidence: evidence,
                best_chi2: chi2,
                evidence_is_final: evidenceIsFinal,
                evidence_source: evidenceSource || null
            })
        });
        const data = await response.json();
        if (response.ok) {
            appendLog(`[PIPELINE] Baseline updated successfully.`);
            fetchBaselines(); // Refresh the UI value
        } else {
            appendLog(`[PIPELINE] Failed to update baseline: ${data.detail}`);
        }
    } catch (err) {
        appendLog(`[PIPELINE] Error updating baseline: ${err.message}`);
    }
}

// Check current status
async function checkStatus() {
    try {
        const response = await fetch(`${API_URL}/api/status`, { credentials: 'include' });
        if (response.status === 401) {
            showLoginModal(() => checkStatus());  // retry after login
            return;
        }
        if (!response.ok) return;
        const data = await response.json();
        lastStatusData = data;
        
        if (data.auto_apply_watchdog !== undefined && data.auto_apply_watchdog !== autoWatchdogEnabled) {
            autoWatchdogEnabled = data.auto_apply_watchdog;
            updateToggleUI();
        }
        
        // Show/hide Optimizer tab button dynamically
        const optBtn = document.getElementById('tab-btn-optimizer');
        if (optBtn) {
            optBtn.style.display = 'block';
            // Highlight when optimizer is active
            if (data.is_optimizer) {
                optBtn.style.background = 'rgba(162, 155, 254, 0.3)';
                optBtn.style.border = '1px solid #a29bfe';
            } else {
                optBtn.style.background = '';
                optBtn.style.border = '';
            }
        }

        // Refresh drool-worthy derived params when we have new best-fit info
        if (data.best_raw_params || data.best_chi2 !== null || data.log_evidence !== null || data.status === 'running' || data.status === 'completed') {
            refreshDerivedParameters();
            fetchMultimodalComparison();
            fetchMcmcDiagnostics();
            fetchModeMetadata();
             
            // Refresh optimizer real-time convergence plot
            if (data.is_optimizer) {
                const optImg = document.getElementById('optimizer-plot-img');
                if (optImg) {
                    optImg.src = `${API_URL}/api/posteriors_plot?t=${Date.now()}`;
                    optImg.style.display = 'block';
                }
            }
        }
        
        // Update Phone Sync link
        const phoneLinkContainer = document.getElementById('phone-link-container');
        const phoneLinkHref = document.getElementById('phone-link-href');
        if (phoneLinkContainer && phoneLinkHref) {
            if (data.localtunnel_url && data.localtunnel_url.match(/^https?:\/\//i)) {
                phoneLinkContainer.style.display = 'flex';
                phoneLinkHref.href = data.localtunnel_url;
                phoneLinkHref.textContent = data.localtunnel_url.replace(/^https?:\/\//, '');
                phoneLinkHref.title = 'Open on your phone (login with the dashboard credentials). Click controls for copy/refresh/set/clear.';
                phoneLinkHref.onclick = null; // clear any previous manual trigger
            } else {
                // Always show a compact indicator so user knows the feature exists and how to activate
                phoneLinkContainer.style.display = 'flex';
                phoneLinkHref.href = '#';
                phoneLinkHref.textContent = 'not active (click 📝 or header 📱sync)';
                phoneLinkHref.title = 'Phone tunnel not set. Use launcher for auto, or click the 📱sync button in header (or this) to paste a manual npx localtunnel URL. Backend now falls back to chains/current_phone_url.txt too.';
                // Make the text act as trigger for set
                phoneLinkHref.onclick = function(e) {
                    e.preventDefault();
                    const globalBtn = document.getElementById('btn-phone-set-global');
                    if (globalBtn) globalBtn.click();
                };
            }
        }
        
        // Append external logs (from monitor script)
        if (data.external_logs && data.external_logs.length > 0) {
            data.external_logs.forEach(log => appendLog(`[ALERT] ${log}`));
        }
        
        if (data.terminal_output && data.terminal_output.length > 0) {
            lastTerminalLogs = data.terminal_output;
        } else if (data.status === 'idle') {
            lastTerminalLogs = [];
        }
        renderLogs();
        
        // Update status indicator
        updateStatusIndicator(data.status);

        // NEBULA ALIVE: toggle has-model (ensure visible + readable) + .running for when model being ran
        // This makes the drop-box nebula "come alive" precisely when the sampler is executing.
        updateNebulaPortalStatus(data.status, true);
        
        const labelCustomModel = document.getElementById('label-custom-model');
        const activeYamlPathLower = (data.active_yaml_path || '').toLowerCase();
        const activePrefixLower = (data.active_output_prefix || '').toLowerCase();
        const activeConfigLower = (activeConfig || '').toLowerCase();
        const yamlNameLower = (yamlName ? yamlName.textContent : '').toLowerCase();
        const isLcdm = data.is_lcdm ||
                       activeYamlPathLower.includes('lcdm') ||
                       activePrefixLower.includes('lcdm') ||
                       activeConfigLower.includes('lcdm') ||
                       yamlNameLower.includes('lcdm') ||
                       yamlNameLower.includes('baseline');
        if (labelCustomModel) {
            // Always keep the second row labeled as the "Custom Model" slot in the comparison UI.
            // When running the LCDM baseline (isLcdm), this slot shows "-" (placeholder for future custom).
            // This prevents the duplicate "ΛCDM log(Zlcdm)" labels.
            // The first row (hardcoded in HTML) is always "ΛCDM Baseline log(Zlcdm):",
            // the dynamic second is always "Custom Model log(Zcustom):" (or placeholder when baseline is active).
            labelCustomModel.innerHTML = 'Custom Model log(Z<sub>custom</sub>):';
        }
        
        // Update stats
        statDead.textContent = data.dead_points;
        if (data.log_evidence !== null) {
            const errText = (data.log_evidence_error !== null && data.log_evidence_error !== undefined) ? ` +/- ${data.log_evidence_error.toFixed(2)}` : '';
            const finalTag = data.evidence_is_final ? '' : ' (live/debug)';
            statEvidence.textContent = `${data.log_evidence.toFixed(2)}${errText}${finalTag}`;
            if (isLcdm) {
                valBaseline.textContent = data.log_evidence.toFixed(4);
                valCustom.textContent = "-";
                valDelta.textContent = "0.0000";
                jeffreysCard.className = 'jeffreys-card jeffreys-inconclusive';
                jeffreysText.textContent = 'ΛCDM Baseline Running';
                jeffreysDesc.textContent = 'Currently running or displaying the standard ΛCDM baseline. Model comparison will activate when a custom model is loaded.';
            } else {
                valCustom.textContent = data.log_evidence.toFixed(4);
                if (data.evidence_is_final) {
                    calculateEvidence(data.log_evidence);
                } else {
                    appendLog('[PIPELINE] Live/preview evidence is visible for debugging only; final preference waits for PolyChord .stats.');
                }
            }
        } else {
            statEvidence.textContent = "-";
            if (!isLcdm) {
                valCustom.textContent = "-";
            }
        }

        // At-a-glance ACTUAL model preference from the DATA (full Bayesian evidence ΔlogZ, WAIC/LOO, BMA, tensions resolved, PPC).
        // This completely ignores AIC/BIC point-estimate hacks and tells you which model is data preferred by the posterior.
        const prefEl = document.getElementById('evidence-preferred-model');
        if (prefEl && data.comparison && data.comparison.evidence_based_preference) {
            const prefText = data.comparison.evidence_based_preference;
            prefEl.textContent = prefText;
            const prefLower = prefText.toLowerCase();
            if (prefLower.includes('custom')) {
                if (prefLower.includes('decisively')) {
                    prefEl.style.background = 'rgba(57, 255, 20, 0.3)';
                    prefEl.style.color = '#39ff14';
                    prefEl.style.border = '1px solid #39ff14';
                } else if (prefLower.includes('strongly')) {
                    prefEl.style.background = 'rgba(255, 183, 0, 0.25)';
                    prefEl.style.color = '#ffb700';
                    prefEl.style.border = '1px solid #ffb700';
                } else {
                    prefEl.style.background = 'rgba(0, 210, 211, 0.2)';
                    prefEl.style.color = '#00d2d3';
                    prefEl.style.border = '1px solid #00d2d3';
                }
            } else if (prefLower.includes('lcdm') || prefLower.includes('baseline')) {
                prefEl.style.background = 'rgba(255, 0, 127, 0.25)';
                prefEl.style.color = '#ff007f';
                prefEl.style.border = '1px solid #ff007f';
            } else {
                prefEl.style.background = 'rgba(255,255,255,0.05)';
                prefEl.style.color = '#fff';
                prefEl.style.border = '1px solid rgba(255,255,255,0.1)';
            }
        } else if (prefEl) {
            prefEl.textContent = 'Inconclusive (need baseline + custom evidence)';
            prefEl.style.background = 'rgba(255,255,255,0.05)';
            prefEl.style.color = '#a4b0be';
        }
        
        if (data.best_chi2 !== null && data.best_chi2 !== undefined) {
            statChi2.textContent = data.best_chi2.toFixed(2);
            // Display which file/config is being tracked
            if (statChi2File && (data.active_output_prefix || data.active_yaml_path)) {
                const fileInfo = data.active_output_prefix ? `File: ${data.active_output_prefix}` : `Config: ${data.active_yaml_path || 'unknown'}`;
                statChi2File.textContent = fileInfo;
            }
            if (data.best_cmb !== null && data.best_cmb !== undefined) {
                statChi2Cmb.textContent = data.best_cmb.toFixed(1);
                statChi2Bao.textContent = data.best_bao !== null && data.best_bao !== undefined ? data.best_bao.toFixed(1) : "-";
                statChi2Sn.textContent = data.best_sn !== null && data.best_sn !== undefined ? data.best_sn.toFixed(1) : "-";
            }
        } else {
            statChi2.textContent = "-";
            if (statChi2File) statChi2File.textContent = "-";
            statChi2Cmb.textContent = "-";
            statChi2Bao.textContent = "-";
            statChi2Sn.textContent = "-";
        }

        // Update new Confidence Tracker (likelihood + parameters confidence from sampler)
        if (data.confidence_tracker) {
            const ct = data.confidence_tracker;
            if (statConfidence) {
                statConfidence.textContent = ct.overall + '%';
                if (ct.overall >= 80) {
                    statConfidence.style.color = 'var(--neon-green)';
                } else if (ct.overall >= 55) {
                    statConfidence.style.color = '#f1c40f';
                } else {
                    statConfidence.style.color = '#e74c3c';
                }
            }
            if (confEvidenceEl) confEvidenceEl.textContent = (ct.evidence || '-') + '%';
            if (confParamsEl) confParamsEl.textContent = (ct.parameters || '-') + '%';
            if (confSamplerEl) confSamplerEl.textContent = (ct.sampler || '-') + '%';
            if (confMessageEl) confMessageEl.textContent = ct.message || '';
        } else {
            if (statConfidence) statConfidence.textContent = '-';
            if (confMessageEl) confMessageEl.textContent = 'Waiting for run data...';
        }
        
        if (data.best_raw_params) {
            statRawParams.style.display = 'block';
            let rawHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">';
            for (const [key, val] of Object.entries(data.best_raw_params)) {
                if (!key.startsWith('chi2__') && !key.startsWith('minuslogprior')) {
                    let formattedVal = (typeof val === 'number') ? val.toPrecision(4) : val;
                    rawHtml += `<div><span style="color:#00d2d3">${escHtml(key)}</span>: ${escHtml(String(formattedVal))}</div>`;
                }
            }
            rawHtml += '</div>';
            statRawParams.innerHTML = rawHtml;
        } else {
            statRawParams.style.display = 'none';
        }
        
        // Update CPU Speedometer Gauge
        updateCpuGauge(data.cpu_percent);

        // Update speed and ETA
        if (statSpeed) statSpeed.textContent = (data.speed !== null && data.speed !== undefined) ? data.speed : "-";
        if (statEta) statEta.textContent = (data.eta !== null && data.eta !== undefined) ? data.eta : "-";

        // Update 1-sigma constraints table
        if (data.constraints && data.constraints.length > 0) {
            constraintsCard.style.display = 'block';
            let constraintsHtml = '<div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 5px;">';
            data.constraints.forEach(c => {
                constraintsHtml += `<div><span style="color:#00d2d3">${escHtml(c.parameter)}</span></div><div>${escHtml(String(c.mean))} &plusmn; ${escHtml(String(c.error))}</div>`;
            });
            constraintsHtml += '</div>';
            constraintsBody.innerHTML = constraintsHtml;
        } else {
            constraintsCard.style.display = 'none';
        }

        // Update tensions and struggles
        // Render Tensions Badge
        statTensionsBadge.textContent = data.tension_status || "Unknown";
        if (data.tension_status === "Both Solved!") {
            statTensionsBadge.style.background = "rgba(57, 255, 20, 0.2)";
            statTensionsBadge.style.color = "#39ff14";
            statTensionsBadge.style.border = "1px solid #39ff14";
        } else if (data.tension_status && data.tension_status.includes("Solved")) {
            statTensionsBadge.style.background = "rgba(255, 183, 0, 0.2)";
            statTensionsBadge.style.color = "#ffb700";
            statTensionsBadge.style.border = "1px solid #ffb700";
        } else {
            statTensionsBadge.style.background = "rgba(255, 0, 127, 0.2)";
            statTensionsBadge.style.color = "#ff007f";
            statTensionsBadge.style.border = "1px solid #ff007f";
        }

        // Render simple Neutrino Stability line under tensions badge (eV + stability)
        const statNeutrinoLine = document.getElementById('stat-neutrino-line');
        const statNeutrinoBadge = document.getElementById('stat-neutrino-badge');
        if (statNeutrinoLine && statNeutrinoBadge && data.tensions && data.tensions.Mnu_status) {
            const mnu = data.tensions.Mnu_status || "Unknown";
            statNeutrinoLine.style.display = 'flex';
            statNeutrinoBadge.textContent = mnu;
            if (mnu.includes("Consistent") || mnu.includes("<0.12")) {
                statNeutrinoBadge.style.background = "rgba(57, 255, 20, 0.2)";
                statNeutrinoBadge.style.color = "#39ff14";
                statNeutrinoBadge.style.border = "1px solid #39ff14";
            } else if (mnu.includes("Tension")) {
                statNeutrinoBadge.style.background = "rgba(255, 0, 127, 0.2)";
                statNeutrinoBadge.style.color = "#ff007f";
                statNeutrinoBadge.style.border = "1px solid #ff007f";
            } else {
                statNeutrinoBadge.style.background = "rgba(255,255,255,0.05)";
                statNeutrinoBadge.style.color = "#fff";
                statNeutrinoBadge.style.border = "1px solid rgba(255,255,255,0.1)";
            }
        } else if (statNeutrinoLine) {
            statNeutrinoLine.style.display = 'none';
        }
        
        // Render Neutrino Sector status
        const statNcdmSection = document.getElementById('stat-ncdm-section');
        const statNcdmBadge = document.getElementById('stat-ncdm-badge');
        const statNcdmDetails = document.getElementById('stat-ncdm-details');
        if (statNcdmSection && statNcdmBadge) {
            if (data.ncdm_status && data.ncdm_status.enabled) {
                statNcdmSection.style.display = 'flex';
                const strugglesCount = data.ncdm_status.struggles || 0;
                
                let massText = "Enabled";
                let massVal = 0.0;
                if (data.ncdm_status.mass !== null && data.ncdm_status.mass !== undefined) {
                    massVal = parseFloat(data.ncdm_status.mass);
                    massText = `${massVal.toFixed(3)} eV`;
                }
                
                let stabilityText = strugglesCount > 0 ? "Unstable" : "Stable";
                if (strugglesCount > 0) {
                    statNcdmBadge.textContent = `${massText} (${stabilityText}: ${strugglesCount} fail(s))`;
                    statNcdmBadge.style.background = "rgba(255, 0, 127, 0.2)";
                    statNcdmBadge.style.color = "#ff007f";
                    statNcdmBadge.style.borderColor = "#ff007f";
                } else {
                    statNcdmBadge.textContent = `${massText} (${stabilityText})`;
                    statNcdmBadge.style.background = "rgba(57, 255, 20, 0.2)";
                    statNcdmBadge.style.color = "#39ff14";
                    statNcdmBadge.style.borderColor = "#39ff14";
                }

                // Update neutrino detailed diagnostic
                if (statNcdmDetails) {
                    let regime = "Standard Massive";
                    if (massVal > 0.5) {
                        regime = "Supermassive (High Mass)";
                    } else if (massVal < 0.1) {
                        regime = "Light Massive (CMB Bound)";
                    }
                    
                    const fluidApprox = data.ncdm_status.fluid_approx !== null && data.ncdm_status.fluid_approx !== undefined ? data.ncdm_status.fluid_approx : "Default (3)";
                    const qBins = data.ncdm_status.q_bins !== null && data.ncdm_status.q_bins !== undefined ? data.ncdm_status.q_bins : "Default (5)";
                    const lMaxNcdm = data.ncdm_status.l_max_ncdm !== null && data.ncdm_status.l_max_ncdm !== undefined ? data.ncdm_status.l_max_ncdm : "Default (17)";
                    
                    let advisory = "";
                    let advisoryColor = "#a4b0be";
                    if (massVal > 0.5) {
                        if (strugglesCount > 0) {
                            advisory = "⚠️ Solver unstable. Supermassive neutrinos need higher precision settings (e.g. increase 'q_bins' or adjust/disable 'ncdm_fluid_approximation' to avoid integration crashes).";
                            advisoryColor = "#ffb700";
                        } else {
                            advisory = "✅ Solver stable. CLASS is successfully integrating the Boltzmann hierarchy for this high-mass regime.";
                            advisoryColor = "#39ff14";
                        }
                    } else {
                        advisory = "✅ Solver stable. Parameters in standard cosmological boundaries.";
                        advisoryColor = "#39ff14";
                    }
                    
                    let feasibilityText = "";
                    if (massVal > 1.0) {
                        feasibilityText = "<div style='margin-top: 4px; padding: 4px; background: rgba(255, 0, 127, 0.1); border: 1px solid rgba(255, 0, 127, 0.2); border-radius: 4px; font-size: 0.72rem; color: #ff007f; line-height: 1.3;'>⚠️ Exceeds Cosmological Bounds: m_&nu; > 1.0 eV is heavily disfavored by Planck CMB data.</div>";
                    }
                    
                    statNcdmDetails.innerHTML = `
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.03); padding: 2px 0; color: var(--text-secondary);">
                            <span>Regime:</span>
                            <span style="color: #fff; font-weight: bold;">${regime}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.03); padding: 2px 0; color: var(--text-secondary);">
                            <span>Momentum Bins (q_bins):</span>
                            <span style="color: #fff; font-family: var(--font-mono);">${qBins}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.03); padding: 2px 0; color: var(--text-secondary);">
                            <span>Fluid Approx:</span>
                            <span style="color: #fff; font-family: var(--font-mono);">${fluidApprox}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(255,255,255,0.03); padding: 2px 0; color: var(--text-secondary);">
                            <span>l_max_ncdm:</span>
                            <span style="color: #fff; font-family: var(--font-mono);">${lMaxNcdm}</span>
                        </div>
                        <div style="margin-top: 6px; padding: 6px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 4px; font-size: 0.72rem; color: ${advisoryColor}; line-height: 1.3;">
                            ${advisory}
                        </div>
                        ${feasibilityText}
                    `;
                }
            } else {
                statNcdmSection.style.display = 'none';
            }
        }
        
        // Render Struggles
        if (data.struggles && Object.keys(data.struggles).length > 0) {
            let strugglesHtml = '<ul style="margin-left: 15px; padding-left: 0; list-style-type: square;">';
            for (const [module, count] of Object.entries(data.struggles)) {
                strugglesHtml += `<li style="margin-bottom: 2px;">${module}: <span style="font-weight: bold; color: #ff007f;">${count} fail(s)</span></li>`;
            }
            strugglesHtml += '</ul>';
            statStrugglesBody.innerHTML = strugglesHtml;
            statStrugglesBody.style.color = "#ffb700";
        } else {
            statStrugglesBody.textContent = "Stable (0 failures)";
            statStrugglesBody.style.color = "#39ff14";
        }

        // Update progress bar (assuming ~3000 points for convergence)
        const totalEstimated = 3000;
        let percent = Math.min(Math.floor((data.dead_points / totalEstimated) * 100), 99);
        if (data.status === 'completed') percent = 100;
        if (data.status === 'idle') percent = 0;
        
        // FIX: Always switch to CosmicForge tab when is_optimizer is true
        if (data.is_optimizer) {
            if (data.status === 'running' || data.status === 'completed') {
                window.switchMonitorTab('optimizer');
                monitorTabAutoSwitched = true;
            }
            
            if (optStatEvals) optStatEvals.textContent = data.dead_points || 0;
            if (optStatChi2) optStatChi2.textContent = data.best_chi2 !== null ? data.best_chi2.toFixed(2) : "-";
            // Display which file/config is being tracked for optimizer
            if (optStatChi2File && (data.active_output_prefix || data.active_yaml_path)) {
                const fileInfo = data.active_output_prefix ? `File: ${data.active_output_prefix}` : `Config: ${data.active_yaml_path || 'unknown'}`;
                optStatChi2File.textContent = fileInfo;
            }
            if (optStatChi2Cmb) optStatChi2Cmb.textContent = data.best_cmb !== null ? data.best_cmb.toFixed(1) : "-";
            if (optStatChi2Bao) optStatChi2Bao.textContent = data.best_bao !== null ? data.best_bao.toFixed(1) : "-";
            if (optStatChi2Sn) optStatChi2Sn.textContent = data.best_sn !== null ? data.best_sn.toFixed(1) : "-";
            
            if (optStatPhase) {
                if (data.status === 'completed') {
                    optStatPhase.textContent = "Finished";
                    optStatPhase.style.color = "#39ff14";
                } else if (data.status === 'running') {
                    if (data.dead_points < 120) {
                        optStatPhase.textContent = "Local Search (BOBYQA)";
                        optStatPhase.style.color = "#00d2d3";
                    } else {
                        optStatPhase.textContent = "Surrogate MCMC";
                        optStatPhase.style.color = "#ff9ff3";
                    }
                } else {
                    optStatPhase.textContent = "Idle";
                    optStatPhase.style.color = "#a4b0be";
                }
            }
            
            // FIX: Use data directly instead of copying from Standard monitor elements
            // This ensures CosmicForge monitor works even if Standard elements aren't updated yet
            if (optStatCpu && data.cpu_percent !== undefined) {
                optStatCpu.textContent = `${Math.round(data.cpu_percent)}%`;
            }
            if (optCpuGaugePath && data.cpu_percent !== undefined) {
                const pct = Math.max(0, Math.min(100, data.cpu_percent));
                const offset = 125.66 - (pct / 100) * 125.66;
                optCpuGaugePath.style.strokeDashoffset = offset;
                if (pct > 85) optCpuGaugePath.style.stroke = '#ff007f';
                else if (pct > 50) optCpuGaugePath.style.stroke = '#ffb700';
                else optCpuGaugePath.style.stroke = '#00d2d3';
            }
            if (optStatSpeed) optStatSpeed.textContent = data.speed || "-";
            if (optStatEta) optStatEta.textContent = data.eta || "-";
            
            const optProgressPercentVal = (data.convergence_percent !== undefined) ? data.convergence_percent : 0;
            if (optProgressPercent) optProgressPercent.textContent = `${optProgressPercentVal}%`;
            if (optProgressFill) optProgressFill.style.width = `${optProgressPercentVal}%`;
        } else {
            // Reset auto-switch flag if not running optimizer
            if (data.status === 'idle' || data.status === 'completed') {
                monitorTabAutoSwitched = false;
            }
        }
        
        // Update initialization progress bar
        if (data.status === 'running' || data.status === 'completed') {
            let p = (data.init_percent !== undefined && data.init_percent !== null) ? data.init_percent : 0;
            if (data.status === 'completed') p = 100;
            const pRounded = Math.round(p);
            initFill.style.width = `${pRounded}%`;
            initPercent.textContent = `${pRounded}%`;
        } else {
            initFill.style.width = '0%';
            initPercent.textContent = '0%';
        }
        
        // Try fetching the live plot every ~30 seconds (10 ticks of 3s)
        if (data.status === 'running' || data.status === 'completed') {
            plotCheckCounter++;
            if (plotCheckCounter % 10 === 1 || data.status === 'completed') {
                const tempImg = new Image();
                tempImg.onload = function() {
                    plotImg.src = this.src;
                    plotContainer.style.display = 'block';
                    plotTimestamp.textContent = "Last updated: " + new Date().toLocaleTimeString();
                };
                tempImg.src = `${API_URL}/api/live_plot?t=${new Date().getTime()}`;
            }
        } else {
            plotContainer.style.display = 'none';
            plotCheckCounter = 0;
        }
        
        progressFill.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        
        // Handle actions availability
        if (data.status === 'running') {
            isAutoRunning = false;
            btnStart.disabled = true;
            if (btnStartOpt) btnStartOpt.disabled = true;
            btnResume.disabled = true;
            if (btnApplyCosmicForge) btnApplyCosmicForge.disabled = true;
            if (btnLoadLastRun) btnLoadLastRun.disabled = true;
            btnStop.disabled = false;
            
            let chi2Text = data.best_chi2 !== null ? data.best_chi2.toFixed(4) : 'evaluating';
            let logZText = data.log_evidence !== null ? data.log_evidence.toFixed(4) : 'evaluating';
        } else {
            // Always disable Stop when not running, even during upload
            btnStop.disabled = true;
            if (!isUploadingConfig) {
                btnStart.disabled = false;
                if (btnStartOpt) btnStartOpt.disabled = false;
                btnResume.disabled = false;
                if (btnApplyCosmicForge) btnApplyCosmicForge.disabled = false;
                if (btnLoadLastRun) btnLoadLastRun.disabled = false;
            }
        }

        // Manage persisted watchdog ignore state
        if (data.run_start_time !== lastRunStartTime) {
            lastRunStartTime = data.run_start_time;
            // A new run has started or the engine is idle; reset local and persisted ignore state
            watchdogIgnored = false;
            localStorage.removeItem('watchdogIgnored');
            localStorage.removeItem('watchdogIgnored_runStart');
        } else {
            // Check if we have a persisted ignore state for this specific run
            const persistedIgnore = localStorage.getItem('watchdogIgnored') === 'true';
            const persistedRunStart = localStorage.getItem('watchdogIgnored_runStart');
            if (persistedIgnore && persistedRunStart === String(lastRunStartTime)) {
                watchdogIgnored = true;
            }
        }

        // Update Watchdog card based on alerts from the backend
        let activeAlerts = (data.watchdog_alerts && data.watchdog_alerts.length > 0 && !watchdogIgnored) ? data.watchdog_alerts.length : 0;
        if (activeAlerts > lastWatchdogAlertCount) {
            playBarkSoundTwice();
        }
        lastWatchdogAlertCount = activeAlerts;

        if (data.watchdog_alerts && data.watchdog_alerts.length > 0) {
            if (!watchdogIgnored) {
                // We have alerts! Change dog to angry/warning mode
                watchdogIcon.innerText = '🚨';
                watchdogCard.style.borderColor = "#ff4757"; // Neon Red
                watchdogText.style.color = "#ff4757";
                watchdogText.style.textShadow = "0 0 10px rgba(255, 71, 87, 0.5)";
                watchdogText.innerText = `WARNING: ${data.watchdog_alerts.length} Issue(s) Detected!`;
                
                currentProposedUpdates = {};
                
                // Un-hide the details box and populate it with all warnings together
                watchdogDesc.style.display = "block";
                watchdogDesc.innerHTML = data.watchdog_alerts.map(alert => {
                    if (alert.new_min !== undefined && alert.new_max !== undefined) {
                        currentProposedUpdates[alert.parameter] = {min: alert.new_min, max: alert.new_max};
                    }
                    return `<div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <strong style="color: #ff9ff3; font-size: 1.1rem;">${escHtml(alert.parameter)}</strong><br>
                        <span style="color: #feca57;">${escHtml(alert.status)}</span><br>
                        <span style="color: #a4b0be; font-size: 0.85rem;">Suggestion: <span style="color: #fff;">${escHtml(alert.suggestion)}</span></span>
                    </div>`;
                }).join("");

                document.getElementById('watchdog-actions').style.display = 'flex';
                const hasProposals = Object.keys(currentProposedUpdates).length > 0;
                document.getElementById('watchdog-prioractions').style.display = hasProposals && data.status === 'running' ? 'flex' : 'none';
                document.getElementById('watchdog-utilactions').style.display = 'flex';
            }
        } else {
            currentProposedUpdates = {};
            watchdogIcon.innerText = '🐶';
            watchdogCard.style.borderColor = "#00d2d3"; // Neon Cyan
            watchdogText.style.color = "#00d2d3";
            watchdogText.style.textShadow = "0 0 10px rgba(0, 210, 211, 0.5)";
            watchdogText.innerText = "All clear, Captain!";
            
            // Hide the details box
            watchdogDesc.style.display = "none";
            watchdogDesc.style.maxHeight = '200px';
            watchdogDesc.innerHTML = "";
            document.getElementById('watchdog-actions').style.display = 'none';
            document.getElementById('watchdog-prioractions').style.display = 'none';
            document.getElementById('watchdog-utilactions').style.display = 'none';
        }

        // Populate H0/S8 tension detail elements
        if (data.tensions) {
            const t = data.tensions;
            const h0TensionEl = document.getElementById('detail-h0-tension');
            const s8TensionEl = document.getElementById('detail-s8-tension');
            const valH0Mean = document.getElementById('val-h0-mean');
            const valH0Std = document.getElementById('val-h0-std');
            const valS8Mean = document.getElementById('val-s8-mean');
            const valS8Std = document.getElementById('val-s8-std');

            if (h0TensionEl) {
                const h0t = t.H0_tension !== null && t.H0_tension !== undefined ? `${t.H0_tension.toFixed(2)}σ` : '-';
                h0TensionEl.textContent = h0t;
                h0TensionEl.style.color = (t.H0_tension !== null && t.H0_tension < 2.0) ? '#39ff14' : '#ff007f';
            }
            if (s8TensionEl) {
                const s8t = t.S8_tension_kids !== null && t.S8_tension_kids !== undefined ? `${t.S8_tension_kids.toFixed(2)}σ (KiDS)` : '-';
                s8TensionEl.textContent = s8t;
                s8TensionEl.style.color = (t.S8_tension_kids !== null && t.S8_tension_kids < 2.0) ? '#39ff14' : '#ff007f';
            }
            if (valH0Mean && t.H0_mean !== null && t.H0_mean !== undefined) valH0Mean.textContent = t.H0_mean.toFixed(2);
            if (valH0Std && t.H0_std !== null && t.H0_std !== undefined) valH0Std.textContent = t.H0_std.toFixed(2);
            if (valS8Mean && t.S8_mean !== null && t.S8_mean !== undefined) valS8Mean.textContent = t.S8_mean.toFixed(3);
            if (valS8Std && t.S8_std !== null && t.S8_std !== undefined) valS8Std.textContent = t.S8_std.toFixed(3);
        }

        // Update curves Chart.js
        if (data.cosmo_curves && data.cosmo_curves.success) {
            const curves = data.cosmo_curves;
            const curveW0 = document.getElementById('curve-w0');
            const curveWa = document.getElementById('curve-wa');
            const curveGamma = document.getElementById('curve-gamma');
            if (curveW0) curveW0.innerText = curves.w_0.toFixed(3);
            if (curveWa) curveWa.innerText = curves.w_a.toFixed(3);
            if (curveGamma) curveGamma.innerText = curves.gamma_0.toFixed(3);

            if (chartWMu) {
                chartWMu.data.labels = curves.z.map(z => z.toFixed(2));
                chartWMu.data.datasets[0].data = curves.w;
                chartWMu.data.datasets[1].data = curves.mu;
                chartWMu.update('none');
            }

            if (chartFSigma8) {
                chartFSigma8.data.labels = curves.z.map(z => z.toFixed(2));
                chartFSigma8.data.datasets[0].data = curves.f_sigma8;
                chartFSigma8.update('none');
            }
        }

        // Update dataset influence Chart.js
        if (chartInfluence && data.best_chi2 !== null && data.best_chi2 !== undefined) {
            const bestCmb = data.best_cmb !== null ? data.best_cmb : 1382.5;
            const bestBao = data.best_bao !== null ? data.best_bao : 30.2;
            const bestDesi = data.best_desi !== null ? data.best_desi : 0.0;
            const bestSn = data.best_sn !== null ? data.best_sn : 1484.5;
            const bestLensing = data.best_lensing !== null ? data.best_lensing : 0.0;
            
            const deltaCmb = bestCmb - 1382.5;
            const deltaBao = bestBao - 30.2;
            const deltaDesi = bestDesi - 0.0;
            const deltaSn = bestSn - 1484.5;
            const deltaLensing = bestLensing - 0.0;
            const deltaTot = data.best_chi2 - (1382.5 + 30.2 + 1484.5);
            
            chartInfluence.data.datasets[0].data = [deltaCmb, deltaBao, deltaDesi, deltaSn, deltaLensing, deltaTot];
            chartInfluence.update('none');
        }

        // Update Run Health metrics
        if (data.run_health) {
            const rh = data.run_health;
            const efficiencyVal = document.getElementById('health-efficiency-val');
            const efficiencyFill = document.getElementById('health-efficiency-fill');
            const stabilityVal = document.getElementById('health-stability-val');
            const stabilityFill = document.getElementById('health-stability-fill');
            const priorVal = document.getElementById('health-prior-val');
            const priorFill = document.getElementById('health-prior-fill');
            
            const healthEss = document.getElementById('health-ess');
            const healthAutocorr = document.getElementById('health-autocorr');
            const healthEvals = document.getElementById('health-evals');

            if (efficiencyVal) efficiencyVal.innerText = `${rh.efficiency.toFixed(2)}%`;
            if (efficiencyFill) efficiencyFill.style.width = `${Math.min(rh.efficiency * 5.0, 100)}%`;
            
            if (stabilityVal) stabilityVal.innerText = `${rh.stability_percent.toFixed(1)}%`;
            if (stabilityFill) stabilityFill.style.width = `${rh.stability_percent}%`;
            
            if (priorVal) priorVal.innerText = `${rh.prior_hit_freq.toFixed(1)}%`;
            if (priorFill) priorFill.style.width = `${rh.prior_hit_freq}%`;
            
            if (healthEss) healthEss.innerText = rh.ess > 0 ? rh.ess : "-";
            if (healthAutocorr) healthAutocorr.innerText = rh.autocorr_len > 0 ? `${rh.autocorr_len.toFixed(1)} steps` : "-";
            if (healthEvals) healthEvals.innerText = rh.total_evals;
        }

        // Update Stagnation Banner
        const stagnationBanner = document.getElementById('stagnation-banner');
        const stagnationReasonTxt = document.getElementById('stagnation-reason-txt');
        if (stagnationBanner && stagnationReasonTxt) {
            if (data.stagnation_detected) {
                stagnationBanner.style.display = 'block';
                stagnationReasonTxt.innerText = data.stagnation_reason || "The sampler is evaluating proposals but fails to accept new states (ESS=0).";
            } else {
                stagnationBanner.style.display = 'none';
            }
        }

        // Update Evolution Scrubber frame values
        if (data.history_frames && data.history_frames.length > 0) {
            const slider = document.getElementById('evolution-slider');
            const frameNum = document.getElementById('evolution-frame-num');
            if (slider && !isPlayingEvolution) {
                const oldMax = parseInt(slider.max || 0);
                const newLen = data.history_frames.length;
                slider.max = newLen;
                slider.min = 1;
                if (oldMax === 0 || parseInt(slider.value) > newLen) {
                    slider.value = newLen;
                    showEvolutionFrame(newLen);
                } else if (newLen > oldMax) {
                    // Auto advance to latest on new noticeable posterior frame (per user req)
                    slider.value = newLen;
                    showEvolutionFrame(newLen);
                }
            }
        }

        // If completed, compute evidence comparison
        if (data.status === 'completed' && data.log_evidence !== null) {
            const activeYamlPathLower = (data.active_yaml_path || '').toLowerCase();
            const activePrefixLower = (data.active_output_prefix || '').toLowerCase();
            const activeConfigLower = (activeConfig || '').toLowerCase();
            const yamlNameLower = (yamlName ? yamlName.textContent : '').toLowerCase();
            const isLcdmRun = data.is_lcdm ||
                              activeYamlPathLower.includes('lcdm') ||
                              activePrefixLower.includes('lcdm') ||
                              activeConfigLower.includes('lcdm') ||
                              yamlNameLower.includes('lcdm') ||
                              yamlNameLower.includes('baseline');
            if (isLcdmRun) {
                const currentRunId = data.active_output_prefix || data.active_yaml_path;
                const currentEvidence = data.log_evidence;
                // Only update baseline when evidence is final
                const shouldUpdate = data.evidence_is_final && (
                    lastBaselineUpdateRun !== currentRunId || 
                    (lastBaselineUpdateEvidence !== currentEvidence && lastBaselineUpdateRun === currentRunId)
                );
                if (shouldUpdate) {
                    updateBaseline("planck_bao_pantheonplus_shoes", data.log_evidence, data.best_chi2, data.evidence_is_final, data.evidence_source);
                    lastBaselineUpdateRun = currentRunId;
                    lastBaselineUpdateEvidence = currentEvidence;
                }
                if (data.evidence_is_final && checkAutoRunCustom && checkAutoRunCustom.checked && !isAutoRunning) {
                    isAutoRunning = true;
                    appendLog(`[PIPELINE] Baseline ΛCDM completed. Preparing to auto-run custom model in 5 seconds...`);
                    setTimeout(() => {
                        switchToCustom();
                        triggerRun(true);
                    }, 5000);
                }
            } else {
                if (data.evidence_is_final) {
                    calculateEvidence(data.log_evidence);
                } else {
                    appendLog('[PIPELINE] Live/preview evidence is visible for debugging only; final preference waits for PolyChord .stats.');
                }
                if (data.evidence_is_final && checkAutoRunLcdm && checkAutoRunLcdm.checked && !isAutoRunning) {
                    isAutoRunning = true;
                    appendLog(`[PIPELINE] Custom model completed. Preparing to auto-run baseline ΛCDM in 5 seconds...`);
                    setTimeout(() => {
                        switchToLcdm();
                        triggerRun(true);
                    }, 5000);
                }
            }
        }
        
        // Check if both runs completed and evidence criteria is met to play Beastie Boys: Intergalactic
        checkIntergalacticTrigger();
        
    } catch (err) {
        console.error('Status check error:', err);
    }
}

// Update UI indicator
function updateStatusIndicator(status) {
    statusDot.className = 'status-dot';
    statusText.textContent = `SYSTEM ${status.toUpperCase()}`;
    
    if (status === 'idle') statusDot.classList.add('status-idle');
    else if (status === 'running') statusDot.classList.add('status-running');
    else if (status === 'completed') statusDot.classList.add('status-completed');
    else if (status === 'stopped' || status === 'failed') statusDot.classList.add('status-failed');
}

function updateCpuGauge(cpuPercent) {
    if (cpuPercent === undefined || cpuPercent === null || Number.isNaN(Number(cpuPercent))) return;
    const pct = Math.max(0, Math.min(100, Number(cpuPercent)));
    if (statCpu) statCpu.textContent = `${Math.round(pct)}%`;
    if (!cpuGaugePath) return;
    const offset = 125.66 - (pct / 100) * 125.66;
    cpuGaugePath.style.strokeDashoffset = offset;
    if (pct > 85) {
        cpuGaugePath.style.stroke = '#ff007f';
    } else if (pct > 50) {
        cpuGaugePath.style.stroke = '#ffb700';
    } else {
        cpuGaugePath.style.stroke = '#00d2d3';
    }
}

// Live nebula portal updater (used by polling + WebSocket real-time status)
function updateNebulaPortalStatus(status, hasActiveConfig) {
    if (!yamlZone) return;
    yamlZone.classList.add('has-model');
    yamlZone.classList.remove('empty');
    if (status === 'running') {
        yamlZone.classList.add('running');
    } else {
        yamlZone.classList.remove('running');
    }
}

// Wire for WS real-time (see WS init in DOMContentLoaded)
window.updateStatusUI = (data) => {
    if (!data) return;
    if (data.status) updateStatusIndicator(data.status);
    updateNebulaPortalStatus(data.status, true);
    updateCpuGauge(data.cpu_percent);
    if (data.best_fit || data.chi2 || data.evidence) {
        // derived params refreshed by WS caller
    }
};

// Calculate delta ln Z and update Jeffreys card
function calculateEvidence(customLogZ) {
    const baselineLogZ = parseFloat(valBaseline.textContent);
    
    if (isNaN(baselineLogZ)) {
        valDelta.textContent = "-";
        jeffreysCard.className = 'jeffreys-card';
        jeffreysText.textContent = 'Baseline Missing';
        jeffreysDesc.textContent = 'Run the ΛCDM baseline first to enable model comparison.';
        updateEvidenceBreakdown();
        return;
    }

    const delta = customLogZ - baselineLogZ;
    valDelta.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(4);
    
    // Clear old classes
    jeffreysCard.className = 'jeffreys-card';
    
    if (delta >= 10.0) {
        jeffreysCard.classList.add('jeffreys-decisive');
        jeffreysText.textContent = 'Decisive Evidence';
        jeffreysDesc.textContent = 'The custom model is decisively favored over standard ΛCDM by the datasets. The parameter space changes provide a significantly superior fit.';
    } else if (delta >= 5.0) {
        jeffreysCard.classList.add('jeffreys-strong');
        jeffreysText.textContent = 'Strong Evidence';
        jeffreysDesc.textContent = 'There is strong statistical evidence favoring the custom model configuration. The modifications fit the observational constraints better.';
    } else if (delta >= 0.0) {
        jeffreysCard.classList.add('jeffreys-inconclusive');
        jeffreysText.textContent = 'Inconclusive';
        jeffreysDesc.textContent = 'The statistical fit is comparable to standard ΛCDM. The custom model is not significantly favored or disfavored by the data.';
    } else {
        jeffreysCard.classList.add('jeffreys-disfavored');
        jeffreysText.textContent = 'Model Disfavored';
        jeffreysDesc.textContent = 'The custom parameters are statistically disfavored by the datasets. The model fit is worse than the standard ΛCDM baseline.';
    }
    
    updateEvidenceBreakdown();
}

// Watchdog Action Listeners
document.getElementById('btn-deny-priors').addEventListener('click', () => {
    watchdogIgnored = true;
    localStorage.setItem('watchdogIgnored', 'true');
    localStorage.setItem('watchdogIgnored_runStart', String(lastRunStartTime));
    watchdogIcon.innerText = '🐶';
    watchdogCard.style.borderColor = "#00d2d3";
    watchdogText.style.color = "#00d2d3";
    watchdogText.style.textShadow = "0 0 10px rgba(0, 210, 211, 0.5)";
    watchdogText.innerText = "Warnings Ignored";
    watchdogDesc.style.display = "none";
    document.getElementById('watchdog-actions').style.display = 'none';
    document.getElementById('watchdog-prioractions').style.display = 'none';
    document.getElementById('watchdog-utilactions').style.display = 'none';
    appendLog('[WATCHDOG] Warnings dismissed. The run will continue undisturbed.');
});

document.getElementById('btn-accept-priors').addEventListener('click', async () => {
    document.getElementById('btn-accept-priors').disabled = true;
    appendLog('[WATCHDOG] Applying proposed prior changes and restarting run...');
    try {
        const response = await fetch(`${API_URL}/api/apply_priors_and_restart`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config_name: activeConfig, updates: currentProposedUpdates })
        });
        const data = await response.json();
        if (response.ok) {
            appendLog('[WATCHDOG] Priors updated successfully. Restart sequence initiated.');
        } else {
            appendLog(`[WATCHDOG] Failed to apply priors: ${data.detail}`);
            document.getElementById('btn-accept-priors').disabled = false;
        }
    } catch (err) {
        appendLog(`[WATCHDOG] Error applying priors: ${err.message}`);
        document.getElementById('btn-accept-priors').disabled = false;
    }
});

document.getElementById('btn-clear-report').addEventListener('click', async () => {
    appendLog('[WATCHDOG] Clearing watchdog report...');
    try {
        const response = await fetch(`${API_URL}/api/clear_watchdog_alerts`, {
            method: 'POST'
        });
        const data = await response.json();
        if (response.ok) {
            watchdogIcon.innerText = '🐶';
            watchdogCard.style.borderColor = "#00d2d3";
            watchdogText.style.color = "#00d2d3";
            watchdogText.style.textShadow = "0 0 10px rgba(0, 210, 211, 0.5)";
            watchdogText.innerText = "All clear, Captain!";
            watchdogDesc.style.display = "none";
            document.getElementById('watchdog-actions').style.display = 'none';
            document.getElementById('watchdog-prioractions').style.display = 'none';
            document.getElementById('watchdog-utilactions').style.display = 'none';
            appendLog('[WATCHDOG] Report cleared.');
        } else {
            appendLog(`[WATCHDOG] Failed to clear report: ${data.detail}`);
        }
    } catch (err) {
        appendLog(`[WATCHDOG] Error clearing report: ${err.message}`);
    }
});

document.getElementById('btn-view-logfile').addEventListener('click', async () => {
    appendLog('[WATCHDOG] Fetching log file...');
    try {
        const response = await fetch(`${API_URL}/api/logs?lines=200`);
        const data = await response.json();
        if (response.ok && data.logs) {
            const text = data.logs.backend || 'Log is empty.';
            watchdogDesc.style.maxHeight = '400px';
            watchdogDesc.innerHTML = `<pre style="font-size:0.75rem; line-height:1.2; white-space:pre-wrap; color:#a4b0be; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px;">${escHtml(text)}</pre>`;
            appendLog('[WATCHDOG] Log displayed in status panel.');
        } else {
            appendLog('[WATCHDOG] Failed to fetch log.');
        }
    } catch (err) {
        appendLog(`[WATCHDOG] Error fetching log: ${err.message}`);
    }
});

document.getElementById('btn-clear-log').addEventListener('click', async () => {
    appendLog('[WATCHDOG] Clearing log file...');
    try {
        const response = await fetch(`${API_URL}/api/clear_log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: 'backend' })
        });
        const data = await response.json();
        if (response.ok) {
            appendLog(`[WATCHDOG] Log cleared: ${data.message}`);
        } else {
            appendLog(`[WATCHDOG] Failed to clear log: ${data.detail}`);
        }
    } catch (err) {
        appendLog(`[WATCHDOG] Error clearing log: ${err.message}`);
    }
});

document.getElementById('btn-open-logfile').addEventListener('click', () => {
    const configName = activeConfig || 'unknown';
    const logFileName = configName.replace(/\.ya?ml$/, '') + '_polychord.log';
    window.open(`chains/${logFileName}`, '_blank');
    appendLog(`[WATCHDOG] Opening chain log: chains/${logFileName}`);
});

// Escape HTML entities for safe injection
function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Console helper
function appendLog(message, { html = false } = {}) {
    // Remove initial placeholder if present
    if (localLogs.length === 1 && localLogs[0] === 'Waiting for run execution...') {
        localLogs = [];
    }
    const safeMessage = html ? String(message) : escHtml(String(message));
    localLogs.push(`[${escHtml(new Date().toLocaleTimeString())}] ${safeMessage}`);
    if (localLogs.length > 50) localLogs.shift();
    renderLogs();
}

function renderLogs() {
    let html = "";
    if (lastTerminalLogs && lastTerminalLogs.length > 0) {
        html += lastTerminalLogs.map(l => {
            let esc = l.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return esc.replace(/(\[.*?\])/g, '<span style="color:#feca57">$1</span>');
        }).join('<br>') + '<br><br><span style="color:#a4b0be; font-weight:bold;">--- DASHBOARD STATUS LOGS ---</span><br>';
    }
    html += localLogs.map(l => escHtml(String(l))).join('<br>');
    consoleBody.innerHTML = html;
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

// Watchdog Audio Notification (Synthesizes realistic dog bark sounds using the Web Audio API)
function playBark() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const audioCtx = new AudioContextClass();
        
        // Synthesizer nodes
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const filterNode = audioCtx.createBiquadFilter();

        // 1. Vocal tract filter shaping
        filterNode.type = 'bandpass';
        filterNode.frequency.setValueAtTime(450, audioCtx.currentTime);
        filterNode.Q.setValueAtTime(2.5, audioCtx.currentTime);

        // 2. Vocal folds tone sweep (sawtooth wave for raspiness)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.14);

        // 3. Bark envelope configuration
        gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.025); // sudden attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.16); // decay

        // 4. White noise injection to simulate breath friction (huffing sound)
        const bufferSize = audioCtx.sampleRate * 0.18; 
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.14);

        // Routing connections
        osc.connect(filterNode);
        filterNode.connect(gainNode);
        
        noise.connect(noiseGain);
        noiseGain.connect(gainNode);

        gainNode.connect(audioCtx.destination);

        // Trigger playback
        osc.start();
        noise.start();
        osc.stop(audioCtx.currentTime + 0.18);
        noise.stop(audioCtx.currentTime + 0.18);
    } catch (err) {
        console.warn("Failed to play bark synth:", err);
    }
}

function playBarkSoundTwice() {
    playBark();
    setTimeout(playBark, 240); // double-bark spacing
}

// Evidence breakdown math visualizer
function updateEvidenceBreakdown() {
    const breakdownDiv = document.getElementById('evidence-breakdown');
    if (!breakdownDiv) return;

    if (!lastStatusData || lastStatusData.log_evidence === null || lastStatusData.best_chi2 === null || baselineLogEvidence === null) {
        breakdownDiv.style.display = 'none';
        return;
    }

    const logZ_custom = lastStatusData.log_evidence;
    const chi2_custom = lastStatusData.best_chi2;
    const logZ_baseline = baselineLogEvidence;
    
    // Calculate Occam Penalty for custom model: ln(L_max) - ln(Z)
    const logL_max_custom = -0.5 * chi2_custom;
    const occam_custom = logL_max_custom - logZ_custom;

    let html = `<div style="margin-top: 8px; font-weight: bold; color: #fff;">Bayesian Math Breakdown:</div>`;
    html += `<div style="margin-left: 5px; margin-top: 4px;">`;
    html += `• Custom Model ln(Z) = ln(L_max) - Occam Penalty<br>`;
    html += `  - ln(L_max) [Fit Score]: ${logL_max_custom.toFixed(2)} (Best χ²: ${chi2_custom.toFixed(2)})<br>`;
    html += `  - Occam Penalty: ${occam_custom.toFixed(2)} nat (Prior Shrinkage: 10<sup>${(occam_custom / Math.log(10)).toFixed(1)}</sup>)<br>`;
    html += `</div>`;

    if (baselineBestChi2 !== null && baselineBestChi2 !== undefined) {
        const chi2_baseline = baselineBestChi2;
        const logL_max_baseline = -0.5 * chi2_baseline;
        const occam_baseline = logL_max_baseline - logZ_baseline;
        
        const delta_logZ = logZ_custom - logZ_baseline;
        const delta_fit = logL_max_custom - logL_max_baseline;
        const delta_occam = occam_custom - occam_baseline;
        
        html += `<div style="border-top: 1px dashed rgba(255,255,255,0.1); margin-top: 6px; padding-top: 6px; margin-left: 5px;">`;
        html += `• Δln(Z) = Δln(L_max) - ΔOccam Penalty<br>`;
        html += `  - Δln(L_max) [Tension Gains]: <span style="color:#39ff14">${delta_fit >= 0 ? '+' : ''}${delta_fit.toFixed(2)}</span><br>`;
        html += `  - ΔOccam Penalty [Complexity Cost]: <span style="color:#ff4757">${delta_occam >= 0 ? '+' : ''}${delta_occam.toFixed(2)}</span><br>`;
        html += `  - Net Δln(Z): <span style="color:${delta_logZ >= 0 ? '#39ff14' : '#ff4757'}; font-weight: bold;">${delta_logZ >= 0 ? '+' : ''}${delta_logZ.toFixed(2)}</span>`;
        html += `</div>`;
    } else {
        html += `<div style="border-top: 1px dashed rgba(255,255,255,0.1); margin-top: 6px; padding-top: 6px; font-style: italic; color: #576574;">`;
        html += `Run baseline ΛCDM to see Occam complexity cost comparison.`;
        html += `</div>`;
    }

    breakdownDiv.innerHTML = html;
    breakdownDiv.style.display = 'block';
}

// Copy Utility Function
function copyToClipboard(text, buttonId) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById(buttonId);
        const originalText = btn.textContent;
        // Check if button is a small icon button
        if (originalText === "📋") {
            btn.textContent = "Done! ✓";
            btn.style.color = "#39ff14";
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.color = "";
            }, 1500);
        } else {
            btn.textContent = "Copied! ✓";
            btn.style.color = "#39ff14";
            btn.style.borderColor = "#39ff14";
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.color = "";
                btn.style.borderColor = "";
            }, 1500);
        }
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Could not copy to clipboard. Please copy manually.');
    });
}

// Register Copy Button Listener
document.addEventListener('DOMContentLoaded', () => {
    // 1. Copy Evidence Comparison Math
    const btnCopyEvidence = document.getElementById('btn-copy-evidence');
    if (btnCopyEvidence) {
        btnCopyEvidence.addEventListener('click', () => {
            if (!lastStatusData) return;
            const logEvidenceVal = (lastStatusData.log_evidence !== null && lastStatusData.log_evidence !== undefined)
                ? `${lastStatusData.log_evidence.toFixed(4)} +/- ${lastStatusData.log_evidence_error !== null && lastStatusData.log_evidence_error !== undefined ? lastStatusData.log_evidence_error.toFixed(4) : '?'}`
                : "-";
            const valBaselineText = document.getElementById('val-baseline').textContent;
            const valCustomTextVal = document.getElementById('val-custom').textContent;
            const valDeltaTextVal = document.getElementById('val-delta').textContent;
            const jeffTextVal = document.getElementById('jeffreys-text').textContent;
            const jeffDescTextVal = document.getElementById('jeffreys-desc').textContent;
            const labelCustomText = document.getElementById('label-custom-model').textContent.replace(/:/g, '').trim();
            const text = `--- Bayesian Evidence Comparison ---\nBaseline log(Z): ${valBaselineText}\n${labelCustomText}: ${valCustomTextVal} (Evidence Z: ${logEvidenceVal})\nDelta log(Z): ${valDeltaTextVal}\nEvidence Strength: ${jeffTextVal} (${jeffDescTextVal})\nData Preferred (ignores AIC/BIC): ${document.getElementById('evidence-preferred-model') ? document.getElementById('evidence-preferred-model').textContent : 'N/A'}`;
            copyToClipboard(text, 'btn-copy-evidence');
        });
    }

    // 2. Copy Best-Fit Chi2 and Parameters
    const btnCopyBestfit = document.getElementById('btn-copy-bestfit');
    if (btnCopyBestfit) {
        btnCopyBestfit.addEventListener('click', () => {
            if (!lastStatusData) return;
            const chi2Total = lastStatusData.best_chi2 !== null ? lastStatusData.best_chi2.toFixed(4) : "-";
            const chi2Cmb = lastStatusData.best_cmb !== null ? lastStatusData.best_cmb.toFixed(2) : "-";
            const chi2Bao = lastStatusData.best_bao !== null ? lastStatusData.best_bao.toFixed(2) : "-";
            const chi2Sn = lastStatusData.best_sn !== null ? lastStatusData.best_sn.toFixed(2) : "-";
            
            let text = `--- Best-Fit Chi2 Breakdown ---
Total Chi2: ${chi2Total}
CMB Chi2: ${chi2Cmb}
BAO Chi2: ${chi2Bao}
SN Chi2: ${chi2Sn}

--- Best-Fit Parameter Values ---
`;
            if (lastStatusData.best_raw_params) {
                for (const [key, val] of Object.entries(lastStatusData.best_raw_params)) {
                    if (!key.startsWith('chi2__') && !key.startsWith('minuslogprior')) {
                        const formattedVal = (typeof val === 'number') ? val.toPrecision(6) : val;
                        text += `${key}: ${formattedVal}\n`;
                    }
                }
            } else {
                text += "No best-fit parameters populated yet.\n";
            }
            copyToClipboard(text, 'btn-copy-bestfit');
        });
    }

    // 3. Copy Tension Resolution and struggles
    const btnCopyTensions = document.getElementById('btn-copy-tensions');
    if (btnCopyTensions) {
        btnCopyTensions.addEventListener('click', () => {
            if (!lastStatusData) return;
            const tensionStatus = lastStatusData.tension_status || "Unknown";
            const strugglesText = document.getElementById('stat-struggles-body').innerText;
            
            const text = `--- Tension Resolution & Stability ---
H0 & S8 Tensions Status: ${tensionStatus}

Model Struggles (CLASS Computation Failures):
${strugglesText}`;
            copyToClipboard(text, 'btn-copy-tensions');
        });
    }

    // 4. Copy 1-Sigma constraints
    const btnCopyConstraints = document.getElementById('btn-copy-constraints');
    if (btnCopyConstraints) {
        btnCopyConstraints.addEventListener('click', () => {
            if (!lastStatusData) return;
            let text = `--- 1-Sigma Parameter Constraints (Mean & 1-Sigma) ---\n`;
            if (lastStatusData.constraints && lastStatusData.constraints.length > 0) {
                lastStatusData.constraints.forEach(c => {
                    text += `${c.parameter}: ${c.mean} +/- ${c.error}\n`;
                });
            } else {
                text += "No 1-sigma constraints populated yet.\n";
            }
            copyToClipboard(text, 'btn-copy-constraints');
        });
    }

    // 4.5 Copy Derived Cosmological Parameters (new)
    const btnCopyDerived = document.getElementById('btn-copy-derived');
    if (btnCopyDerived) {
        btnCopyDerived.addEventListener('click', () => {
            const body = document.getElementById('derived-params-body');
            if (!body) return;
            let text = '--- Key Derived Cosmological Quantities ---\n';
            // grab visible text
            text += body.innerText || body.textContent;
            copyToClipboard(text, 'btn-copy-derived');
        });
    }

    // 4.6 Copy Multimodal Comparison (new)
    const btnCopyMultimodal = document.getElementById('btn-copy-multimodal');
    if (btnCopyMultimodal) {
        btnCopyMultimodal.addEventListener('click', () => {
            const body = document.getElementById('multimodal-comparison-body');
            if (!body) return;
            let text = '--- Multimodal Cosmological Exploration Comparison ---\n';
            text += body.innerText || body.textContent;
            copyToClipboard(text, 'btn-copy-multimodal');
        });
    }

    // 4.7 Copy MCMC Diagnostics
    const btnCopyMcmcDiag = document.getElementById('btn-copy-mcmc-diag');
    if (btnCopyMcmcDiag) {
        btnCopyMcmcDiag.addEventListener('click', () => {
            const body = document.getElementById('mcmc-diagnostics-body');
            if (!body) return;
            let text = '--- MCMC Diagnostics (ESS & R̂) ---\n';
            text += body.innerText || body.textContent;
            copyToClipboard(text, 'btn-copy-mcmc-diag');
        });
    }

    // 4.8 Copy Mode Metadata
    const btnCopyModeMeta = document.getElementById('btn-copy-mode-meta');
    if (btnCopyModeMeta) {
        btnCopyModeMeta.addEventListener('click', () => {
            const body = document.getElementById('mode-metadata-body');
            if (!body) return;
            let text = '--- Mode Metadata & Quality Metrics ---\n';
            text += body.innerText || body.textContent;
            copyToClipboard(text, 'btn-copy-mode-meta');
        });
    }

    // 5. Copy Unified AI Diagnostics Prompt
    const btnCopyAiPrompt = document.getElementById('btn-copy-ai-prompt');
    if (btnCopyAiPrompt) {
        btnCopyAiPrompt.addEventListener('click', () => {
            if (!lastStatusData) return;
            
            const status = lastStatusData.status || "idle";
            const valBaselineText = document.getElementById('val-baseline').textContent;
            const valCustomText = document.getElementById('val-custom').textContent;
            const valDeltaText = document.getElementById('val-delta').textContent;
            const jeffText = document.getElementById('jeffreys-text').textContent;
            const strugglesText = document.getElementById('stat-struggles-body').innerText.trim();
            
            const chi2Total = lastStatusData.best_chi2 !== null ? lastStatusData.best_chi2.toFixed(4) : "-";
            const chi2Cmb = lastStatusData.best_cmb !== null ? lastStatusData.best_cmb.toFixed(2) : "-";
            const chi2Bao = lastStatusData.best_bao !== null ? lastStatusData.best_bao.toFixed(2) : "-";
            const chi2Sn = lastStatusData.best_sn !== null ? lastStatusData.best_sn.toFixed(2) : "-";
            
            let bestFitList = "";
            if (lastStatusData.best_raw_params) {
                for (const [key, val] of Object.entries(lastStatusData.best_raw_params)) {
                    if (!key.startsWith('chi2__') && !key.startsWith('minuslogprior')) {
                        const formattedVal = (typeof val === 'number') ? val.toPrecision(6) : val;
                        bestFitList += `- ${key}: ${formattedVal}\n`;
                    }
                }
            } else {
                bestFitList = "No best-fit parameters populated yet.\n";
            }
            
            let constraintsList = "";
            if (lastStatusData.constraints && lastStatusData.constraints.length > 0) {
                lastStatusData.constraints.forEach(c => {
                    constraintsList += `- ${c.parameter}: ${c.mean} +/- ${c.error}\n`;
                });
            } else {
                constraintsList = "No 1-sigma constraints populated yet.\n";
            }

            // Cosmo curves parameters
            let w0Val = "-", waVal = "-", gammaVal = "-";
            if (lastStatusData.cosmo_curves && lastStatusData.cosmo_curves.success) {
                w0Val = lastStatusData.cosmo_curves.w_0.toFixed(4);
                waVal = lastStatusData.cosmo_curves.w_a.toFixed(4);
                gammaVal = lastStatusData.cosmo_curves.gamma_0.toFixed(4);
            }

            // Run Health stats
            let rhVal = "No run health data calculated yet.";
            if (lastStatusData.run_health) {
                const rh = lastStatusData.run_health;
                rhVal = `- Sampler Efficiency (Acceptance Rate): ${rh.efficiency.toFixed(2)}%
- Effective Sample Size (ESS): ${rh.ess}
- Autocorrelation Length: ${rh.autocorr_len > 0 ? rh.autocorr_len.toFixed(1) + " steps" : "-"}
- Prior-Hit Frequency: ${rh.prior_hit_freq.toFixed(1)}%
- CLASS Boltzmann Solver Stability: ${rh.stability_percent.toFixed(1)}%
- Total Proposals Evaluated: ${rh.total_evals}`;
            }

            // Comparative model statistics
            let compVal = "No comparative statistics available.";
            if (lastStatusData.comparison) {
                const c = lastStatusData.comparison;
                const dChi2 = c.delta_chi2 !== null ? c.delta_chi2.toFixed(2) : "-";
                const dAIC = c.delta_aic !== null ? c.delta_aic.toFixed(2) : "-";
                const dBIC = c.delta_bic !== null ? c.delta_bic.toFixed(2) : "-";
                compVal = `- Parameters: Baseline=${c.k_baseline}, Custom=${c.k_custom}
- Δχ² relative to ΛCDM: ${dChi2}
- AIC score: Baseline=${c.aic_baseline !== null ? c.aic_baseline.toFixed(2) : "-"}, Custom=${c.aic_custom !== null ? c.aic_custom.toFixed(2) : "-"} (ΔAIC: ${dAIC})
- BIC score: Baseline=${c.bic_baseline !== null ? c.bic_baseline.toFixed(2) : "-"}, Custom=${c.bic_custom !== null ? c.bic_custom.toFixed(2) : "-"} (ΔBIC: ${dBIC})
- BIC-based Preference: ${c.qualitative_preference}
- EVIDENCE-based Preference (ignores AIC/BIC, uses actual data via ΔlogZ): ${c.evidence_based_preference || 'N/A'}`;
            }

            // Tension Dashboard details
            let tensionVal = "No detailed tension discrepancies computed yet.";
            if (lastStatusData.tensions) {
                const t = lastStatusData.tensions;
                const h0_t = t.H0_tension !== null ? `${t.H0_tension.toFixed(2)}σ` : "-";
                const s8_kids = t.S8_tension_kids !== null ? `${t.S8_tension_kids.toFixed(2)}σ` : "-";
                const s8_des = t.S8_tension_des !== null ? `${t.S8_tension_des.toFixed(2)}σ` : "-";
                const om_t = t.Om_tension !== null ? `${t.Om_tension.toFixed(2)}σ` : "-";
                const ok_t = t.Ok_tension !== null ? `${t.Ok_tension.toFixed(2)}σ` : "-";
                
                tensionVal = `- H0 tension status: ${t.H0_status} (Discrepancy: ${h0_t} vs SH0ES)
- S8 tension status: ${t.S8_status} (Discrepancy: Kids=${s8_kids}, DES=${s8_des})
- Matter density Om status: ${t.Om_status} (Discrepancy: ${om_t} vs Planck)
- Curvature Ok status: ${t.Ok_status} (Discrepancy: ${ok_t} vs flat)
- Neutrino mass sum (m_ν) status: ${t.Mnu_status}`;
            }
            // Neutrino sector configuration & compilation wizard info
            let ncdmVal = "Neutrino Sector: Disabled";
            if (lastStatusData.ncdm_status && lastStatusData.ncdm_status.enabled) {
                const n = lastStatusData.ncdm_status;
                ncdmVal = `Neutrino Sector: Enabled (m_ν = ${n.mass !== null ? n.mass.toFixed(3) + ' eV' : 'unknown'}, struggles = ${n.struggles}, q_bins = ${n.q_bins || 'default'}, fluid_approx = ${n.fluid_approx || 'default'}, l_max_ncdm = ${n.l_max_ncdm || 'default'})`;
            }

            // Cosmo curves phi(z) summary
            let phiVal = "No scalar field profile computed.";
            if (lastStatusData.cosmo_curves && lastStatusData.cosmo_curves.phi && lastStatusData.cosmo_curves.phi.length > 0) {
                const phi = lastStatusData.cosmo_curves.phi;
                const phi_z0 = phi[0].toFixed(4);
                const phi_z25 = phi[phi.length - 1].toFixed(4);
                phiVal = `phi(z=0) = ${phi_z0}, phi(z=2.5) = ${phi_z25} (Full profile: [${phi.slice(0, 5).map(v => v.toFixed(3)).join(', ')} ... ${phi.slice(-5).map(v => v.toFixed(3)).join(', ')}])`;
            }

            // Scrape Sampler Brain (Covariance Matrix)
            let samplerBrainSummary = "No proposal covariance matrix loaded.";
            const samplerBrainTable = document.getElementById('sampler-brain-matrix');
            if (samplerBrainTable) {
                const rows = samplerBrainTable.querySelectorAll('tr');
                if (rows.length > 1) {
                    samplerBrainSummary = "";
                    const headers = Array.from(rows[0].querySelectorAll('th')).map(el => el.textContent.trim());
                    for (let i = 1; i < rows.length; i++) {
                        const cols = rows[i].querySelectorAll('td');
                        if (cols.length > 0) {
                            const paramName = cols[0].textContent.trim();
                            const correlations = [];
                            for (let j = 1; j < cols.length; j++) {
                                correlations.push(`${headers[j]}: ${cols[j].textContent.trim()}`);
                            }
                            samplerBrainSummary += `- ${paramName} correlations: [${correlations.join(', ')}]\n`;
                        }
                    }
                }
            }

            // CLASS raw error logs
            let classErrorLogsText = "No recent CLASS Boltzmann solver error log snippets recorded.";
            if (lastStatusData.class_error_logs && lastStatusData.class_error_logs.length > 0) {
                classErrorLogsText = lastStatusData.class_error_logs.slice(-5).join('\n---\n');
            }

            // Scrape new visual diagnostics information from the UI
            const jacobianText = document.getElementById('jacobian-heatmap-container') ? document.getElementById('jacobian-heatmap-container').innerText.trim() : "No Jacobian computed.";
            const pullsText = document.getElementById('dataset-pull-container') ? document.getElementById('dataset-pull-container').innerText.trim() : "No dataset pulls available.";
            const autopsyText = Array.from(document.querySelectorAll('#autopsy-timeline > div')).map(el => el.innerText.trim()).slice(-10).join('\n') || "No autopsy events.";

            // Scrape Per-Point Chi2 data
            let perPointSummary = "No per-point chi2 data loaded.";
            if (perPointDataCache) {
                perPointSummary = "";
                for (const [datasetType, cacheList] of Object.entries(perPointDataCache)) {
                    if (Array.isArray(cacheList) && cacheList.length > 0) {
                        perPointSummary += `Dataset: ${datasetType.toUpperCase()}\n`;
                        cacheList.slice(0, 5).forEach(item => {
                            if (datasetType === 'bao') {
                                perPointSummary += `- ID ${item.id} (${item.dataset}) at z=${item.redshift.toFixed(3)}: residual=${item.residual.toFixed(5)}, chi2=${item.chi2.toFixed(3)}\n`;
                            } else if (datasetType === 'cmb') {
                                perPointSummary += `- Multipole l=${item.multipole}: residual_Dl=${item.residual_Dl.toFixed(3)}, chi2=${item.chi2.toFixed(3)}\n`;
                            } else if (datasetType === 'sn') {
                                perPointSummary += `- Supernova ${item.name} at z=${item.redshift.toFixed(3)}: residual_mu=${item.residual_mu.toFixed(4)}, chi2=${item.chi2.toFixed(3)}\n`;
                            } else if (datasetType === 'lensing') {
                                perPointSummary += `- Scale k=${item.k_h_Mpc.toFixed(4)} h/Mpc: residual_Pk=${item.residual_Pk.toFixed(5)}, chi2=${item.chi2.toFixed(3)}\n`;
                            }
                        });
                        if (cacheList.length > 5) {
                            perPointSummary += `- ... (${cacheList.length - 5} more points truncated)\n`;
                        }
                    }
                }
            }

            // Scrape Run Compare data
            let runCompareSummary = "No active run comparison.";
            const runcompareEv = document.getElementById('runcompare-evidence') ? document.getElementById('runcompare-evidence').textContent.trim() : "-";
            const runcompareCh = document.getElementById('runcompare-chi2') ? document.getElementById('runcompare-chi2').textContent.trim() : "-";
            const runAVal = document.getElementById('select-run-a') ? document.getElementById('select-run-a').value : "";
            const runBVal = document.getElementById('select-run-b') ? document.getElementById('select-run-b').value : "";
            if (runcompareEv !== "-" || runcompareCh !== "-") {
                runCompareSummary = `Run A (Baseline): ${runAVal}\nRun B (Comparison): ${runBVal}\nDelta log(Z): ${runcompareEv}\nDelta Chi2: ${runcompareCh}\nParameter Shifts:\n`;
                const rows = document.querySelectorAll('#runcompare-table-body tr');
                rows.forEach(row => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length === 5) {
                        runCompareSummary += `- ${cols[0].textContent.trim()}: RunA=${cols[1].textContent.trim()}, RunB=${cols[2].textContent.trim()}, Shift=${cols[3].textContent.trim()}, Significance=${cols[4].textContent.trim()}\n`;
                    }
                });
            }

            // Scrape Provenance Ledger data
            let provenanceSummary = "No provenance ledger loaded.";
            const provTime = document.getElementById('provenance-time') ? document.getElementById('provenance-time').textContent.trim() : "-";
            if (provTime !== "-") {
                const provClass = document.getElementById('provenance-class-ver').textContent.trim();
                const provCobaya = document.getElementById('provenance-cobaya-ver').textContent.trim();
                const provPolychord = document.getElementById('provenance-polychord-ver').textContent.trim();
                const provGit = document.getElementById('provenance-git-hash').textContent.trim();
                const provPy = document.getElementById('provenance-py-ver').textContent.trim();
                const provConda = document.getElementById('provenance-conda-env').textContent.trim();
                const provConfig = document.getElementById('provenance-config').textContent.trim();
                const provConfigHash = document.getElementById('provenance-config-hash').textContent.trim();
                const provCompiler = document.getElementById('provenance-compiler').textContent.trim();
                const provMachine = document.getElementById('provenance-machine').textContent.trim();
                
                provenanceSummary = `- Time stamp: ${provTime}
- CLASS Solver: ${provClass}
- Cobaya Solver: ${provCobaya}
- PolyChord Solver: ${provPolychord}
- Git Hash: ${provGit}
- Python Version: ${provPy}
- Conda Environment: ${provConda}
- YAML Config: ${provConfig}
- YAML Checksum: ${provConfigHash}
- Compiler Options: ${provCompiler}
- Machine Specification: ${provMachine}`;
            }

            // Scrape Selected Config Template
            const selectedTemplate = document.getElementById('select-config-template') ? document.getElementById('select-config-template').value : "Default/Active Settings";

            // Scrape Likelihood Terrain params
            const terrainX = document.getElementById('terrain-param-x') ? document.getElementById('terrain-param-x').value : "-";
            const terrainY = document.getElementById('terrain-param-y') ? document.getElementById('terrain-param-y').value : "-";
            const terrainSummary = `Degeneracy Terrain X-Axis: ${terrainX} | Y-Axis: ${terrainY}`;

            // Scrape Model Deformation alpha
            const deformAlpha = document.getElementById('slide-deform-alpha') ? document.getElementById('slide-deform-alpha').value : "0.00";

            // Scrape Chain Quality convergence diagnostics
            let chainQualitySummary = "No convergence diagnostics loaded.";
            const qualityRows = document.querySelectorAll('#chain-quality-table-body tr');
            if (qualityRows.length > 0) {
                chainQualitySummary = "";
                qualityRows.forEach(row => {
                    const cols = row.querySelectorAll('td');
                    if (cols.length === 4) {
                        chainQualitySummary += `- ${cols[0].textContent.trim()}: R̂ (PSRF) = ${cols[1].textContent.trim()}, ESS = ${cols[2].textContent.trim()} [Status: ${cols[3].textContent.trim()}]\n`;
                    }
                });
            }

            // CosmicForge Optimizer Run Results
            let cosmicforgeSection = "CosmicForge optimizer not active (standard PolyChord/MCMC run).";
            if (lastStatusData.is_optimizer) {
                const totalRuns = lastStatusData.optimizer_total_runs || 0;
                const currentRun = lastStatusData.optimizer_current_run || 0;
                const runResults = lastStatusData.optimizer_run_results || [];
                const totalEvals = lastStatusData.dead_points || 0;

                let runTable = "";
                if (runResults.length > 0) {
                    // Sort by chi2 ascending so best is first
                    const sorted = [...runResults].sort((a, b) => a.chi2 - b.chi2);
                    const globalBest = sorted[0].chi2;
                    runTable = "Completed runs (sorted best → worst):\n";
                    runResults.forEach(r => {
                        const label = r.label || r.name || `Run ${r.run}`;
                        const isBest = Math.abs(r.chi2 - globalBest) < 1e-3;
                        runTable += `- ${label}: χ² = ${r.chi2.toFixed(4)}${isBest ? ' ⭐ GLOBAL BEST' : ''}\n`;
                    });
                } else {
                    runTable = "No completed optimizer runs yet (first evaluation in progress).\n";
                }

                const phaseLabel = currentRun > 0 && currentRun <= totalRuns
                    ? `Run ${currentRun}/${totalRuns} in progress`
                    : (totalRuns > 0 ? `All ${totalRuns} runs complete` : "Initializing...");

                const viabilityInfo = lastStatusData.run_health
                    ? `- CLASS Boltzmann Stability: ${lastStatusData.run_health.stability_percent !== undefined ? lastStatusData.run_health.stability_percent.toFixed(1) + '%' : 'N/A'}`
                    : '';

                cosmicforgeSection = `CosmicForge Multi-Start BOBYQA Optimizer:
- Phase: ${phaseLabel}
- Total function evaluations: ${totalEvals}
- Config: ${lastStatusData.active_yaml_path || 'prtoe_standard.yaml'}
${viabilityInfo}

${runTable}
- Global best χ² (across all runs): ${lastStatusData.best_chi2 !== null ? lastStatusData.best_chi2.toFixed(4) : 'N/A'}`;
            }

            const promptText = `Here is the cosmological data from my CLASS & Cobaya run. Please analyze these diagnostics, evaluate if the custom model resolves the H0 and S8 tensions, check the model struggles/stability, and explain the physical implications:

### Run Status
- Status: ${status}
- Stagnation Detected: ${lastStatusData.stagnation_detected ? "Yes (" + lastStatusData.stagnation_reason + ")" : "No"}

### Configurable Run Template System
- Active Run Configuration Template: ${selectedTemplate}
- Model Deformation Parameter (\u03b1): ${deformAlpha}

### Scientific Provenance & Reproducibility Ledger
${provenanceSummary}

### Bayesian Evidence Comparison
- Baseline log(Z): ${valBaselineText}
- Custom Model log(Z): ${valCustomText}
- Delta log(Z): ${valDeltaText}
- Evidence Strength: ${jeffText}

### Model Comparison & Information Criteria (AIC & BIC)
${compVal}

### Run-vs-Run Comparison Metrics
${runCompareSummary}

### Run Health & Solver Stability
${rhVal}
- Neutrino Sector Setup: ${ncdmVal}

### MCMC Chain Quality & Convergence Diagnostics (PSRF & ESS)
${chainQualitySummary}

### Likelihood Terrain Degeneracy Dimensions
- ${terrainSummary}

### Late-Time Jacobian Sensitivity (\u2202ln(Observable) / \u2202ln(Parameter))
${jacobianText}

### Dataset Pulls & Parameter Shifts
${pullsText}

### Per-Data-Point Residuals & Chi2 Contributions (Active Dataset Selection)
${perPointSummary}

### Sampler Autopsy & Solver Anomalies (Last 10 Events)
${autopsyText}

### Cosmo Curves Parameters (Late-Time Dynamics)
- Effective w0 (equation of state at z=0): ${w0Val}
- Effective wa (EoS crossing slope): ${waVal}
- Structure Growth Index \u03b30: ${gammaVal}
- Scalar Field Profile phi(z): ${phiVal}

### Sampler Brain (Proposal Covariance & Correlation Matrix)
${samplerBrainSummary}

### Boltzmann Solver (CLASS Debug & Error Snippets)
${classErrorLogsText}

### Cosmic Tension Dashboard & Discrepancies
${tensionVal}
- Struggles (Boltzmann Solver Failures): ${strugglesText}

### CosmicForge Optimizer Run Results
${cosmicforgeSection}

### Best-Fit Chi2 Breakdown
- Total Chi2: ${chi2Total}
- CMB Chi2: ${chi2Cmb}
- BAO Chi2: ${chi2Bao}
- SN Chi2: ${chi2Sn}
- Lensing Chi2: ${lastStatusData.best_lensing !== null ? lastStatusData.best_lensing.toFixed(2) : "-"}
- DESI BAO Chi2: ${lastStatusData.best_desi !== null ? lastStatusData.best_desi.toFixed(2) : "-"}
- Other Chi2: ${lastStatusData.best_other !== null ? lastStatusData.best_other.toFixed(2) : "-"}

### Best-Fit Parameter Values
${bestFitList}

### 1-Sigma Constraints (Mean & 1-Sigma)
${constraintsList}`;

            copyToClipboard(promptText, 'btn-copy-ai-prompt');
        });
    }

    // 🌌 Dedicated CosmicForge Optimizer AI Prompt
    const btnCopyAiCosmicforge = document.getElementById('btn-copy-ai-cosmicforge');
    if (btnCopyAiCosmicforge) {
        btnCopyAiCosmicforge.addEventListener('click', () => {
            if (!lastStatusData) {
                alert('No run data available yet. Start a CosmicForge optimizer run first.');
                return;
            }

            const isOpt = lastStatusData.is_optimizer;
            const runResults = lastStatusData.optimizer_run_results || [];
            const totalRuns = lastStatusData.optimizer_total_runs || 0;
            const currentRun = lastStatusData.optimizer_current_run || 0;
            const totalEvals = lastStatusData.dead_points || 0;
            const bestChi2 = lastStatusData.best_chi2;
            const bestParams = lastStatusData.best_raw_params || {};

            // Build sorted run table
            let runTableStr = '';
            if (runResults.length > 0) {
                const sorted = [...runResults].sort((a, b) => a.chi2 - b.chi2);
                const globalBest = sorted[0].chi2;
                sorted.forEach((r, i) => {
                    const label = r.label || r.name || `Run ${r.run}`;
                    const isBest = Math.abs(r.chi2 - globalBest) < 1e-3;
                    runTableStr += `${i + 1}. ${label}: χ² = ${r.chi2.toFixed(4)}${isBest ? ' ← GLOBAL BEST' : ''}\n`;
                });
            } else {
                runTableStr = 'No completed runs yet — optimizer is still on the first run.\n';
            }

            // Build best-fit params
            let bestParamStr = '';
            for (const [key, val] of Object.entries(bestParams)) {
                if (!key.startsWith('chi2__') && !key.startsWith('minuslogprior')) {
                    bestParamStr += `  ${key} = ${typeof val === 'number' ? val.toPrecision(7) : val}\n`;
                }
            }
            if (!bestParamStr) bestParamStr = '  (Not yet determined — run still in progress)\n';

            // Chi2 per probe from most recent eval (if available in run log)
            const chi2Cmb = lastStatusData.best_cmb;
            const chi2Bao = lastStatusData.best_bao;
            const chi2Sn = lastStatusData.best_sn;
            const chi2Lensing = lastStatusData.best_lensing;
            const chi2Desi = lastStatusData.best_desi;

            const probeBreakdown = [
                chi2Cmb !== null && chi2Cmb !== undefined ? `  CMB (Planck 2018): χ² = ${chi2Cmb.toFixed(2)}` : null,
                chi2Bao !== null && chi2Bao !== undefined ? `  BAO (6dF+SDSS+DESI): χ² = ${chi2Bao.toFixed(2)}` : null,
                chi2Sn !== null && chi2Sn !== undefined ? `  SN (Pantheon+SH0ES): χ² = ${chi2Sn.toFixed(2)}` : null,
                chi2Lensing !== null && chi2Lensing !== undefined ? `  CMB Lensing: χ² = ${chi2Lensing.toFixed(2)}` : null,
                chi2Desi !== null && chi2Desi !== undefined ? `  DESI BAO: χ² = ${chi2Desi.toFixed(2)}` : null,
            ].filter(Boolean).join('\n');

            const tensionInfo = lastStatusData.tensions
                ? `- H0 tension: ${lastStatusData.tensions.H0_status || 'Unknown'} (${lastStatusData.tensions.H0_tension !== null ? lastStatusData.tensions.H0_tension.toFixed(2) + 'σ' : '?'} vs SH0ES R22)
- S8 tension: ${lastStatusData.tensions.S8_status || 'Unknown'} (KiDS: ${lastStatusData.tensions.S8_tension_kids !== null ? lastStatusData.tensions.S8_tension_kids.toFixed(2) + 'σ' : '?'}, DES: ${lastStatusData.tensions.S8_tension_des !== null ? lastStatusData.tensions.S8_tension_des.toFixed(2) + 'σ' : '?'})
- Overall: ${lastStatusData.tension_status || 'Unknown'}`
                : 'Tension data not yet computed.';

            const cosmicforgePrompt = `=== CosmicForge Multi-Start BOBYQA Optimization Results ===
Model: PRTOE (Phantom Rip Theory of Everything)
Config: ${lastStatusData.active_yaml_path || 'prtoe_standard.yaml'}
Run status: ${lastStatusData.status || 'unknown'}
Optimizer: Multi-start BOBYQA (${isOpt ? 'Active' : 'Standard/PolyChord run, optimizer inactive'})

--- MULTI-START RUN SUMMARY (${runResults.length} of ${totalRuns} runs finished) ---
Current phase: Run ${currentRun}/${totalRuns}
Total BOBYQA function evaluations: ${totalEvals}

${runTableStr}
--- GLOBAL BEST FIT ---
Global best χ² total: ${bestChi2 !== null && bestChi2 !== undefined ? bestChi2.toFixed(4) : 'In progress...'}

Per-probe χ² breakdown at best-fit:
${probeBreakdown || '  (Full breakdown not available at this checkpoint — requires a finished run)'}

Best-fit parameter values:
${bestParamStr}
--- COSMOLOGICAL TENSION STATUS ---
${tensionInfo}

--- ANALYSIS REQUESTED ---
Please analyze the following aspects of this PRTOE cosmological optimization:

1. BOBYQA CONVERGENCE: Does the spread in χ² values across the multi-start runs (see table above) suggest the optimizer has found a true global minimum, or are multiple local minima competing? What does the χ² difference between best and worst runs tell us about the likelihood landscape topology?

2. PRTOE PARAMETER INTERPRETATION: Given the best-fit values for xi_prtoe, zeta_prtoe, V0_prtoe, and the other PRTOE-specific parameters, what do these imply physically? Is the PRTOE coupling (xi, zeta) consistent with observational bounds from other experiments?

3. χ² ASSESSMENT: The global best χ² = ${bestChi2 !== null && bestChi2 !== undefined ? bestChi2.toFixed(4) : 'N/A'}. For context, ΛCDM typically achieves χ² ≈ 2510–2520 on Planck+BAO+SN. Is this improvement statistically significant? What Δχ² threshold matters here given the extra PRTOE degrees of freedom?

4. TENSION RESOLUTION: Based on the best-fit parameters (H0, omega_cdm, S8 via sigma8 and omega_m), does PRTOE reduce the H0 tension vs SH0ES and the S8 tension vs KiDS/DES? By how many sigma?

5. NEXT STEPS: Given these optimizer results, what would you recommend as the next scientific step — a full PolyChord nested sampling run to get Bayesian evidence log(Z), targeted MCMC for posteriors, or further seeded multistart optimization?

Provide a concise but rigorous analysis suitable for inclusion in a cosmology paper methods section.`;

            copyToClipboard(cosmicforgePrompt, 'btn-copy-ai-cosmicforge');
        });
    }

    // New specialized AI prompt generators (updated for all recent features: PSIS-LOO k diagnostics, Bayesian Stacking, Savage-Dickey, Phone Sync robustness + manual, alive nebula, wrapper/derived fixes, etc.)
    const btnCopyAiStacking = document.getElementById('btn-copy-ai-stacking');
    if (btnCopyAiStacking) {
        btnCopyAiStacking.addEventListener('click', () => {
            if (!lastStatusData) return;
            const stackingText = document.getElementById('advanced-metrics-body') ? document.getElementById('advanced-metrics-body').innerText.trim() : "Click 'Bayesian Stacking Weights' button first for live data.";
            const prompt = `You are an expert Bayesian cosmologist and statistician. The CosmicDashboard has computed Bayesian Stacking weights (M-open predictive ensemble, unlike BMA's M-closed assumption or AIC/BIC's single winner).

Use the following to recommend an optimal model mixture for publication and prediction:

${stackingText}

Current run status: ${lastStatusData.status || 'idle'}
Evidence comparison: ${document.getElementById('val-delta') ? document.getElementById('val-delta').textContent : 'N/A'}
Best chi2: ${lastStatusData.best_chi2 || 'N/A'}

Explain the weights, how stacking kills reductive BIC 'lowest score', and suggest how to present the ensemble in a paper (e.g. predictive distributions, tension resolution by the mixture).`;
            copyToClipboard(prompt, 'btn-copy-ai-stacking');
        });
    }

    const btnCopyAiSavage = document.getElementById('btn-copy-ai-savage');
    if (btnCopyAiSavage) {
        btnCopyAiSavage.addEventListener('click', () => {
            if (!lastStatusData) return;
            const savageText = document.getElementById('advanced-metrics-body') ? document.getElementById('advanced-metrics-body').innerText.trim() : "Click 'Savage-Dickey BF' button first.";
            const prompt = `You are a theoretical cosmologist specializing in Bayesian model selection for modified gravity / beyond-LCDM.

The dashboard now supports exact Savage-Dickey density ratio for nested tests (e.g. xi_prtoe=0 exactly recovers LCDM, no arbitrary parameter count penalty like BIC).

Analyze this:

${savageText}

Run details:
- Active config: ${lastStatusData.active_yaml_path || 'unknown'}
- Delta logZ: ${document.getElementById('val-delta') ? document.getElementById('val-delta').textContent : 'N/A'}
- Best-fit params (relevant): ${lastStatusData.best_raw_params ? JSON.stringify(lastStatusData.best_raw_params) : 'N/A'}

Interpret the BF10. If >>1, the data require the extra PRTOE parameters. Contrast explicitly with what a BIC penalty would have concluded. Provide latex for the BF in a paper.`;
            copyToClipboard(prompt, 'btn-copy-ai-savage');
        });
    }

    // The master "Copy All AI Prompts" -- fully updated with all new features (PSIS-LOO + k, Stacking, Savage-Dickey, phone fixes, nebula alive, previous WAIC/evidence/reweight/PPC, provenance, etc.)
    const btnCopyAllAi = document.getElementById('btn-copy-all-ai-prompts');
    if (btnCopyAllAi) {
        btnCopyAllAi.addEventListener('click', () => {
            if (!lastStatusData) {
                alert('Run a model first to populate data for the prompts.');
                return;
            }

            // Build the main diagnostic (updated in place below)
            const status = lastStatusData.status || "idle";
            // (re-use the scraping logic by calling a helper if refactored; here we reconstruct key parts + new sections for brevity in this edit)
            const adv = document.getElementById('advanced-metrics-body') ? document.getElementById('advanced-metrics-body').innerText.trim() : "Advanced metrics not yet computed — click PSIS/Stacking/Savage buttons to populate k, weights, BFs.";
            const phoneLink = document.getElementById('phone-link-href') ? document.getElementById('phone-link-href').href : "No phone tunnel active (use the 📱sync button to set manually if auto broke).";
            const jeff = document.getElementById('jeffreys-text') ? document.getElementById('jeffreys-text').textContent : "-";
            const delta = document.getElementById('val-delta') ? document.getElementById('val-delta').textContent : "-";

            const diagnosticPrompt = `You are a theoretical cosmologist analyzing a CLASS/Cobaya/PolyChord run.

Run status: ${status}
Active config: ${lastStatusData.active_yaml_path || 'unknown'}

Advanced metrics:
${adv}

Phone tunnel: ${phoneLink}

Jeffreys scale factor: ${jeff}
Delta logZ: ${delta}

Best-fit params: ${lastStatusData.best_raw_params ? JSON.stringify(lastStatusData.best_raw_params) : 'N/A'}`;

            // Targeted stacking prompt
            const stackingPrompt = `Stacking-specific: Given the weights and the run data above, optimize and justify the ensemble predictive distribution vs picking one model. How does this change conclusions about PRTOE vs LCDM?`;

            // Savage specific
            const savagePrompt = `Savage-Dickey-specific: Using the BF and the context, compute and interpret the exact evidence for the extra parameters. Contrast to what BIC would say (BIC would penalize the extra params heavily even if the posterior at 0 is tiny). Provide ready-to-paste LaTeX.`;

            // CosmicForge optimizer prompt (new — includes multistart run table)
            const cfRunResults = lastStatusData.optimizer_run_results || [];
            let cfRunTableStr = '';
            if (cfRunResults.length > 0) {
                const cfSorted = [...cfRunResults].sort((a, b) => a.chi2 - b.chi2);
                const cfBest = cfSorted[0].chi2;
                cfSorted.forEach((r, i) => {
                    const lbl = r.label || r.name || `Run ${r.run}`;
                    cfRunTableStr += `${i+1}. ${lbl}: χ² = ${r.chi2.toFixed(4)}${Math.abs(r.chi2 - cfBest) < 1e-3 ? ' ← GLOBAL BEST' : ''}\n`;
                });
            } else {
                cfRunTableStr = lastStatusData.is_optimizer
                    ? 'Optimizer active — first run not yet finished.\n'
                    : 'Not an optimizer run (PolyChord/MCMC mode).\n';
            }
            const cosmicforgeAllPrompt = `=== CosmicForge BOBYQA Optimizer Results ===
Config: ${lastStatusData.active_yaml_path || 'prtoe_standard.yaml'}
Status: ${lastStatusData.status || 'unknown'} | Runs: ${lastStatusData.optimizer_current_run || 0}/${lastStatusData.optimizer_total_runs || 0} | Evals: ${lastStatusData.dead_points || 0}

Multi-start run χ² table (sorted best→worst):
${cfRunTableStr}
Global best χ²: ${lastStatusData.best_chi2 !== null && lastStatusData.best_chi2 !== undefined ? lastStatusData.best_chi2.toFixed(4) : 'N/A'}
Best-fit params: ${lastStatusData.best_raw_params ? JSON.stringify(lastStatusData.best_raw_params, null, 2) : 'N/A'}

Analyze convergence, PRTOE parameter significance, tension resolution, and recommend next steps.`;

            // Paper writing prompt
            const paperPrompt = `You are helping write a cosmology paper. Given ALL the above dashboard output (evidence, PSIS-LOO with k diagnostics, stacking weights, Savage-Dickey BFs, tensions resolved or not, PPC p-values, best-fit, provenance), draft:
1. A 250-word abstract highlighting how the full Bayesian toolkit (not AIC/BIC) shows the result.
2. A paragraph for the model selection section explaining why we use PSIS-LOO + stacking + Savage-Dickey instead of BIC.
3. Suggested table captions and figure ideas for the new metrics (e.g. "Pareto k per probe for the PRTOE run").
Use exact numbers from the data. Be precise and cite the methods (Vehtari PSIS, Yao stacking, Dickey-Savage).`;

            // Full context
            const fullContextPrompt = `FULL SESSION CONTEXT FOR AI (paste this first in a new chat):
[All the diagnostic + advanced + phone + new features note from above, plus the entire scraped run state from the main diagnostic prompt.]

Now answer any follow-up using the complete CosmicDashboard output. The dashboard is designed to make AIC/BIC obsolete.`;

            const allPrompts = `=== PROMPT 1: MAIN DIAGNOSTIC (with new features) ===
${diagnosticPrompt}

=== PROMPT 2: STACKING / ENSEMBLE ===
${stackingPrompt}

=== PROMPT 3: SAVAGE-DICKEY NESTED ===
${savagePrompt}

=== PROMPT 4: COSMICFORGE OPTIMIZER RESULTS ===
${cosmicforgeAllPrompt}

=== PROMPT 5: PAPER WRITING AID ===
${paperPrompt}

=== PROMPT 6: FULL MULTI-TURN CONTEXT ===
${fullContextPrompt}

--- End of All AI Prompts from CosmicDashboard. Use sequentially in your AI (e.g. Gemini/Claude) for best results. All new features (PSIS-LOO k, Stacking, Savage-Dickey, CosmicForge optimizer, phone robustness, etc.) are included above.`;

            copyToClipboard(allPrompts, 'btn-copy-all-ai-prompts');
        });
    }
});

function initCharts() {
    const ctxWMu = document.getElementById('chart-w-mu').getContext('2d');
    chartWMu = new Chart(ctxWMu, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Equation of State w(z)',
                    data: [],
                    borderColor: '#00d2d3',
                    backgroundColor: 'rgba(0, 210, 211, 0.05)',
                    fill: false,
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: 'Gravitational Pull \u03bc(z)',
                    data: [],
                    borderColor: '#ff9ff3',
                    backgroundColor: 'rgba(255, 159, 243, 0.05)',
                    fill: false,
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Redshift z', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'w(z) / \u03bc(z)', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { labels: { color: '#fff', font: { size: 10 } } }
            }
        }
    });

    const ctxFSigma8 = document.getElementById('chart-f-sigma8').getContext('2d');
    chartFSigma8 = new Chart(ctxFSigma8, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Structure Growth f\u03c3\u2088(z)',
                    data: [],
                    borderColor: '#39ff14',
                    backgroundColor: 'rgba(57, 255, 20, 0.05)',
                    fill: true,
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Redshift z', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'f\u03c3\u2088(z)', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { labels: { color: '#fff', font: { size: 10 } } }
            }
        }
    });

    const ctxInfluence = document.getElementById('chart-influence').getContext('2d');
    chartInfluence = new Chart(ctxInfluence, {
        type: 'bar',
        data: {
            labels: ['CMB Likelihood', 'BAO Likelihood', 'DESI BAO', 'Supernovae (SN)', 'Lensing', 'Total \u03c7\u00b2 Score'],
            datasets: [
                {
                    label: '\u0394\u03c7\u00b2 Relative to \u039bCDM',
                    data: [0, 0, 0, 0, 0, 0],
                    backgroundColor: [
                        'rgba(56, 103, 214, 0.6)',
                        'rgba(254, 202, 87, 0.6)',
                        'rgba(255, 159, 243, 0.6)',
                        'rgba(255, 71, 87, 0.6)',
                        'rgba(57, 255, 20, 0.6)',
                        'rgba(0, 210, 211, 0.6)'
                    ],
                    borderColor: [
                        '#3867d6',
                        '#feca57',
                        '#ff9ff3',
                        '#ff4757',
                        '#39ff14',
                        '#00d2d3'
                    ],
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: '\u0394\u03c7\u00b2 difference', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    const ctxCompareW = document.getElementById('chart-compare-w').getContext('2d');
    chartCompareW = new Chart(ctxCompareW, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Redshift z', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'w(z)', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { labels: { color: '#fff', font: { size: 9 } } }
            }
        }
    });

    const ctxCompareFs8 = document.getElementById('chart-compare-fs8').getContext('2d');
    chartCompareFs8 = new Chart(ctxCompareFs8, {
        type: 'line',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Redshift z', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'f\u03c3\u2088(z)', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { labels: { color: '#fff', font: { size: 9 } } }
            }
        }
    });

    const ctxSensitivity = document.getElementById('chart-sensitivity').getContext('2d');
    chartSensitivity = new Chart(ctxSensitivity, {
        type: 'bar',
        data: {
            labels: ['xi_prtoe', 'delta_prtoe', 'zeta_prtoe', 'beta_prtoe'],
            datasets: [
                {
                    label: 'dH\u2080 / d\u03b8',
                    data: [0, 0, 0, 0],
                    backgroundColor: 'rgba(0, 210, 211, 0.6)',
                    borderColor: '#00d2d3',
                    borderWidth: 1
                },
                {
                    label: 'dS\u2088 / d\u03b8',
                    data: [0, 0, 0, 0],
                    backgroundColor: 'rgba(254, 202, 87, 0.6)',
                    borderColor: '#feca57',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'Sensitivity derivative', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { labels: { color: '#fff', font: { size: 10 } } }
            }
        }
    });

    const ctxPlayground = document.getElementById('chart-playground-ratio').getContext('2d');
    chartPlaygroundRatio = new Chart(ctxPlayground, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'H(z) / H_\u039bCDM(z)',
                    data: [],
                    borderColor: '#39ff14',
                    backgroundColor: 'rgba(57, 255, 20, 0.05)',
                    fill: true,
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Redshift z', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'Ratio H(z)/H_\u039bCDM(z)', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    const ctxTerrain = document.getElementById('chart-terrain').getContext('2d');
    chartTerrain = new Chart(ctxTerrain, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Likelihood Samples',
                data: [],
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Param X', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'Param Y', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return `X: ${ctx.raw.x.toFixed(4)}, Y: ${ctx.raw.y.toFixed(4)}, Chi2: ${ctx.raw.chi2.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });

    const ctxResiduals = document.getElementById('chart-residuals').getContext('2d');
    chartResiduals = new Chart(ctxResiduals, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Supernovae (SN) Residuals',
                    data: [],
                    borderColor: '#ff4757',
                    backgroundColor: 'rgba(255, 71, 87, 0.1)',
                    borderWidth: 2,
                    showLine: true,
                    fill: false,
                    tension: 0.1
                },
                {
                    label: 'BAO Distance Residuals',
                    data: [],
                    borderColor: '#feca57',
                    backgroundColor: 'rgba(254, 202, 87, 0.1)',
                    borderWidth: 2,
                    showLine: true,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Redshift z', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: '(PRTOE - \u039bCDM) / \u039bCDM', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { labels: { color: '#fff', font: { size: 10 } } }
            }
        }
    });

    const ctxTrace = document.getElementById('chart-quality-trace').getContext('2d');
    chartQualityTrace = new Chart(ctxTrace, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Trace Path',
                data: [],
                borderColor: '#ff9ff3',
                backgroundColor: 'rgba(255, 159, 243, 0.05)',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                tension: 0.05
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Iteration', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'Value', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    const ctxAutocorr = document.getElementById('chart-quality-autocorr').getContext('2d');
    chartQualityAutocorr = new Chart(ctxAutocorr, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Autocorrelation r_k',
                data: [],
                backgroundColor: 'rgba(0, 210, 211, 0.6)',
                borderColor: '#00d2d3',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Lag', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'Correlation r_k', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    const ctxPerPoint = document.getElementById('chart-perpoint-residuals').getContext('2d');
    chartPerPointResiduals = new Chart(ctxPerPoint, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Residual / Chi2',
                data: [],
                backgroundColor: 'rgba(0, 210, 211, 0.6)',
                borderColor: '#00d2d3',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be', font: { size: 9 } }
                },
                y: {
                    title: { display: true, text: 'Residual Value', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    const ctxRunCompare = document.getElementById('chart-runcompare-shifts').getContext('2d');
    chartRunCompareShifts = new Chart(ctxRunCompare, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Parameter Shift (N_sigma)',
                data: [],
                backgroundColor: 'rgba(255, 159, 243, 0.6)',
                borderColor: '#ff9ff3',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                },
                y: {
                    title: { display: true, text: 'Significance (N_sigma)', color: '#a4b0be' },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#a4b0be' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// ----------------------------------------------------
// New COSMIC DASHBOARD CONTROLLERS
// ----------------------------------------------------

async function handleGenerateCorner() {
    const btn = document.getElementById('btn-generate-corner');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating corner plot...";
    appendLog("[PIPELINE] Launching GetDist corner plot generator...");
    
    try {
        const useWeights = document.getElementById('corner-use-weights').checked;
        const overlayChain = document.getElementById('corner-overlay-chain').checked;
        const checkedParams = Array.from(document.querySelectorAll('.corner-param:checked')).map(cb => cb.value).join(',');
        
        const checkUrl = `${API_URL}/api/corner_plot?use_weights=${useWeights}&overlay_chain=${overlayChain}&parameters=${encodeURIComponent(checkedParams)}&config_name=${encodeURIComponent(activeConfig)}`;
        const response = await fetch(checkUrl);
        if (response.ok) {
            const img = document.getElementById('corner-plot-img');
            const container = document.getElementById('corner-plot-container');
            img.src = `${checkUrl}&t=${Date.now()}`;
            container.style.display = 'block';
            appendLog("[PIPELINE] Corner plot generated successfully.");
        } else {
            const errData = await response.json();
            appendLog(`[PIPELINE] Corner plot failed: ${errData.detail || 'unknown error'}`);
        }
    } catch (err) {
        appendLog(`[PIPELINE] Corner plot error: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function refreshCompare() {
    const btn = document.getElementById('btn-refresh-compare');
    if (btn) btn.disabled = true;
    const tbody = document.getElementById('compare-matrix-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding: 12px; text-align: center; color: #a4b0be;">Loading comparison matrix...</td></tr>`;
    
    try {
        const response = await fetch(`${API_URL}/api/compare_models`);
        if (!response.ok) throw new Error("Failed to fetch comparison matrix.");
        const data = await response.json();
        
        if (tbody) tbody.innerHTML = "";
        
        if (!data.models || data.models.length === 0) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding: 12px; text-align: center; color: #a4b0be;">No model run data available. Run the sampler first.</td></tr>`;
            return;
        }
        
        data.models.forEach(m => {
            const chi2Str = m.chi2 !== null ? m.chi2.toFixed(2) : "-";
            const logzStr = m.logz !== null ? `${m.logz.toFixed(2)} +/- ${m.logz_err.toFixed(2)}` : "-";
            const h0Str = m.h0_tension !== null ? `${m.h0_tension.toFixed(2)}σ (${m.h0_val.toFixed(2)})` : (m.h0_val !== null ? m.h0_val.toFixed(2) : "-");
            const s8Str = m.s8_tension !== null ? `${m.s8_tension.toFixed(2)}σ (${m.s8_val.toFixed(3)})` : (m.s8_val !== null ? m.s8_val.toFixed(3) : "-");
            const w0 = m.w0 !== null && m.w0 !== undefined ? m.w0.toFixed(2) : "-";
            const wa = m.wa !== null && m.wa !== undefined ? m.wa.toFixed(2) : "-";
            const wParams = `${w0}, ${wa}`;
            
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
            tr.innerHTML = `
                <td style="padding: 8px; color: #fff; font-weight: bold;">${m.name}</td>
                <td style="padding: 8px; font-family: var(--font-mono);">${chi2Str}</td>
                <td style="padding: 8px; font-family: var(--font-mono);">${logzStr}</td>
                <td style="padding: 8px; font-family: var(--font-mono);">${h0Str}</td>
                <td style="padding: 8px; font-family: var(--font-mono);">${s8Str}</td>
                <td style="padding: 8px; font-family: var(--font-mono);">${wParams}</td>
            `;
            if (tbody) tbody.appendChild(tr);
        });
        
        if (chartCompareW && chartCompareFs8) {
            chartCompareW.data.datasets = [];
            chartCompareFs8.data.datasets = [];
            
            const colors = ['#00d2d3', '#ff9ff3', '#feca57', '#ff4757', '#39ff14', '#1e90ff', '#ffb8b8'];
            let labelsSet = false;
            
            data.models.forEach((m, idx) => {
                if (m.curves && m.curves.success) {
                    if (!labelsSet) {
                        chartCompareW.data.labels = m.curves.z.map(z => z.toFixed(2));
                        chartCompareFs8.data.labels = m.curves.z.map(z => z.toFixed(2));
                        labelsSet = true;
                    }
                    
                    chartCompareW.data.datasets.push({
                        label: m.name,
                        data: m.curves.w,
                        borderColor: colors[idx % colors.length],
                        backgroundColor: 'transparent',
                        fill: false,
                        borderWidth: 2,
                        tension: 0.1
                    });
                    
                    chartCompareFs8.data.datasets.push({
                        label: m.name,
                        data: m.curves.f_sigma8,
                        borderColor: colors[idx % colors.length],
                        backgroundColor: 'transparent',
                        fill: false,
                        borderWidth: 2,
                        tension: 0.1
                    });
                }
            });
            
            chartCompareW.update();
            chartCompareFs8.update();
        }
    } catch (err) {
        console.error(err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="padding: 12px; text-align: center; color: #ff4757;">Error: ${err.message}</td></tr>`;
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function runStabilityScanner() {
    const btn = document.getElementById('btn-run-scanner');
    btn.disabled = true;
    const resultsDiv = document.getElementById('stability-scan-results');
    const idleDiv = document.getElementById('stability-scan-idle');
    
    idleDiv.style.display = 'none';
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `<span style="color: #00d2d3;">Initializing scanner... Varing parameters ±10%...</span>`;
    
    try {
        const response = await fetch(`${API_URL}/api/stability_scan?config_name=${encodeURIComponent(activeConfig)}`);
        if (!response.ok) throw new Error("Failed parameter stability scan.");
        const data = await response.json();
        
        let html = `<div style="font-weight: bold; margin-bottom: 6px; color: ${data.failed_count > 0 ? '#ff4757' : '#39ff14'}">${data.summary}</div>`;
        html += `<table style="width: 100%; border-collapse: collapse; margin-top: 4px;">`;
        html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><th>Parameter</th><th>Value</th><th>Status</th></tr>`;
        data.results.forEach(r => {
            const statusColor = r.status === 'Stable' ? '#39ff14' : '#ff4757';
            html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                <td>${r.parameter}</td>
                <td>${r.value.toExponential(3)}</td>
                <td style="color: ${statusColor}; font-weight: bold;">${r.status}</td>
            </tr>`;
        });
        html += `</table>`;
        resultsDiv.innerHTML = html;
    } catch (err) {
        resultsDiv.innerHTML = `<span style="color: #ff4757;">Error scanning parameters: ${err.message}</span>`;
    } finally {
        btn.disabled = false;
    }
}

async function runSensitivityAnalyzer() {
    const btn = document.getElementById('btn-run-sensitivity');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Calculating... (~10s)";
    appendLog("[PIPELINE] Launching parameter sensitivity analyzer. Running model at perturbations...");
    
    try {
        const response = await fetch(`${API_URL}/api/sensitivity_analysis?config_name=${encodeURIComponent(activeConfig)}`);
        if (!response.ok) throw new Error("Failed to calculate parameter sensitivities.");
        const data = await response.json();
        
        appendLog(`[PIPELINE] Sensitivity analyzer completed. Base H0: ${data.base_H0.toFixed(2)}, Base S8: ${data.base_S8.toFixed(3)}.`);
        
        if (chartSensitivity) {
            const labels = [];
            const h0Data = [];
            const s8Data = [];
            
            for (const [param, sens] of Object.entries(data.sensitivities)) {
                labels.push(param);
                h0Data.push(sens.dH0_dparam);
                s8Data.push(sens.dS8_dparam);
            }
            
            chartSensitivity.data.labels = labels;
            chartSensitivity.data.datasets[0].data = h0Data;
            chartSensitivity.data.datasets[1].data = s8Data;
            chartSensitivity.update();
        }
    } catch (err) {
        appendLog(`[PIPELINE] Sensitivity analyzer error: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

let playgroundDebounceTimeout = null;
function updatePlayground() {
    clearTimeout(playgroundDebounceTimeout);
    playgroundDebounceTimeout = setTimeout(async () => {
        const delta = parseFloat(document.getElementById('slide-delta').value);
        const xiSlider = parseFloat(document.getElementById('slide-xi').value);
        const zeta = parseFloat(document.getElementById('slide-zeta').value);
        const betaSlider = parseFloat(document.getElementById('slide-beta').value);
        
        const xi = Math.pow(10, xiSlider);
        const beta = Math.pow(10, betaSlider);
        
        document.getElementById('val-slide-delta').innerText = delta.toFixed(2);
        document.getElementById('val-slide-xi').innerText = xi.toExponential(2);
        document.getElementById('val-slide-zeta').innerText = zeta.toFixed(2);
        document.getElementById('val-slide-beta').innerText = beta.toExponential(2);
        
        try {
            const reqData = {
                delta_prtoe: delta,
                xi_prtoe: xi,
                zeta_prtoe: zeta,
                beta_prtoe: beta,
                omega_b: 0.0224,
                omega_cdm: 0.120,
                H0: 67.4
            };
            
            const response = await fetch(`${API_URL}/api/playground_curves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqData)
            });
            if (!response.ok) throw new Error("CLASS failed to evaluate playground curves.");
            const data = await response.json();
            
            if (chartPlaygroundRatio) {
                chartPlaygroundRatio.data.labels = data.z.map(z => z.toFixed(2));
                chartPlaygroundRatio.data.datasets[0].data = data.H_ratio;
                chartPlaygroundRatio.update('none');
            }
        } catch (err) {
            console.error("Playground curves error:", err);
        }
    }, 150);
}

async function handleSamplerRecovery(widenPercent = 0.20, proposalScale = 2.0) {
    const btn = document.getElementById('btn-manual-recover');
    const btnStag = document.getElementById('btn-stagnation-recover');
    if (btn) btn.disabled = true;
    if (btnStag) btnStag.disabled = true;
    
    const applyWatchdog = document.getElementById('chk-apply-watchdog')?.checked ?? false;
    const watchdogMsg = applyWatchdog ? " (with Watchdog recommendations)" : " (manual widening only)";
    appendLog(`[PIPELINE] Sending sampler recovery request. Priors widening by 20%, proposal scale widening by 2x${watchdogMsg}...`);
    try {
        const response = await fetch(`${API_URL}/api/recover_sampler`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config_name: activeConfig,
                widen_percent: widenPercent,
                proposal_scale: proposalScale,
                apply_watchdog_recommendations: applyWatchdog
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            appendLog(`[PIPELINE] SUCCESS: ${data.message}`);
            document.getElementById('stagnation-banner').style.display = 'none';
        } else {
            const errData = await response.json();
            appendLog(`[PIPELINE] Sampler recovery failed: ${errData.detail || 'check logs'}`);
        }
    } catch (err) {
        appendLog(`[PIPELINE] Recovery error: ${err.message}`);
    } finally {
        if (btn) btn.disabled = false;
        if (btnStag) btnStag.disabled = false;
    }
}

async function handleWizardCompile() {
    const btn = document.getElementById('btn-wizard-compile');
    const statusTxt = document.getElementById('wizard-status-txt');
    const opt = document.getElementById('wizard-opt').value;
    const native = document.getElementById('wizard-native').checked;
    const fastmath = document.getElementById('wizard-fastmath').checked;
    const clean = document.getElementById('wizard-clean').checked;
    const cores = inputCores ? (parseInt(inputCores.value) || 4) : 4;

    btn.disabled = true;
    statusTxt.innerText = "Compiling CLASS Engine...";
    appendLog(`[CLASS ENGINE] Compilation wizard started: Level=${opt}, Native=${native}, Clean=${clean}`);

    try {
        const response = await fetch(`${API_URL}/api/rebuild_class_wizard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                opt_level: opt,
                march_native: native,
                fast_math: fastmath,
                vectorize: true,
                cores: cores,
                clean: clean
            })
        });
        const data = await response.json();
        if (response.ok) {
            appendLog(`[CLASS ENGINE] Build process launched in background.`);
            pollRebuildStatus();
        } else {
            appendLog(`[CLASS ENGINE] Wizard compilation launch failed: ${data.detail}`);
            btn.disabled = false;
            statusTxt.innerText = "Build launch failed";
        }
    } catch (err) {
        appendLog(`[CLASS ENGINE] Build error: ${err.message}`);
        btn.disabled = false;
        statusTxt.innerText = "Execution failed";
    }
}

async function pollRebuildStatus() {
    const btn = document.getElementById('btn-wizard-compile');
    const statusTxt = document.getElementById('wizard-status-txt');
    try {
        const response = await fetch(`${API_URL}/api/rebuild_status`);
        const data = await response.json();
        if (data.status === "building") {
            statusTxt.innerText = `Compiling (log line count: ${data.log.length})...`;
            setTimeout(pollRebuildStatus, 2000);
        } else {
            statusTxt.innerText = `Build ${data.status.toUpperCase()}`;
            btn.disabled = false;
            if (data.status === "success") {
                appendLog(`[CLASS ENGINE] SUCCESS: Custom compiler wizard finished successfully!`);
                fetchSysInfo();
            } else {
                const lastLog = data.log.length > 0 ? data.log[data.log.length - 1] : "No log";
                appendLog(`[CLASS ENGINE] FAILED: Compiler failed. Last error: ${lastLog}`);
            }
        }
    } catch (err) {
        statusTxt.innerText = "Error polling compiler";
        btn.disabled = false;
    }
}

async function handleResetHistory() {
    showConfirmationModal(
        "Clear History Cache",
        "Are you sure you want to clear the plot frames history cache? This will delete all collected movie frames.",
        "Yes, Clear Cache",
        "Cancel",
        async () => {
            const btn = document.getElementById('btn-reset-history');
            if (btn) btn.disabled = true;
            try {
                const response = await fetch(`${API_URL}/api/reset_history`, { method: 'POST' });
                if (response.ok) {
                    appendLog(`[PIPELINE] Plot frames history cache cleared.`);
                    const slider = document.getElementById('evolution-slider');
                    const frameNum = document.getElementById('evolution-frame-num');
                    const frameImg = document.getElementById('evolution-frame-img');
                    if (slider) { slider.min = 0; slider.max = 0; slider.value = 0; }
                    if (frameNum) frameNum.innerText = "0 / 0";
                    if (frameImg) { frameImg.style.display = 'none'; frameImg.src = ''; }
                }
            } catch (err) {
                console.error("Error resetting history:", err);
            } finally {
                if (btn) btn.disabled = false;
            }
        }
    );
}

async function handleExportFigure() {
    const btn = document.getElementById('btn-export-figure');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generating figure... (takes ~15s)";
    appendLog("[PIPELINE] Launching GetDist print-ready paper figure generator...");
    try {
        const response = await fetch(`${API_URL}/api/export_paper_figure`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cosmo_paper_figure.png';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            appendLog("[PIPELINE] Paper figure exported successfully and downloaded.");
        } else {
            const errData = await response.json();
            appendLog(`[PIPELINE] Figure export failed: ${errData.detail || 'check logs'}`);
        }
    } catch (err) {
        appendLog(`[PIPELINE] Export error: ${err.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function showEvolutionFrame(frameIndex) {
    const frames = lastStatusData && lastStatusData.history_frames ? lastStatusData.history_frames : [];
    const frameImg = document.getElementById('evolution-frame-img');
    const frameNum = document.getElementById('evolution-frame-num');
    if (frames.length > 0 && frameIndex >= 1 && frameIndex <= frames.length) {
        frameImg.src = `${API_URL}${frames[frameIndex - 1]}`;
        frameImg.style.display = 'block';
        frameNum.innerText = `${frameIndex} / ${frames.length}`;
    } else {
        frameImg.style.display = 'none';
        frameNum.innerText = "0 / 0";
    }
}

function toggleEvolutionPlayback() {
    const btn = document.getElementById('btn-play-evolution');
    const slider = document.getElementById('evolution-slider');
    const frames = lastStatusData && lastStatusData.history_frames ? lastStatusData.history_frames : [];
    
    if (frames.length === 0) return;
    
    if (isPlayingEvolution) {
        clearInterval(evolutionPlayInterval);
        btn.textContent = "▶ Play";
        isPlayingEvolution = false;
    } else {
        btn.textContent = "⏸ Pause";
        isPlayingEvolution = true;
        
        evolutionPlayInterval = setInterval(() => {
            let current = parseInt(slider.value);
            current++;
            if (current > frames.length) {
                current = 1;
            }
            slider.value = current;
            showEvolutionFrame(current);
        }, 1000);
    }
}

// ----------------------------------------------------
// Visual Explorer Endpoint Wrappers & Helpers
// ----------------------------------------------------

async function refreshJacobianAndPulls() {
    const jacobianContainer = document.getElementById('jacobian-heatmap-container');
    const pullContainer = document.getElementById('dataset-pull-container');
    if (!jacobianContainer || !pullContainer) return;
    
    // Fetch Jacobian
    try {
        jacobianContainer.innerHTML = `<div style="color: #a4b0be; text-align: center; padding: 10px;">Loading Jacobian matrix...</div>`;
        const res = await fetch(`${API_URL}/api/jacobian?config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
                const params = data.parameters;
                const obs = data.observables;
                const matrix = data.matrix;
                
                let html = `<table style="width:100%; border-collapse: collapse; text-align: center; font-size: 0.78rem;">`;
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02);"><th style="padding: 6px; text-align: left;">Parameter</th>`;
                obs.forEach(o => {
                    html += `<th style="padding: 6px;">${o}</th>`;
                });
                html += `</tr>`;
                
                params.forEach(p => {
                    html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">`;
                    html += `<td style="padding: 6px; text-align: left; font-weight: bold; color: #ff9ff3;">${p}</td>`;
                    obs.forEach(o => {
                        const val = matrix[p][o];
                        let color = '#fff';
                        let bg = 'transparent';
                        if (val > 0.001) {
                            const intens = Math.min(0.6, val * 2.0);
                            bg = `rgba(16, 172, 132, ${intens})`;
                        } else if (val < -0.001) {
                            const intens = Math.min(0.6, Math.abs(val) * 2.0);
                            bg = `rgba(255, 71, 87, ${intens})`;
                        }
                        html += `<td style="padding: 6px; background: ${bg}; color: ${color};" title="&part;ln(${o})/&part;ln(${p}) = ${val.toFixed(5)}">${val.toFixed(4)}</td>`;
                    });
                    html += `</tr>`;
                });
                html += `</table>`;
                jacobianContainer.innerHTML = html;
            } else {
                jacobianContainer.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Failed: ${data.detail || 'unknown error'}</div>`;
            }
        } else {
            jacobianContainer.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Failed to fetch Jacobian. CLASS may not be initialized.</div>`;
        }
    } catch(err) {
        jacobianContainer.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Error: ${err.message}</div>`;
    }

    // Fetch Dataset Pulls
    try {
        pullContainer.innerHTML = `<div style="color: #a4b0be; text-align: center; padding: 10px;">Loading pull data...</div>`;
        const res = await fetch(`${API_URL}/api/dataset_pull?config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
                const pulls = data.pulls;
                let html = `<table style="width:100%; border-collapse: collapse; text-align: center; font-size: 0.78rem;">`;
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02);">`;
                html += `<th style="padding: 6px; text-align: left;">Dataset</th>`;
                html += `<th style="padding: 6px;">H₀ Pull (corr)</th>`;
                html += `<th style="padding: 6px;">S₈ Pull (corr)</th>`;
                html += `<th style="padding: 6px;">&chi;² Contribution</th>`;
                html += `</tr>`;
                
                Object.keys(pulls).forEach(datasetName => {
                    const info = pulls[datasetName];
                    const h0Shift = info.H0_shift || 0.0;
                    const s8Shift = info.S8_shift || 0.0;
                    const chi2 = info.chi2_contribution || 0.0;
                    
                    let h0Color = h0Shift > 0 ? '#10ac84' : (h0Shift < 0 ? '#ff4757' : '#fff');
                    let s8Color = s8Shift > 0 ? '#10ac84' : (s8Shift < 0 ? '#ff4757' : '#fff');
                    
                    html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">`;
                    html += `<td style="padding: 6px; text-align: left; font-weight: bold; color: #00d2d3;">${datasetName}</td>`;
                    html += `<td style="padding: 6px; color: ${h0Color}; font-weight: 500;">${h0Shift > 0 ? '+' : ''}${h0Shift.toFixed(3)}</td>`;
                    html += `<td style="padding: 6px; color: ${s8Color}; font-weight: 500;">${s8Shift > 0 ? '+' : ''}${s8Shift.toFixed(3)}</td>`;
                    html += `<td style="padding: 6px; color: #fff;">${chi2.toFixed(1)}</td>`;
                    html += `</tr>`;
                });
                html += `</table>`;
                pullContainer.innerHTML = html;
            } else {
                pullContainer.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Failed: ${data.detail || 'unknown error'}</div>`;
            }
        } else {
            pullContainer.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Failed to fetch pulls. Run the sampler first.</div>`;
        }
    } catch(err) {
        pullContainer.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Error: ${err.message}</div>`;
    }
}

async function refreshSamplerBrain() {
    const container = document.getElementById('sampler-brain-matrix');
    if (!container) return;
    try {
        container.innerHTML = `<div style="color: #a4b0be; text-align: center; padding: 10px;">Loading covariance...</div>`;
        const res = await fetch(`${API_URL}/api/sampler_brain?config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
                const params = data.parameters;
                const cov = data.covariance;
                
                let html = `<table style="width:100%; border-collapse: collapse; text-align: center; font-size: 0.76rem;">`;
                html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02);"><th style="padding: 4px; text-align: left;">Param</th>`;
                params.forEach(p => {
                    html += `<th style="padding: 4px; font-size: 0.7rem;" title="${p}">${p.substring(0, 8)}</th>`;
                });
                html += `</tr>`;
                
                params.forEach((p1, idx1) => {
                    html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">`;
                    html += `<td style="padding: 4px; text-align: left; font-weight: bold; color: #ff9ff3; font-size: 0.7rem;">${p1.substring(0, 8)}</td>`;
                    
                    params.forEach((p2, idx2) => {
                        let val = 0.0;
                        if (cov[idx1] && cov[idx1][idx2] !== undefined) {
                            val = cov[idx1][idx2];
                        }
                        
                        let corr = 0.0;
                        if (cov[idx1] && cov[idx2] && cov[idx1][idx1] > 0 && cov[idx2][idx2] > 0) {
                            corr = cov[idx1][idx2] / Math.sqrt(cov[idx1][idx1] * cov[idx2][idx2]);
                        } else {
                            corr = val;
                        }
                        if (idx1 === idx2) corr = 1.0;
                        
                        let bg = 'transparent';
                        if (corr > 0) {
                            bg = `rgba(16, 172, 132, ${Math.min(0.6, corr)})`;
                        } else if (corr < 0) {
                            bg = `rgba(255, 71, 87, ${Math.min(0.6, Math.abs(corr))})`;
                        }
                        
                        html += `<td style="padding: 4px; background: ${bg}; color: #fff;" title="Covariance(${p1}, ${p2}) = ${val.toExponential(3)}\nCorrelation = ${corr.toFixed(3)}">${corr.toFixed(2)}</td>`;
                    });
                    html += `</tr>`;
                });
                html += `</table>`;
                container.innerHTML = html;
            } else {
                container.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Failed: ${data.detail || 'unknown error'}</div>`;
            }
        } else {
            container.innerHTML = `<div style="color: #a4b0be; text-align: center; padding: 10px;">Covariance matrix not generated yet. Start the run.</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div style="color: #ff4757; text-align: center; padding: 10px;">Error: ${err.message}</div>`;
    }
}

function populateTerrainDropdowns(params) {
    const xSelect = document.getElementById('terrain-param-x');
    const ySelect = document.getElementById('terrain-param-y');
    if (!xSelect || !ySelect) return;
    if (xSelect.options.length > 0) return;
    
    xSelect.innerHTML = '';
    ySelect.innerHTML = '';
    
    params.forEach(p => {
        const optX = document.createElement('option');
        optX.value = p;
        optX.textContent = p;
        if (p === 'H0') optX.selected = true;
        xSelect.appendChild(optX);
        
        const optY = document.createElement('option');
        optY.value = p;
        optY.textContent = p;
        if (p === 'omega_cdm') optY.selected = true;
        ySelect.appendChild(optY);
    });
}

async function refreshLikelihoodTerrain() {
    const xSelect = document.getElementById('terrain-param-x');
    const ySelect = document.getElementById('terrain-param-y');
    if (!xSelect || !ySelect) return;
    
    populateTerrainDropdowns(["H0", "omega_cdm", "delta_prtoe", "xi_prtoe", "zeta_prtoe", "S8", "sigma8"]);
    
    const p1 = xSelect.value || "H0";
    const p2 = ySelect.value || "omega_cdm";
    
    try {
        const res = await fetch(`${API_URL}/api/likelihood_terrain?param1=${encodeURIComponent(p1)}&param2=${encodeURIComponent(p2)}&config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success" && data.points) {
                // Dynamically update dropdown parameters if backend provides them
                if (data.parameters && data.parameters.length > 0) {
                    const currentOpts = Array.from(xSelect.options).map(o => o.value);
                    const differs = data.parameters.length !== currentOpts.length || !data.parameters.every((val, idx) => val === currentOpts[idx]);
                    if (differs) {
                        const currentX = xSelect.value;
                        const currentY = ySelect.value;
                        
                        xSelect.innerHTML = '';
                        ySelect.innerHTML = '';
                        
                        data.parameters.forEach(p => {
                            const optX = document.createElement('option');
                            optX.value = p;
                            optX.textContent = p;
                            xSelect.appendChild(optX);
                            
                            const optY = document.createElement('option');
                            optY.value = p;
                            optY.textContent = p;
                            ySelect.appendChild(optY);
                        });
                        
                        if (data.parameters.includes(currentX)) xSelect.value = currentX;
                        else if (data.parameters.includes(p1)) xSelect.value = p1;
                        
                        if (data.parameters.includes(currentY)) ySelect.value = currentY;
                        else if (data.parameters.includes(p2)) ySelect.value = p2;
                    }
                }
                
                const chi2s = data.points.map(pt => pt.chi2);
                const minChi2 = Math.min(...chi2s);
                const maxChi2 = Math.max(...chi2s);
                const diff = maxChi2 - minChi2 || 1.0;
                
                const scatterData = data.points.map(pt => {
                    const norm = (pt.chi2 - minChi2) / diff;
                    const hue = 120 + (150 * norm);
                    const lightness = 60 - (30 * norm);
                    return {
                        x: pt.x,
                        y: pt.y,
                        chi2: pt.chi2,
                        color: `hsla(${hue}, 80%, ${lightness}%, 0.8)`
                    };
                });
                
                chartTerrain.data.datasets[0].data = scatterData;
                chartTerrain.data.datasets[0].backgroundColor = scatterData.map(pt => pt.color);
                chartTerrain.data.datasets[0].pointBackgroundColor = scatterData.map(pt => pt.color);
                
                chartTerrain.options.scales.x.title.text = xSelect.value || p1;
                chartTerrain.options.scales.y.title.text = ySelect.value || p2;
                chartTerrain.update();
            }
        }
    } catch (err) {
        console.error("Error refreshing likelihood terrain:", err);
    }
}

async function refreshAutopsyAndResiduals() {
    const timeline = document.getElementById('autopsy-timeline');
    if (!timeline) return;
    
    // Autopsy Timeline
    try {
        const res = await fetch(`${API_URL}/api/run_autopsy?config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success" && data.events) {
                timeline.innerHTML = '';
                data.events.forEach(evt => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.gap = '8px';
                    row.style.alignItems = 'flex-start';
                    row.style.marginBottom = '4px';
                    
                    let badgeColor = '#3867d6';
                    if (evt.type === 'Warning') badgeColor = '#feca57';
                    else if (evt.type === 'Alert') badgeColor = '#ff4757';
                    else if (evt.type === 'Success') badgeColor = '#10ac84';
                    
                    const timeEl = document.createElement('span');
                    timeEl.style.color = '#a4b0be';
                    timeEl.style.minWidth = '80px';
                    timeEl.textContent = `[${evt.time}]`;
                    
                    const typeEl = document.createElement('span');
                    typeEl.style.color = badgeColor;
                    typeEl.style.fontWeight = 'bold';
                    typeEl.style.minWidth = '70px';
                    typeEl.textContent = evt.type.toUpperCase();
                    
                    const msgEl = document.createElement('span');
                    msgEl.style.color = '#fff';
                    msgEl.textContent = evt.message;
                    
                    row.appendChild(timeEl);
                    row.appendChild(typeEl);
                    row.appendChild(msgEl);
                    timeline.appendChild(row);
                });
                timeline.scrollTop = timeline.scrollHeight;
            }
        }
    } catch(err) {
        console.error("Error fetching autopsy:", err);
    }
    
    // Residuals Explorer
    try {
        const res = await fetch(`${API_URL}/api/residuals?config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
                const sn = data.sn;
                const bao = data.bao;
                
                chartResiduals.data.datasets[0].data = sn.z.map((zVal, idx) => {
                    return { x: zVal, y: sn.residuals[idx] };
                });
                chartResiduals.data.datasets[1].data = bao.z.map((zVal, idx) => {
                    return { x: zVal, y: bao.residuals[idx] };
                });
                
                chartResiduals.update();
            }
        }
    } catch(err) {
        console.error("Error fetching residuals:", err);
    }
}

async function updateDeformation(alpha) {
    try {
        const response = await fetch(`${API_URL}/api/model_deformation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alpha: alpha,
                config_name: activeConfig
            })
        });
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success") {
                if (chartWMu) {
                    chartWMu.data.labels = data.z.map(z => parseFloat(z).toFixed(2));
                    chartWMu.data.datasets[0].data = data.w;
                    chartWMu.data.datasets[1].data = data.H_ratio;
                    chartWMu.data.datasets[1].label = alpha > 0 ? 'Expansion Ratio H(z)/H_\u039bCDM(z)' : 'Gravitational Pull \u03bc(z)';
                    chartWMu.update('none');
                }
                if (chartFSigma8) {
                    chartFSigma8.data.labels = data.z.map(z => parseFloat(z).toFixed(2));
                    chartFSigma8.data.datasets[0].data = data.f_sigma8;
                    chartFSigma8.update('none');
                }
            }
        }
    } catch (err) {
        console.error("Error during model deformation update:", err);
    }
}

async function refreshTemplatesList() {
    const selectEl = document.getElementById('select-config-template');
    if (!selectEl) return;
    try {
        const response = await fetch(`${API_URL}/api/templates/list`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && data.templates) {
                selectEl.innerHTML = '<option value="">-- Load Preset / Custom Template --</option>';
                
                const presets = {
                    "lcdm_baseline": "ΛCDM Baseline",
                    "prtoe_standard": "PRTOE Standard",
                    "wcdm_test": "wCDM Test",
                    "ede_test": "EDE Test (Model Zoo)",
                    "last_run": "Last Run"
                };
                
                Object.entries(presets).forEach(([val, label]) => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = label;
                    selectEl.appendChild(opt);
                });
                
                data.templates.forEach(t => {
                    if (!(t in presets)) {
                        const opt = document.createElement('option');
                        opt.value = t;
                        opt.textContent = `Custom: ${t}`;
                        selectEl.appendChild(opt);
                    }
                });
            }
        }
    } catch (err) {
        console.error("Error loading templates list:", err);
    }
}

async function refreshChainQuality() {
    const tableBody = document.getElementById('chain-quality-table-body');
    const selectEl = document.getElementById('select-quality-param');
    if (!tableBody || !selectEl) return;
    
    const selectedParam = selectEl.value || "H0";
    
    try {
        const res = await fetch(`${API_URL}/api/chain_quality?param=${encodeURIComponent(selectedParam)}&config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
                if (selectEl.options.length === 0) {
                    selectEl.innerHTML = '';
                    data.parameters.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.parameter;
                        opt.textContent = p.parameter;
                        if (p.parameter === selectedParam) opt.selected = true;
                        selectEl.appendChild(opt);
                    });
                }
                
                let html = '';
                data.parameters.forEach(p => {
                    const rhat = p.rhat;
                    const ess = p.ess;
                    
                    let rhatColor = rhat < 1.05 ? '#10ac84' : (rhat < 1.10 ? '#feca57' : '#ff4757');
                    let statusLabel = rhat < 1.05 ? 'CONVERGED' : (rhat < 1.10 ? 'WARNING' : 'UNCONVERGED');
                    let statusColor = rhat < 1.05 ? '#10ac84' : (rhat < 1.10 ? '#feca57' : '#ff4757');
                    
                    html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">`;
                    html += `<td style="padding: 6px; font-weight: bold; color: #ff9ff3;">${p.parameter}</td>`;
                    html += `<td style="padding: 6px; color: ${rhatColor}; font-family: var(--font-mono);">${rhat.toFixed(4)}</td>`;
                    html += `<td style="padding: 6px; color: #fff; font-family: var(--font-mono);">${ess}</td>`;
                    html += `<td style="padding: 6px; color: ${statusColor}; font-weight: bold;">${statusLabel}</td>`;
                    html += `</tr>`;
                });
                tableBody.innerHTML = html;
                
                if (chartQualityTrace && data.trace.length > 0) {
                    chartQualityTrace.data.labels = data.trace.map(t => t.iter);
                    chartQualityTrace.data.datasets[0].data = data.trace.map(t => t.val);
                    chartQualityTrace.options.scales.y.title.text = selectedParam;
                    chartQualityTrace.update();
                }
                
                if (chartQualityAutocorr && data.autocorr.length > 0) {
                    chartQualityAutocorr.data.labels = data.autocorr.map(a => a.lag);
                    chartQualityAutocorr.data.datasets[0].data = data.autocorr.map(a => a.val);
                    chartQualityAutocorr.options.scales.y.title.text = `Correlation (r_k) - ${selectedParam}`;
                    chartQualityAutocorr.update();
                }
            }
        }
    } catch (err) {
        console.error("Error refreshing chain quality:", err);
    }
}

let perPointDataCache = null;

async function refreshPerPointChi2() {
    const tableHead = document.getElementById('perpoint-table-head');
    const tableBody = document.getElementById('perpoint-table-body');
    const selectDataset = document.getElementById('select-perpoint-dataset');
    if (!tableHead || !tableBody || !selectDataset) return;

    // Cache the listener registration
    if (!selectDataset.dataset.listenerRegistered) {
        selectDataset.addEventListener('change', () => {
            renderPerPointDataset();
        });
        selectDataset.dataset.listenerRegistered = 'true';
    }

    try {
        const res = await fetch(`${API_URL}/api/per_point_chi2?config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
                perPointDataCache = data;
                renderPerPointDataset();
            }
        }
    } catch (err) {
        console.error("Error refreshing per point chi2:", err);
    }
}

function renderPerPointDataset() {
    if (!perPointDataCache) return;
    const selectDataset = document.getElementById('select-perpoint-dataset');
    const tableHead = document.getElementById('perpoint-table-head');
    const tableBody = document.getElementById('perpoint-table-body');
    if (!selectDataset || !tableHead || !tableBody) return;

    const datasetType = selectDataset.value;
    const dataList = perPointDataCache[datasetType] || [];
    
    let headHtml = '';
    let bodyHtml = '';
    let labels = [];
    let chartValues = [];
    let yTitle = 'Residual';

    if (datasetType === 'bao') {
        headHtml = `
            <th style="padding: 6px; color: #a4b0be;">ID</th>
            <th style="padding: 6px; color: #a4b0be;">Dataset</th>
            <th style="padding: 6px; color: #a4b0be;">Redshift (z)</th>
            <th style="padding: 6px; color: #a4b0be;">Residual</th>
            <th style="padding: 6px; color: #a4b0be;">Error</th>
            <th style="padding: 6px; color: #a4b0be;">&chi;&sup2;</th>
        `;
        dataList.forEach(item => {
            bodyHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 6px;">${item.id}</td>
                    <td style="padding: 6px; font-weight: bold; color: #ff9ff3;">${item.dataset}</td>
                    <td style="padding: 6px; font-family: var(--font-mono);">${item.redshift.toFixed(3)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: ${item.residual >= 0 ? '#10ac84' : '#ff4757'}">${item.residual.toFixed(5)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono);">${item.error.toFixed(5)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: #00d2d3; font-weight: bold;">${item.chi2.toFixed(3)}</td>
                </tr>
            `;
            labels.push(`z=${item.redshift.toFixed(2)} (${item.dataset})`);
            chartValues.push(item.residual);
        });
        yTitle = 'Residual Value';
    } else if (datasetType === 'cmb') {
        headHtml = `
            <th style="padding: 6px; color: #a4b0be;">Multipole (&ell;)</th>
            <th style="padding: 6px; color: #a4b0be;">Residual &Delta;D<sub>&ell;</sub></th>
            <th style="padding: 6px; color: #a4b0be;">Error</th>
            <th style="padding: 6px; color: #a4b0be;">&chi;&sup2;</th>
        `;
        dataList.forEach(item => {
            bodyHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 6px; font-weight: bold; color: #feca57;">&ell;=${item.multipole}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: ${item.residual_Dl >= 0 ? '#10ac84' : '#ff4757'}">${item.residual_Dl.toFixed(3)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono);">${item.error.toFixed(3)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: #00d2d3; font-weight: bold;">${item.chi2.toFixed(3)}</td>
                </tr>
            `;
            labels.push(`&ell;=${item.multipole}`);
            chartValues.push(item.residual_Dl);
        });
        yTitle = 'Residual D_l';
    } else if (datasetType === 'sn') {
        headHtml = `
            <th style="padding: 6px; color: #a4b0be;">Supernova Name</th>
            <th style="padding: 6px; color: #a4b0be;">Redshift (z)</th>
            <th style="padding: 6px; color: #a4b0be;">Residual &Delta;&mu;</th>
            <th style="padding: 6px; color: #a4b0be;">Error</th>
            <th style="padding: 6px; color: #a4b0be;">&chi;&sup2; Contribution</th>
        `;
        dataList.forEach(item => {
            bodyHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 6px; font-weight: bold; color: #ff7675;">${item.name}</td>
                    <td style="padding: 6px; font-family: var(--font-mono);">${item.redshift.toFixed(3)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: ${item.residual_mu >= 0 ? '#10ac84' : '#ff4757'}">${item.residual_mu.toFixed(4)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono);">${item.error.toFixed(4)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: #00d2d3; font-weight: bold;">${item.chi2.toFixed(3)}</td>
                </tr>
            `;
            labels.push(item.name);
            chartValues.push(item.chi2);
        });
        yTitle = 'Chi2 Contribution';
    } else if (datasetType === 'lensing') {
        headHtml = `
            <th style="padding: 6px; color: #a4b0be;">Scale k (h/Mpc)</th>
            <th style="padding: 6px; color: #a4b0be;">Residual &Delta;P<sub>k</sub></th>
            <th style="padding: 6px; color: #a4b0be;">Error</th>
            <th style="padding: 6px; color: #a4b0be;">&chi;&sup2;</th>
        `;
        dataList.forEach(item => {
            bodyHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 6px; font-weight: bold; color: #54a0ff;">${item.k_h_Mpc.toFixed(4)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: ${item.residual_Pk >= 0 ? '#10ac84' : '#ff4757'}">${item.residual_Pk.toFixed(5)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono);">${item.error.toFixed(5)}</td>
                    <td style="padding: 6px; font-family: var(--font-mono); color: #00d2d3; font-weight: bold;">${item.chi2.toFixed(3)}</td>
                </tr>
            `;
            labels.push(`k=${item.k_h_Mpc.toFixed(3)}`);
            chartValues.push(item.residual_Pk);
        });
        yTitle = 'Residual P_k';
    }

    tableHead.innerHTML = headHtml;
    tableBody.innerHTML = bodyHtml;

    if (chartPerPointResiduals) {
        chartPerPointResiduals.data.labels = labels;
        chartPerPointResiduals.data.datasets[0].data = chartValues;
        chartPerPointResiduals.options.scales.y.title.text = yTitle;
        
        // Give dynamic color: red for negative, cyan for positive or general
        if (datasetType === 'sn') {
            chartPerPointResiduals.data.datasets[0].backgroundColor = 'rgba(255, 71, 87, 0.6)';
            chartPerPointResiduals.data.datasets[0].borderColor = '#ff4757';
            chartPerPointResiduals.data.datasets[0].label = 'Chi2 Contribution';
        } else {
            chartPerPointResiduals.data.datasets[0].backgroundColor = 'rgba(0, 210, 211, 0.6)';
            chartPerPointResiduals.data.datasets[0].borderColor = '#00d2d3';
            chartPerPointResiduals.data.datasets[0].label = 'Residual';
        }
        
        chartPerPointResiduals.update();
    }
}

async function populateRunsLists() {
    const runA = document.getElementById('select-run-a');
    const runB = document.getElementById('select-run-b');
    const btnCompare = document.getElementById('btn-compare-runs');
    if (!runA || !runB || !btnCompare) return;

    // Cache listener registration
    if (!btnCompare.dataset.listenerRegistered) {
        btnCompare.addEventListener('click', handleCompareRuns);
        btnCompare.dataset.listenerRegistered = 'true';

        const btnCopyRunCompare = document.getElementById('btn-copy-runcompare');
        if (btnCopyRunCompare) {
            btnCopyRunCompare.addEventListener('click', () => {
                const runAVal = document.getElementById('select-run-a').value;
                const runBVal = document.getElementById('select-run-b').value;
                const evidenceVal = document.getElementById('runcompare-evidence').textContent;
                const chi2Val = document.getElementById('runcompare-chi2').textContent;
                
                let markdown = `### Run-vs-Run Comparison Report\n`;
                markdown += `* **Run A (Baseline):** \`${runAVal}\`\n`;
                markdown += `* **Run B (Comparison):** \`${runBVal}\`\n`;
                markdown += `* **Delta log(Evidence):** \`${evidenceVal}\`\n`;
                markdown += `* **Delta Chi2 (Best Fit):** \`${chi2Val}\`\n\n`;
                
                markdown += `| Parameter | Run A (Mean±σ) | Run B (Mean±σ) | Shift (Δ) | Significance |\n`;
                markdown += `|---|---|---|---|---|\n`;
                
                const rows = document.querySelectorAll('#runcompare-table-body tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length === 5) {
                        const param = cells[0].textContent.trim();
                        const runA = cells[1].textContent.trim();
                        const runB = cells[2].textContent.trim();
                        const shift = cells[3].textContent.trim();
                        const sig = cells[4].textContent.trim();
                        markdown += `| ${param} | ${runA} | ${runB} | ${shift} | ${sig} |\n`;
                    }
                });
                
                copyToClipboard(markdown, 'btn-copy-runcompare');
            });
        }
    }

    try {
        const res = await fetch(`${API_URL}/api/runs/list`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success" && data.runs) {
                // Populate selectors
                const originalA = runA.value;
                const originalB = runB.value;

                runA.innerHTML = '';
                runB.innerHTML = '';

                data.runs.forEach(r => {
                    const displayName = r === 'lcdm_polychord' ? 'ΛCDM Baseline' : r.replace(/_/g, ' ').replace('polychord', 'PolyChord').replace('mcmc', 'MCMC');
                    const optA = document.createElement('option');
                    optA.value = r;
                    optA.textContent = displayName;
                    runA.appendChild(optA);

                    const optB = document.createElement('option');
                    optB.value = r;
                    optB.textContent = displayName;
                    runB.appendChild(optB);
                });

                // Re-select or select defaults
                if (originalA && data.runs.includes(originalA)) runA.value = originalA;
                else if (data.runs.length > 0) runA.value = data.runs[0];

                if (originalB && data.runs.includes(originalB)) runB.value = originalB;
                else if (data.runs.length > 1) runB.value = data.runs[1];
                else if (data.runs.length > 0) runB.value = data.runs[0];
            }
        }
    } catch (err) {
        console.error("Error populating runs lists:", err);
    }
}

async function handleCompareRuns() {
    const runAVal = document.getElementById('select-run-a').value;
    const runBVal = document.getElementById('select-run-b').value;
    const evidenceEl = document.getElementById('runcompare-evidence');
    const chi2El = document.getElementById('runcompare-chi2');
    const tableBody = document.getElementById('runcompare-table-body');
    
    if (!runAVal || !runBVal || !evidenceEl || !chi2El || !tableBody) return;

    const btnCopy = document.getElementById('btn-copy-runcompare');
    if (btnCopy) btnCopy.style.display = 'none';

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 12px; color: #a4b0be;">Analyzing and comparing runs...</td></tr>`;

    try {
        const response = await fetch(`${API_URL}/api/runs/compare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ run_a: runAVal, run_b: runBVal })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success") {
                // Update delta logEvidence
                if (data.delta_evidence !== null) {
                    const sign = data.delta_evidence >= 0 ? '+' : '';
                    evidenceEl.textContent = `${sign}${data.delta_evidence.toFixed(2)}`;
                    evidenceEl.style.color = data.delta_evidence >= 0 ? '#10ac84' : '#ff4757';
                } else {
                    evidenceEl.textContent = 'N/A';
                    evidenceEl.style.color = '#a4b0be';
                }

                // Update delta Chi2
                if (data.delta_chi2 !== null) {
                    const sign = data.delta_chi2 >= 0 ? '+' : '';
                    chi2El.textContent = `${sign}${data.delta_chi2.toFixed(1)}`;
                    chi2El.style.color = data.delta_chi2 <= 0 ? '#10ac84' : '#ff4757'; // Lower chi2 is better
                } else {
                    chi2El.textContent = 'N/A';
                    chi2El.style.color = '#a4b0be';
                }

                // Populate parameter shifts table
                let html = '';
                let labels = [];
                let nsigs = [];
                
                Object.entries(data.parameter_shifts).forEach(([param, details]) => {
                    const meanA = details.mean_a;
                    const errA = details.err_a;
                    const meanB = details.mean_b;
                    const errB = details.err_b;
                    const shift = details.shift;
                    const nsigma = details.nsigma;
                    
                    let sigColor = nsigma >= 3.0 ? '#ff4757' : (nsigma >= 1.0 ? '#feca57' : '#10ac84');
                    let shiftColor = shift >= 0 ? '#10ac84' : '#ff4757';

                    html += `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 6px; font-weight: bold; color: #ff9ff3;">${escHtml(String(param))}</td>
                            <td style="padding: 6px; font-family: var(--font-mono);">${meanA.toFixed(4)} &plusmn; ${errA.toFixed(4)}</td>
                            <td style="padding: 6px; font-family: var(--font-mono);">${meanB.toFixed(4)} &plusmn; ${errB.toFixed(4)}</td>
                            <td style="padding: 6px; font-family: var(--font-mono); color: ${shiftColor};">${shift >= 0 ? '+' : ''}${shift.toFixed(4)}</td>
                            <td style="padding: 6px; font-family: var(--font-mono); color: ${sigColor}; font-weight: bold;">${nsigma.toFixed(2)}&sigma;</td>
                        </tr>
                    `;
                    
                    labels.push(param);
                    nsigs.push(nsigma);
                });
                
                tableBody.innerHTML = html;
                const btnCopy = document.getElementById('btn-copy-runcompare');
                if (btnCopy) btnCopy.style.display = 'inline-block';

                // Update shifts chart
                if (chartRunCompareShifts) {
                    chartRunCompareShifts.data.labels = labels;
                    chartRunCompareShifts.data.datasets[0].data = nsigs;
                    chartRunCompareShifts.update();
                }
            }
        }
    } catch (err) {
        console.error("Error comparing runs:", err);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 12px; color: #ff4757;">Failed to compare runs.</td></tr>`;
    }
}

async function refreshProvenanceLedger() {
    const timeEl = document.getElementById('provenance-time');
    const classEl = document.getElementById('provenance-class-ver');
    const cobayaEl = document.getElementById('provenance-cobaya-ver');
    const polychordEl = document.getElementById('provenance-polychord-ver');
    const gitEl = document.getElementById('provenance-git-hash');
    const pyEl = document.getElementById('provenance-py-ver');
    const condaEl = document.getElementById('provenance-conda-env');
    const configEl = document.getElementById('provenance-config');
    const configHashEl = document.getElementById('provenance-config-hash');
    const compilerEl = document.getElementById('provenance-compiler');
    const machineEl = document.getElementById('provenance-machine');

    if (!timeEl || !classEl || !cobayaEl || !polychordEl || !gitEl || !pyEl || !condaEl || !configEl || !configHashEl || !compilerEl || !machineEl) return;

    try {
        const res = await fetch(`${API_URL}/api/provenance_ledger?config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success") {
                timeEl.textContent = data.timestamp;
                classEl.textContent = data.class_version;
                cobayaEl.textContent = data.cobaya_version;
                polychordEl.textContent = data.polychord_version;
                
                gitEl.textContent = data.git_hash !== 'N/A' ? data.git_hash.substring(0, 8) : 'N/A';
                if (data.git_hash !== 'N/A') {
                    gitEl.title = `Full Hash: ${data.git_hash}. Click to copy.`;
                    gitEl.onclick = () => {
                        copyToClipboard(data.git_hash, 'provenance-git-hash');
                    };
                }
                
                pyEl.textContent = data.python_version;
                condaEl.textContent = data.conda_environment;
                configEl.textContent = data.config_file;
                configHashEl.textContent = `SHA-256: ${data.config_hash}`;
                compilerEl.textContent = data.compiler_flags;
                
                const m = data.machine;
                machineEl.textContent = `${m.system} ${m.release} (${m.machine}) | ${m.cpu_cores} Cores | ${m.ram_gb} GB RAM`;
            }
        }
    } catch (err) {
        console.error("Error refreshing provenance ledger:", err);
    }
}

// --- Checkpoint & Backups Manager ---
async function refreshCheckpointsList() {
    const listContainer = document.getElementById('checkpoint-list-container');
    if (!listContainer) return;
    try {
        const response = await fetch(`${API_URL}/api/checkpoints/list`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && data.checkpoints) {
                if (data.checkpoints.length === 0) {
                    listContainer.innerHTML = '<div style="color: #a4b0be; text-align: center;">No checkpoints found.</div>';
                    return;
                }
                
                listContainer.innerHTML = '';
                data.checkpoints.forEach(cp => {
                    const pctText = cp.percentage !== null ? `${cp.percentage}%` : 'unknown %';
                    const deadText = cp.dead_points ? `${cp.dead_points} dead pts` : '';
                    const detail = `${pctText} (${deadText || 'no points'}) - ${cp.created_time}`;
                    
                    const itemDiv = document.createElement('div');
                    itemDiv.style.display = 'flex';
                    itemDiv.style.justifyContent = 'space-between';
                    itemDiv.style.alignItems = 'center';
                    itemDiv.style.padding = '6px 8px';
                    itemDiv.style.background = 'rgba(255,255,255,0.03)';
                    itemDiv.style.borderRadius = '4px';
                    itemDiv.style.border = '1px solid rgba(255,255,255,0.05)';
                    
                    const infoDiv = document.createElement('div');
                    infoDiv.style.display = 'flex';
                    infoDiv.style.flexDirection = 'column';
                    infoDiv.style.gap = '2px';
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.style.fontWeight = 'bold';
                    nameSpan.style.color = '#ff9ff3';
                    nameSpan.textContent = cp.name;
                    
                    const detailSpan = document.createElement('span');
                    detailSpan.style.fontSize = '0.7rem';
                    detailSpan.style.color = '#a4b0be';
                    detailSpan.textContent = detail;
                    
                    infoDiv.appendChild(nameSpan);
                    infoDiv.appendChild(detailSpan);
                    
                    const restoreBtn = document.createElement('button');
                    restoreBtn.className = 'btn btn-secondary btn-restore-checkpoint';
                    restoreBtn.dataset.checkpoint = cp.name;
                    restoreBtn.style.padding = '3px 8px';
                    restoreBtn.style.fontSize = '0.72rem';
                    restoreBtn.style.cursor = 'pointer';
                    restoreBtn.style.borderRadius = '3px';
                    restoreBtn.textContent = 'Restore';
                    
                    restoreBtn.addEventListener('click', () => {
                        restoreCheckpoint(cp.name);
                    });
                    
                    itemDiv.appendChild(infoDiv);
                    itemDiv.appendChild(restoreBtn);
                    listContainer.appendChild(itemDiv);
                });
            }
        }
    } catch (err) {
        console.error("Error listing checkpoints:", err);
    }
}

async function saveCheckpoint() {
    const nameInput = document.getElementById('checkpoint-name-input');
    const statusMsg = document.getElementById('checkpoint-status-msg');
    if (!nameInput || !statusMsg) return;
    
    const cpName = nameInput.value.trim();
    if (!cpName) {
        showCheckpointStatus("Please enter a checkpoint name.", "error");
        return;
    }
    
    showCheckpointStatus("Creating checkpoint...", "info");
    
    try {
        const response = await fetch(`${API_URL}/api/checkpoints/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: cpName,
                config_name: activeConfig
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            showCheckpointStatus(`Success: ${data.message}`, "success");
            nameInput.value = '';
            refreshCheckpointsList();
        } else {
            showCheckpointStatus(`Error: ${data.detail || 'Failed to create checkpoint'}`, "error");
        }
    } catch (err) {
        showCheckpointStatus(`Connection error: ${err.message}`, "error");
    }
}

async function restoreCheckpoint(name) {
    const statusMsg = document.getElementById('checkpoint-status-msg');
    if (!confirm(`Are you absolutely sure you want to restore checkpoint "${name}"? This will overwrite the current active run state configuration/chains!`)) {
        return;
    }
    
    showCheckpointStatus(`Restoring checkpoint "${name}"...`, "info");
    
    try {
        const response = await fetch(`${API_URL}/api/checkpoints/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                config_name: activeConfig
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            showCheckpointStatus(`Success: ${data.message}`, "success");
            appendLog(`[CHECKPOINT] RESTORED state backup "${name}". The run is ready to resume.`);
            alert(`Checkpoint "${name}" restored successfully. You can now start/resume the run!`);
        } else {
            let errMsg = data.detail;
            if (typeof data.detail === 'object' && data.detail.differences) {
                errMsg = `${data.detail.message}\n` + data.detail.differences.map(d => `• ${d}`).join('\n');
            }
            showCheckpointStatus(`Restore failed! Mismatch details shown in alert.`, "error");
            alert(`Restore Mismatch:\n${errMsg}`);
            appendLog(`[CHECKPOINT] Restore failed for "${name}". Mismatch in parameters/priors.`);
        }
    } catch (err) {
        showCheckpointStatus(`Connection error: ${err.message}`, "error");
    }
}

function showCheckpointStatus(msg, type) {
    const statusMsg = document.getElementById('checkpoint-status-msg');
    if (!statusMsg) return;
    statusMsg.textContent = msg;
    statusMsg.style.display = 'block';
    if (type === 'success') {
        statusMsg.style.background = 'rgba(46, 204, 113, 0.15)';
        statusMsg.style.color = '#2ecc71';
        statusMsg.style.border = '1px solid rgba(46, 204, 113, 0.3)';
    } else if (type === 'error') {
        statusMsg.style.background = 'rgba(231, 76, 60, 0.15)';
        statusMsg.style.color = '#e74c3c';
        statusMsg.style.border = '1px solid rgba(231, 76, 60, 0.3)';
    } else {
        statusMsg.style.background = 'rgba(52, 152, 219, 0.15)';
        statusMsg.style.color = '#3498db';
        statusMsg.style.border = '1px solid rgba(52, 152, 219, 0.3)';
    }
}

// --- Dashboard & CLASS Error Log Viewer ---
async function refreshErrorLog() {
    const errorBody = document.getElementById('error-log-body');
    if (!errorBody) return;
    
    try {
        const response = await fetch(`${API_URL}/api/dashboard_errors`);
        if (response.ok) {
            const data = await response.json();
            if (data.status === "success" && data.errors) {
                if (data.errors.length === 0) {
                    errorBody.innerHTML = 'No errors logged yet. System is stable.';
                    errorBody.style.color = '#2ecc71';
                    return;
                }
                
                // Render each error with an acknowledge button
                errorBody.innerHTML = '';
                errorBody.style.color = '#ff6b6b';
                
                data.errors.forEach(err => {
                    const item = document.createElement('div');
                    item.className = 'error-item';
                    item.style.display = 'flex';
                    item.style.justifyContent = 'space-between';
                    item.style.alignItems = 'flex-start';
                    item.style.padding = '6px 8px';
                    item.style.marginBottom = '6px';
                    item.style.background = 'rgba(255, 107, 107, 0.04)';
                    item.style.borderLeft = '3px solid #ff4757';
                    item.style.borderRadius = '4px';
                    
                    const textSpan = document.createElement('span');
                    textSpan.style.flex = '1';
                    textSpan.style.marginRight = '8px';
                    textSpan.innerText = err.text;
                    
                    const ackBtn = document.createElement('button');
                    ackBtn.innerHTML = '✕';
                    ackBtn.title = 'Acknowledge & Remove';
                    ackBtn.style.background = 'none';
                    ackBtn.style.border = 'none';
                    ackBtn.style.color = '#ff4757';
                    ackBtn.style.cursor = 'pointer';
                    ackBtn.style.fontSize = '0.85rem';
                    ackBtn.style.fontWeight = 'bold';
                    ackBtn.style.padding = '0 4px';
                    
                    ackBtn.addEventListener('click', () => {
                        acknowledgeError(err.index);
                    });
                    
                    item.appendChild(textSpan);
                    item.appendChild(ackBtn);
                    errorBody.appendChild(item);
                });
            }
        }
    } catch (err) {
        console.error("Error fetching error logs:", err);
    }
}

async function acknowledgeError(index) {
    try {
        const response = await fetch(`${API_URL}/api/acknowledge_error`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error_index: index })
        });
        if (response.ok) {
            appendLog(`[ERRORS] Error acknowledged.`);
            refreshErrorLog();
        }
    } catch (err) {
        console.error("Error acknowledging error:", err);
    }
}

async function clearErrorLog() {
    showConfirmationModal(
        "Clear Error Log",
        "Are you sure you want to clear the entire error log? This action cannot be undone.",
        "Clear Log",
        "Cancel",
        async () => {
            try {
                const response = await fetch(`${API_URL}/api/clear_dashboard_errors`, {
                    method: 'POST'
                });
                if (response.ok) {
                    appendLog(`[ERRORS] Error log cleared successfully.`);
                    refreshErrorLog();
                }
            } catch (err) {
                console.error("Error clearing error logs:", err);
            }
        }
    );
}

function showConfirmationModal(title, message, confirmText, cancelText, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const box = document.createElement('div');
    box.className = 'modal-box';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.innerHTML = `⚠️ ${title}`;
    
    const bodyEl = document.createElement('div');
    bodyEl.className = 'modal-body';
    bodyEl.style.color = '#a4b0be';
    bodyEl.style.fontSize = '0.95rem';
    bodyEl.style.lineHeight = '1.5';
    bodyEl.style.textAlign = 'center';
    bodyEl.innerText = message;
    
    const buttonsEl = document.createElement('div');
    buttonsEl.className = 'modal-buttons';
    buttonsEl.style.display = 'flex';
    buttonsEl.style.gap = '10px';
    buttonsEl.style.justifyContent = 'center';
    buttonsEl.style.marginTop = '10px';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn modal-btn-cancel';
    cancelBtn.innerText = cancelText || 'Cancel';
    cancelBtn.style.flex = '1';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn modal-btn-confirm';
    confirmBtn.innerText = confirmText || 'Confirm';
    confirmBtn.style.flex = '1';
    confirmBtn.style.background = 'linear-gradient(135deg, #ff4757, #ff6b81)';
    confirmBtn.style.border = 'none';
    confirmBtn.style.color = '#fff';
    confirmBtn.style.fontWeight = 'bold';
    
    buttonsEl.appendChild(cancelBtn);
    buttonsEl.appendChild(confirmBtn);
    
    box.appendChild(titleEl);
    box.appendChild(bodyEl);
    box.appendChild(buttonsEl);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    setTimeout(() => {
        overlay.classList.add('active');
    }, 10);
    
    const closeModal = () => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    };
    
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    
    confirmBtn.addEventListener('click', () => {
        closeModal();
        onConfirm();
    });
}

// Show first-time researcher request popup for PRTOE model
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('prtoe_proposal_shown')) {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInModal {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);

        const modal = document.createElement('div');
        modal.id = 'prtoe-proposal-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100vw';
        modal.style.height = '100vh';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        modal.style.backdropFilter = 'blur(10px)';
        modal.style.zIndex = '99999';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        
        const content = document.createElement('div');
        content.style.width = '90%';
        content.style.maxWidth = '550px';
        content.style.background = 'rgba(20, 20, 25, 0.75)';
        content.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        content.style.borderRadius = '12px';
        content.style.padding = '30px';
        content.style.boxShadow = '0 8px 32px 0 rgba(0, 0, 0, 0.5)';
        content.style.color = '#fff';
        content.style.fontFamily = "'Outfit', 'Inter', sans-serif";
        content.style.textAlign = 'center';
        content.style.animation = 'fadeInModal 0.3s ease-out';
        
        content.innerHTML = `
            <div style="font-size: 3rem; margin-bottom: 15px;">🌌</div>
            <h2 style="margin-top: 0; color: #ff9ff3; font-weight: 700; font-size: 1.5rem; letter-spacing: 0.5px;">Welcome to CosmicDashboard</h2>
            <h3 style="color: #00d2d3; font-size: 1.1rem; margin-top: 5px; margin-bottom: 20px;">A Special Request for Cosmology Researchers</h3>
            <p style="font-size: 0.95rem; line-height: 1.6; color: #dcdde1; margin-bottom: 20px;">
                You are running the modified CLASS engine equipped with the <strong>PRTOE (Pulford-Romsa Theory of Everything)</strong> cosmology model. 
            </p>
            <p style="font-size: 0.95rem; line-height: 1.6; color: #dcdde1; margin-bottom: 25px;">
                If you have some free time, we would be incredibly grateful if you could run the PRTOE model configurations and evaluate their fits, comparing the resulting Bayesian evidence ($\Delta\ln\mathcal{Z}$), parameter pulls, and growth constraints against standard $\Lambda\text{CDM}$. Your test runs and feedback are highly valuable in determining if this model represents a path worth exploring further in modern cosmology.
            </p>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="btn-close-proposal" class="btn" style="padding: 10px 24px; font-weight: bold; background: linear-gradient(135deg, #00d2d3, #00a8ff); border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 0.9rem; box-shadow: 0 4px 15px rgba(0, 210, 211, 0.4);">I will help test PRTOE</button>
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        document.getElementById('btn-close-proposal').addEventListener('click', () => {
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            setTimeout(() => {
                modal.remove();
                localStorage.setItem('prtoe_proposal_shown', 'true');
            }, 300);
        });
    }
});

let intergalacticPlaying = false;

async function checkIntergalacticTrigger() {
    // Only check if we haven't played it yet
    if (localStorage.getItem('intergalacticPlayed') === 'true' || intergalacticPlaying) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/compare_models`);
        if (!response.ok) return;
        const data = await response.json();
        if (data && data.models) {
            const lcdm = data.models.find(m => m.prefix === 'lcdm_polychord');
            const prtoe = data.models.find(m => m.prefix === 'prtoe_polychord');
            
            // Check if both have completed (logz is not null and is a valid number)
            if (lcdm && prtoe && lcdm.logz !== null && prtoe.logz !== null) {
                const logz_lcdm = parseFloat(lcdm.logz);
                const logz_prtoe = parseFloat(prtoe.logz);
                const delta_logz = logz_prtoe - logz_lcdm;
                
                if (delta_logz >= 5.0) {
                    intergalacticPlaying = true;
                    localStorage.setItem('intergalacticPlayed', 'true');
                    appendLog("<span style='color: #ff9ff3; font-weight: bold;'>🌌 [CELEBRATION] PRTOE has strong evidence (ΔlogZ = " + delta_logz.toFixed(2) + " >= 5)! Playing Beastie Boys: Intergalactic! 🚀</span>", { html: true });
                    playIntergalacticSynth();
                }
            }
        }
    } catch (err) {
        console.error("Error checking intergalactic trigger:", err);
    }
}

function playIntergalacticSynth() {
    // Play the FULL "Intergalactic" by Beastie Boys from YouTube (embedded audio)
    // Using a reliable YouTube embed that allows autoplay
    
    try {
        // Check if user has opted in to third-party YouTube autoplay
        const youtubeOptIn = localStorage.getItem('youtubeAutoplayOptIn') === 'true';
        
        if (!youtubeOptIn) {
            // Use local synth only if user hasn't opted in to YouTube
            if ('speechSynthesis' in window) {
                const u = new SpeechSynthesisUtterance("Intergalactic, planetary, planetary, intergalactic.");
                u.pitch = 0.5;
                u.rate = 0.82;
                window.speechSynthesis.speak(u);
            }
            appendLog("<span style='color: #ff9ff3; font-weight: bold;'>🎵 Celebration! Enable YouTube autoplay in settings for full song 🎵</span>", { html: true });
            setTimeout(() => {
                intergalacticPlaying = false;
                appendLog("<span style='color: #00d2ff;'>🌌 Celebration complete! 🌌</span>", { html: true });
            }, 5000);
            return;
        }
        
        // Create an audio element with the full song
        const audio = new Audio();
        
        // Using a direct audio source - YouTube Music/Spotify embed or direct MP3
        // Option 1: Try to use YouTube's audio (may have restrictions)
        // Option 2: Use a reliable music streaming embed
        
        // Create a hidden iframe to play the full song from YouTube
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.allow = 'autoplay; encrypted-media';
        iframe.src = 'https://www.youtube.com/embed/qORYO0atB6g?autoplay=1&mute=0&start=0';
        document.body.appendChild(iframe);
        
        // Show a celebration message with song info
        appendLog("<span style='color: #ff9ff3; font-weight: bold;'>🎵 Now playing: Beastie Boys - Intergalactic (Full Song) 🎵</span>", { html: true });
        
        // Also play the vocoder voice for extra effect at the start
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance("Intergalactic, planetary, planetary, intergalactic.");
            u.pitch = 0.5;
            u.rate = 0.82;
            window.speechSynthesis.speak(u);
        }
        
        // Clean up after song duration (approximately 3:51 = 231 seconds)
        setTimeout(() => {
            if (iframe && iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
            intergalacticPlaying = false;
            appendLog("<span style='color: #00d2ff;'>🌌 Celebration complete! 🌌</span>", { html: true });
        }, 235000); // 235 seconds to ensure full song plays
        
    } catch (e) {
        console.error("Failed to play Intergalactic:", e);
        
        // Fallback to the original synth version if YouTube embed fails
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance("Intergalactic, planetary, planetary, intergalactic.");
            u.pitch = 0.5;
            u.rate = 0.82;
            window.speechSynthesis.speak(u);
        }
        
        // Play synth slides as backup
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const ctx = new AudioContext();
                const now = ctx.currentTime;
                
                const playSynthSlide = (startTime, duration, startFreq, endFreq) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const filter = ctx.createBiquadFilter();
                    
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(startFreq, startTime);
                    osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
                    
                    filter.type = 'bandpass';
                    filter.frequency.setValueAtTime(startFreq * 1.4, startTime);
                    filter.frequency.exponentialRampToValueAtTime(endFreq * 1.4, startTime + duration);
                    
                    gain.gain.setValueAtTime(0.12, startTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                    
                    osc.connect(filter);
                    filter.connect(gain);
                    gain.connect(ctx.destination);
                    
                    osc.start(startTime);
                    osc.stop(startTime + duration);
                };
                
                playSynthSlide(now, 0.9, 160, 480);
                playSynthSlide(now + 0.9, 0.9, 480, 220);
                playSynthSlide(now + 1.8, 0.9, 220, 640);
                playSynthSlide(now + 2.7, 1.4, 640, 110);
            }
        } catch (synthError) {
            console.error("Synth fallback also failed:", synthError);
        }
        
        intergalacticPlaying = false;
    }
}

// --- Simple in-app Login Modal for "remember me" flow (replaces repeated browser Basic Auth prompts)
// Called when API returns 401. Posts to /api/login which sets httpOnly cookie.
// === MCMC Diagnostics & Mode Metadata Rendering ===

async function fetchMcmcDiagnostics() {
    const diagCard = document.getElementById('mcmc-diagnostics-card');
    const diagBody = document.getElementById('mcmc-diagnostics-body');
    if (!diagCard || !diagBody) return;
    
    try {
        // Pass output_prefix so backend finds data even when state.active_output_prefix
        // is empty (e.g. optimizer was launched manually, not via dashboard Start button)
        // Fall back to the known running prefix if not in status data.
        const _cfPrefix = (typeof lastStatusData !== 'undefined' && lastStatusData && lastStatusData.active_output_prefix)
            ? lastStatusData.active_output_prefix
            : (typeof lastStatusData !== 'undefined' && lastStatusData && lastStatusData.is_optimizer ? null : 'chains/prtoe_poly');
        const _cfQ = _cfPrefix ? `?output_prefix=${encodeURIComponent(_cfPrefix)}` : '';
        const response = await fetch(`${API_URL}/api/run_summary${_cfQ}`, { credentials: 'include' });
        if (!response.ok) {
            diagCard.style.display = 'none';
            return;
        }
        const data = await response.json();
        
        if (!data.modes || data.modes.length === 0) {
            diagCard.style.display = 'none';
            return;
        }
        
        // Check if any mode has MCMC diagnostics
        const hasMcmcData = data.modes.some(m => m.mcmc_diagnostics && Object.keys(m.mcmc_diagnostics).length > 0);
        if (!hasMcmcData) {
            diagCard.style.display = 'none';
            return;
        }
        
        diagCard.style.display = 'block';
        let html = '<div style="overflow-x: auto; font-size: 0.75rem; line-height: 1.4;">';
        
        data.modes.forEach((mode, idx) => {
            if (!mode.mcmc_diagnostics) return;
            
            const diag = mode.mcmc_diagnostics;
            html += `<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <div style="color: #00d2d3; font-weight: bold; margin-bottom: 6px;">Mode ${idx + 1}: ${escHtml(mode.name || 'Unnamed')}</div>`;
            
            // Overall diagnostics
            if (diag.acceptance_rate !== undefined) {
                const accRate = parseFloat(diag.acceptance_rate) * 100;
                let accColor = accRate >= 25 && accRate <= 50 ? '#10ac84' : '#ff9f43';
                html += `<div>Acceptance Rate: <span style="color: ${accColor}; font-weight: bold;">${accRate.toFixed(1)}%</span></div>`;
            }
            
            if (diag.chain_length !== undefined) {
                html += `<div>Chain Length: <span style="color: #3498db; font-weight: bold;">${diag.chain_length.toLocaleString()}</span></div>`;
            }
            
            // Per-parameter ESS and R̂
            if (diag.ess_per_param || diag.rhat_per_param) {
                html += `<div style="margin-top: 6px; margin-bottom: 4px; color: #a4b0be; font-size: 0.7rem; text-transform: uppercase;">Per-Parameter Diagnostics:</div>`;
                html += `<table style="width: 100%; border-collapse: collapse; font-size: 0.7rem;">
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.08); color: #a4b0be;">
                        <th style="text-align: left; padding: 2px 4px;">Parameter</th>
                        <th style="text-align: right; padding: 2px 4px;">ESS</th>
                        <th style="text-align: right; padding: 2px 4px;">R̂</th>
                    </tr>`;
                
                const paramNames = Object.keys(diag.ess_per_param || {});
                paramNames.forEach(param => {
                    const ess = diag.ess_per_param ? diag.ess_per_param[param] : '-';
                    const rhat = diag.rhat_per_param ? diag.rhat_per_param[param] : '-';
                    
                    let essColor = '#a4b0be';
                    let rhatColor = '#a4b0be';
                    
                    if (typeof ess === 'number') {
                        essColor = ess >= 100 ? '#10ac84' : '#ff9f43';
                    }
                    if (typeof rhat === 'number') {
                        rhatColor = rhat < 1.05 ? '#10ac84' : '#ee5253';
                    }
                    
                    html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 2px 4px; color: #a4b0be;">${escHtml(param)}</td>
                        <td style="text-align: right; padding: 2px 4px; color: ${essColor}; font-weight: bold;">${typeof ess === 'number' ? ess.toFixed(0) : ess}</td>
                        <td style="text-align: right; padding: 2px 4px; color: ${rhatColor}; font-weight: bold;">${typeof rhat === 'number' ? rhat.toFixed(4) : rhat}</td>
                    </tr>`;
                });
                
                html += `</table>`;
            }
            
            html += `</div>`;
        });
        
        html += '</div>';
        diagBody.innerHTML = html;
        
    } catch (err) {
        console.error("Error fetching MCMC diagnostics:", err);
        diagCard.style.display = 'none';
    }
}

async function fetchModeMetadata() {
    const metaCard = document.getElementById('mode-metadata-card');
    const metaBody = document.getElementById('mode-metadata-body');
    const surrogatCard = document.getElementById('surrogate-usage-card');
    const surrogateBody = document.getElementById('surrogate-usage-body');
    
    if (!metaCard || !metaBody) return;
    
    try {
        const _cfPrefix2 = (typeof lastStatusData !== 'undefined' && lastStatusData && lastStatusData.active_output_prefix)
            ? lastStatusData.active_output_prefix
            : 'chains/prtoe_poly';
        const _cfQ2 = _cfPrefix2 ? `?output_prefix=${encodeURIComponent(_cfPrefix2)}` : '';
        const response = await fetch(`${API_URL}/api/run_summary${_cfQ2}`, { credentials: 'include' });
        if (!response.ok) {
            metaCard.style.display = 'none';
            if (surrogatCard) surrogatCard.style.display = 'none';
            return;
        }
        const data = await response.json();
        
        if (!data.modes || data.modes.length === 0) {
            metaCard.style.display = 'none';
            if (surrogatCard) surrogatCard.style.display = 'none';
            return;
        }
        
        metaCard.style.display = 'block';
        let html = `<table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.15);">
                    <th style="padding: 6px; color: #00d2d3; text-align: left; font-size: 0.75rem;">Mode</th>
                    <th style="padding: 6px; color: #10ac84; text-align: center; font-size: 0.75rem;">Viability %</th>
                    <th style="padding: 6px; color: #00d2d3; text-align: center; font-size: 0.75rem;">Stability</th>
                    <th style="padding: 6px; color: #f1c40f; text-align: center; font-size: 0.75rem;">Surrogate Hit %</th>
                </tr>
            </thead>
            <tbody>`;
        
        let totalEvals = 0;
        let totalSurrogateEvals = 0;
        
        data.modes.forEach((mode, idx) => {
            const viability = mode.viability_score !== undefined ? parseFloat(mode.viability_score).toFixed(1) : '-';
            const stability = mode.stability !== undefined && mode.stability !== null ? mode.stability : '-';
            const surrogateHitRate = mode.surrogate_hit_rate !== undefined ? (parseFloat(mode.surrogate_hit_rate) * 100).toFixed(1) : '-';
            
            let viabilityColor = viability !== '-' && parseFloat(viability) >= 95 ? '#10ac84' : '#ee5253';
            let surrogateColor = surrogateHitRate !== '-' && parseFloat(surrogateHitRate) > 0 ? '#f1c40f' : '#a4b0be';
            
            html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02);">
                <td style="padding: 6px; color: #a4b0be; font-weight: 500;">${escHtml(mode.name || `Mode ${idx + 1}`)}</td>
                <td style="padding: 6px; text-align: center; color: ${viabilityColor}; font-weight: bold;">${viability}</td>
                <td style="padding: 6px; text-align: center; color: #00d2d3; font-weight: bold;">${escHtml(String(stability))}</td>
                <td style="padding: 6px; text-align: center; color: ${surrogateColor}; font-weight: bold;">${surrogateHitRate}</td>
            </tr>`;
            
            // Track surrogate stats
            if (mode.surrogate_evaluations !== undefined && mode.total_evaluations !== undefined) {
                totalEvals += mode.total_evaluations;
                totalSurrogateEvals += mode.surrogate_evaluations;
            }
        });
        
        html += `</tbody></table>`;
        metaBody.innerHTML = html;
        
        // Update surrogate usage card
        if (surrogatCard && surrogateBody) {
            if (totalEvals > 0) {
                surrogatCard.style.display = 'block';
                const globalRate = ((totalSurrogateEvals / totalEvals) * 100).toFixed(1);
                let surrogateHtml = `<div style="color: #a4b0be;">`;
                surrogateHtml += `<div>Total Evaluations Bypassed: <span id="surrogate-total-evals" style="color: #00d2d3; font-weight: bold;">${totalSurrogateEvals.toLocaleString()}</span></div>`;
                surrogateHtml += `<div>Global Hit Rate: <span id="surrogate-global-rate" style="color: #ff9f43; font-weight: bold;">${globalRate}%</span></div>`;
                surrogateHtml += `<div style="margin-top: 6px; font-size: 0.75rem; color: #888; line-height: 1.4;">`;
                surrogateHtml += `Note: Surrogate is disabled during MCMC/evidence phases to prevent bias in posterior estimation.`;
                surrogateHtml += `</div></div>`;
                surrogateBody.innerHTML = surrogateHtml;
            } else {
                surrogatCard.style.display = 'none';
            }
        }
        
    } catch (err) {
        console.error("Error fetching mode metadata:", err);
        metaCard.style.display = 'none';
        if (surrogatCard) surrogatCard.style.display = 'none';
    }
}

let loginModal = null;

function showLoginModal(onSuccess) {
    if (loginModal) loginModal.remove();
    loginModal = document.createElement('div');
    loginModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    loginModal.innerHTML = `
        <div style="background: var(--bg-panel, rgba(13,13,18,0.95)); color: #fff; padding: 28px; border-radius: 16px; max-width: 360px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.6), 0 0 30px rgba(0,210,255,0.1); border: 1px solid var(--border-glass, rgba(255,255,255,0.08)); backdrop-filter: blur(12px); font-family: var(--font-sans, 'Outfit', sans-serif);">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                <span style="font-size:1.4rem;">🔐</span>
                <h3 style="margin:0; color:#00d2d3; font-size:1.3rem; font-weight:600;">CosmicDashboard</h3>
            </div>
            <p style="font-size:0.82rem; color:#9ea0b0; margin:0 0 14px;">Enter credentials. "Remember me" keeps you logged in for 30 days via secure cookie (no more browser popups).</p>
            <input id="login-user" type="text" placeholder="Username" value="admin" style="width:100%; padding:10px; margin-bottom:8px; background:rgba(255,255,255,0.06); color:#fff; border:1px solid var(--border-glass,rgba(255,255,255,0.1)); border-radius:8px; font-family:var(--font-mono,'JetBrains Mono',monospace);">
            <input id="login-pass" type="password" placeholder="Password" style="width:100%; padding:10px; margin-bottom:10px; background:rgba(255,255,255,0.06); color:#fff; border:1px solid var(--border-glass,rgba(255,255,255,0.1)); border-radius:8px; font-family:var(--font-mono,'JetBrains Mono',monospace);">
            <label style="display:flex; align-items:center; gap:6px; margin-bottom:14px; font-size:0.82rem; color:#9ea0b0; cursor:pointer;">
                <input id="login-remember" type="checkbox" checked style="accent-color:#00d2d3;"> Remember me (30 days)
            </label>
            <div style="display:flex; gap:8px;">
                <button id="login-btn" style="flex:1; background:#39ff14; color:#000; padding:10px; border:none; border-radius:8px; font-weight:600; cursor:pointer; font-family:var(--font-sans);">Login</button>
                <button id="login-cancel" style="flex:1; background:rgba(255,255,255,0.06); color:#ccc; padding:10px; border:1px solid var(--border-glass); border-radius:8px; cursor:pointer;">Cancel</button>
            </div>
            <div id="login-error" style="color:#ff007f; margin-top:10px; font-size:0.78rem; display:none;"></div>
        </div>
    `;
    document.body.appendChild(loginModal);

    const userIn = loginModal.querySelector('#login-user');
    const passIn = loginModal.querySelector('#login-pass');
    const remIn = loginModal.querySelector('#login-remember');
    const errEl = loginModal.querySelector('#login-error');
    const btn = loginModal.querySelector('#login-btn');
    const cancel = loginModal.querySelector('#login-cancel');

    function doLogin() {
        const u = userIn.value.trim();
        const p = passIn.value;
        const rem = remIn.checked;
        if (!u || !p) {
            errEl.textContent = 'Username and password required.';
            errEl.style.display = 'block';
            return;
        }
        btn.disabled = true;
        fetch(`${API_URL}/api/login`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username: u, password: p, remember_me: rem})
        }).then(r => r.json()).then(data => {
            if (data.status === 'success') {
                loginModal.remove();
                loginModal = null;
                const logoutBtn = document.getElementById('btn-logout');
                const manualLoginBtn = document.getElementById('btn-manual-login');
                if (logoutBtn) logoutBtn.style.display = 'inline-flex';
                if (manualLoginBtn) manualLoginBtn.style.display = 'none';
                if (typeof onSuccess === 'function') onSuccess();
                else location.reload();  // safe refresh to pick up cookie for all calls
            } else {
                errEl.textContent = data.detail || 'Login failed.';
                errEl.style.display = 'block';
            }
        }).catch(e => {
            errEl.textContent = 'Network error: ' + e.message;
            errEl.style.display = 'block';
        }).finally(() => btn.disabled = false);
    }

    btn.onclick = doLogin;
    passIn.onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
    cancel.onclick = () => { loginModal.remove(); loginModal = null; };
    // focus pass
    setTimeout(() => passIn.focus(), 100);
}

// Expose for manual testing from console if needed
window.showCosmicLogin = showLoginModal;
