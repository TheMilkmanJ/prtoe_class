const API_URL = window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin;
let statusInterval = null;
let activeConfig = 'lcdm_config.yaml';
let lastStatusData = null;
let baselineBestChi2 = null;
let baselineLogEvidence = null;

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
const btnResume = document.getElementById('btn-resume');
const btnStop = document.getElementById('btn-stop');
const btnDownload = document.getElementById('btn-download');

const statDead = document.getElementById('stat-dead');
const statEvidence = document.getElementById('stat-evidence');
const statChi2 = document.getElementById('stat-chi2');
const statChi2Cmb = document.getElementById('stat-chi2-cmb');
const statChi2Bao = document.getElementById('stat-chi2-bao');
const statChi2Sn = document.getElementById('stat-chi2-sn');
const statRawParams = document.getElementById('stat-raw-params');
const statCpu = document.getElementById('stat-cpu');
const cpuGaugePath = document.getElementById('cpu-gauge-path');
const progressFill = document.getElementById('progress-fill');
const progressPercent = document.getElementById('progress-percent');
const consoleBody = document.getElementById('console-body');

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

let localLogs = ['Waiting for run execution...'];
let lastTerminalLogs = [];
let plotCheckCounter = 0;

const plotContainer = document.getElementById('live-plot-container');
const plotImg = document.getElementById('live-plot-img');
const plotTimestamp = document.getElementById('plot-timestamp');

const valBaseline = document.getElementById('val-baseline');
const valCustom = document.getElementById('val-custom');
const valDelta = document.getElementById('val-delta');

const jeffreysCard = document.getElementById('jeffreys-card');
const jeffreysText = document.getElementById('jeffreys-text');
const jeffreysDesc = document.getElementById('jeffreys-desc');

const watchdogCard = document.getElementById('watchdog-card');
const watchdogText = document.getElementById('watchdog-text');
const watchdogDesc = document.getElementById('watchdog-desc');
const watchdogIcon = document.getElementById('watchdog-icon');

const inputCores = document.getElementById('input-cores');
const checkAutoRebuild = document.getElementById('check-autorebuild');
const checkAutoRunLcdm = document.getElementById('check-autorun-lcdm');

let currentProposedUpdates = {};
let watchdogIgnored = false; // Flag to temporarily ignore watchdog
let lastWatchdogAlertCount = 0; // Track watchdog alert count for audio alerts

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    fetchBaselines();
    checkStatus();
    statusInterval = setInterval(checkStatus, 3000);
    fetchSysInfo();
    
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
                }
            }, 50);
        });
    });

    // Initialize blank charts
    initCharts();

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
        btnStagRecover.addEventListener('click', () => handleSamplerRecovery(0.20, 2.0));
    }
    const btnManualRecover = document.getElementById('btn-manual-recover');
    if (btnManualRecover) {
        btnManualRecover.addEventListener('click', () => handleSamplerRecovery(0.20, 2.0));
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
            window.location.href = `${API_URL}/api/download_reproducibility_pack?config_name=${encodeURIComponent(activeConfig)}`;
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
});

function switchToLcdm() {
    activeConfig = 'lcdm_config.yaml';
    yamlName.textContent = 'Default: lcdm_config.yaml';
    yamlName.classList.remove('active');
    yamlInput.value = '';
    appendLog(`Reverted to default ΛCDM configuration: lcdm_config.yaml`);
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

// File Upload Zones
setupUploadZone(yamlZone, yamlInput, handleYamlUpload);

function setupUploadZone(zone, input, handler) {
    zone.addEventListener('click', () => {
        input.value = ''; // Reset value to force 'change' event even for the same file
        input.click();
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
    yamlName.textContent = file.name;
    yamlName.classList.add('active');
    appendLog(`Selected configuration: ${file.name}`);
    
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
            appendLog(`Configuration uploaded successfully. Config loaded.`);
            activeConfig = 'uploaded_config.yaml';
        } else {
            appendLog(`Upload failed: ${data.detail}`);
        }
    } catch (err) {
        appendLog(`Upload error: ${err.message}`);
    }
}

// Start Run
btnStart.addEventListener('click', () => triggerRun(true));
btnResume.addEventListener('click', () => triggerRun(false));

async function triggerRun(forceOverwrite) {
    btnStart.disabled = true;
    btnResume.disabled = true;
    const cores = inputCores ? (parseInt(inputCores.value) || 24) : 24;
    
    // Only auto-rebuild if it's checked AND we are starting fresh. We shouldn't rebuild mid-resume.
    const autoRebuild = (checkAutoRebuild && checkAutoRebuild.checked && forceOverwrite);
    
    if (autoRebuild) {
        appendLog(`[CLASS ENGINE] Auto-rebuilding before run using ${cores} cores...`);
    } else {
        appendLog(`[CLASS ENGINE] Auto-rebuild disabled. Resuming previous run if available...`);
    }
    appendLog(`Starting PolyChord nested sampling on ${cores} cores with config: ${activeConfig}...`);
    
    try {
        const response = await fetch(`${API_URL}/api/start_run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                config_name: activeConfig,
                cores: cores,
                auto_rebuild: autoRebuild,
                force_overwrite: forceOverwrite
            })
        });
        const data = await response.json();
        if (response.ok) {
            appendLog(`Process started in background. PID: ${data.pid}`);
            if (autoRebuild) fetchSysInfo(); // Update engine badge
            checkStatus();
        } else {
            appendLog(`Failed to start: ${data.detail}`);
            btnStart.disabled = false;
            btnResume.disabled = false;
        }
    } catch (err) {
        appendLog(`Execution error: ${err.message}`);
        btnStart.disabled = false;
        btnResume.disabled = false;
    }
}

// Stop Run
btnStop.addEventListener('click', async () => {
    btnStop.disabled = true;
    appendLog('Sending termination signal to sampler process group...');
    
    try {
        const response = await fetch(`${API_URL}/api/stop_run`, {
            method: 'POST'
        });
        const data = await response.json();
        if (response.ok) {
            appendLog('Process group stopped successfully.');
            checkStatus();
        } else {
            appendLog(`Failed to stop process: ${data.detail}`);
            btnStop.disabled = false;
        }
    } catch (err) {
        appendLog(`Abort error: ${err.message}`);
        btnStop.disabled = false;
    }
});

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
async function updateBaseline(dataset, evidence, chi2) {
    try {
        const response = await fetch(`${API_URL}/api/update_baseline`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset: dataset, log_evidence: evidence, best_chi2: chi2 })
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
        const response = await fetch(`${API_URL}/api/status`);
        if (!response.ok) return;
        const data = await response.json();
        lastStatusData = data;
        
        // Append external logs (from monitor script)
        if (data.external_logs && data.external_logs.length > 0) {
            data.external_logs.forEach(log => appendLog(`<span style="color: #ff4757; font-weight: bold;">[ALERT] ${log}</span>`));
        }
        
        if (data.terminal_output && data.terminal_output.length > 0) {
            lastTerminalLogs = data.terminal_output;
        } else if (data.status === 'idle') {
            lastTerminalLogs = [];
        }
        renderLogs();
        
        // Update status indicator
        updateStatusIndicator(data.status);
        
        // Update stats
        statDead.textContent = data.dead_points;
        if (data.log_evidence !== null) {
            statEvidence.textContent = `${data.log_evidence.toFixed(2)} +/- ${data.log_evidence_error.toFixed(2)}`;
            valCustom.textContent = data.log_evidence.toFixed(4);
            calculateEvidence(data.log_evidence);
        } else {
            statEvidence.textContent = "-";
            valCustom.textContent = "-";
        }
        
        if (data.best_chi2 !== null && data.best_chi2 !== undefined) {
            statChi2.textContent = data.best_chi2.toFixed(2);
            if (data.best_cmb !== null && data.best_cmb !== undefined) {
                statChi2Cmb.textContent = data.best_cmb.toFixed(1);
                statChi2Bao.textContent = data.best_bao.toFixed(1);
                statChi2Sn.textContent = data.best_sn.toFixed(1);
            }
        } else {
            statChi2.textContent = "-";
            statChi2Cmb.textContent = "-";
            statChi2Bao.textContent = "-";
            statChi2Sn.textContent = "-";
        }
        
        if (data.best_raw_params) {
            statRawParams.style.display = 'block';
            let rawHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">';
            for (const [key, val] of Object.entries(data.best_raw_params)) {
                if (!key.startsWith('chi2__') && !key.startsWith('minuslogprior')) {
                    let formattedVal = (typeof val === 'number') ? val.toPrecision(4) : val;
                    rawHtml += `<div><span style="color:#00d2d3">${key}</span>: ${formattedVal}</div>`;
                }
            }
            rawHtml += '</div>';
            statRawParams.innerHTML = rawHtml;
        } else {
            statRawParams.style.display = 'none';
        }
        
        // Update CPU Speedometer Gauge
        if (data.cpu_percent !== undefined) {
            statCpu.textContent = `${Math.round(data.cpu_percent)}%`;
            // Calculate dashoffset for the SVG arc (125.66 is a full half-circle)
            const offset = 125.66 - (data.cpu_percent / 100) * 125.66;
            cpuGaugePath.style.strokeDashoffset = offset;
            
            if (data.cpu_percent > 85) {
                cpuGaugePath.style.stroke = '#ff007f'; // neon-magenta (redlined)
            } else if (data.cpu_percent > 50) {
                cpuGaugePath.style.stroke = '#ffb700'; // neon-gold (working)
            } else {
                cpuGaugePath.style.stroke = '#00d2d3'; // neon-cyan (idle)
            }
        }

        // Update speed and ETA
        if (statSpeed) statSpeed.textContent = data.speed || "-";
        if (statEta) statEta.textContent = data.eta || "-";

        // Update 1-sigma constraints table
        if (data.constraints && data.constraints.length > 0) {
            constraintsCard.style.display = 'block';
            let constraintsHtml = '<div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 5px;">';
            data.constraints.forEach(c => {
                constraintsHtml += `<div><span style="color:#00d2d3">${c.parameter}</span></div><div>${c.mean} &plusmn; ${c.error}</div>`;
            });
            constraintsHtml += '</div>';
            constraintsBody.innerHTML = constraintsHtml;
        } else {
            constraintsCard.style.display = 'none';
        }

        // Update tensions and struggles
        // Render Tensions Badge
        statTensionsBadge.textContent = data.tension_status;
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
        
        // Update initialization progress bar
        if (data.status === 'running' || data.status === 'completed') {
            let p = data.init_percent !== undefined ? data.init_percent : 0;
            if (data.status === 'completed') p = 100;
            initFill.style.width = `${p}%`;
            initPercent.textContent = `${p}%`;
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
            btnStart.disabled = true;
            btnResume.disabled = true;
            btnStop.disabled = false;
            
            let chi2Text = data.best_chi2 !== null ? data.best_chi2.toFixed(4) : 'evaluating';
            let logZText = data.log_evidence !== null ? data.log_evidence.toFixed(4) : 'evaluating';
        } else {
            btnStart.disabled = false;
            btnResume.disabled = false;
            btnStop.disabled = true;
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
                        <strong style="color: #ff9ff3; font-size: 1.1rem;">${alert.parameter}</strong><br>
                        <span style="color: #feca57;">${alert.status}</span><br>
                        <span style="color: #a4b0be; font-size: 0.85rem;">Suggestion: <span style="color: #fff;">${alert.suggestion}</span></span>
                    </div>`;
                }).join("");

                if (Object.keys(currentProposedUpdates).length > 0 && data.status === 'running') {
                    document.getElementById('watchdog-actions').style.display = 'flex';
                } else {
                    document.getElementById('watchdog-actions').style.display = 'none';
                }
            }
        } else {
            // All clear! Reset dog to happy mode
            watchdogIgnored = false;
            currentProposedUpdates = {};
            watchdogIcon.innerText = '🐶';
            watchdogCard.style.borderColor = "#00d2d3"; // Neon Cyan
            watchdogText.style.color = "#00d2d3";
            watchdogText.style.textShadow = "0 0 10px rgba(0, 210, 211, 0.5)";
            watchdogText.innerText = "All clear, Captain!";
            
            // Hide the details box
            watchdogDesc.style.display = "none";
            watchdogDesc.innerHTML = "";
            document.getElementById('watchdog-actions').style.display = 'none';
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
                const oldMax = parseInt(slider.max);
                slider.max = data.history_frames.length;
                slider.min = 1;
                if (oldMax === 0) {
                    slider.value = 1;
                    showEvolutionFrame(1);
                }
            }
        }

        // If completed, compute evidence comparison
        if (data.status === 'completed' && data.log_evidence !== null) {
            if (activeConfig === 'lcdm_config.yaml') {
                updateBaseline("planck_bao_pantheonplus_shoes", data.log_evidence, data.best_chi2);
            } else {
                calculateEvidence(data.log_evidence);
                if (checkAutoRunLcdm && checkAutoRunLcdm.checked) {
                    appendLog(`[PIPELINE] Custom model completed. Preparing to auto-run baseline ΛCDM in 5 seconds...`);
                    setTimeout(() => {
                        switchToLcdm();
                        btnStart.click();
                    }, 5000);
                }
            }
        }
        
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
    watchdogIcon.innerText = '🐶';
    watchdogCard.style.borderColor = "#00d2d3";
    watchdogText.style.color = "#00d2d3";
    watchdogText.style.textShadow = "0 0 10px rgba(0, 210, 211, 0.5)";
    watchdogText.innerText = "Warnings Ignored";
    watchdogDesc.style.display = "none";
    document.getElementById('watchdog-actions').style.display = 'none';
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

// Console helper
function appendLog(message) {
    // Remove initial placeholder if present
    if (localLogs.length === 1 && localLogs[0] === 'Waiting for run execution...') {
        localLogs = [];
    }
    localLogs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
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
    html += localLogs.join('<br>');
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

// Register Copy Button Listeners
document.addEventListener('DOMContentLoaded', () => {
    // 1. Copy Evidence Comparison Math
    const btnCopyEvidence = document.getElementById('btn-copy-evidence');
    if (btnCopyEvidence) {
        btnCopyEvidence.addEventListener('click', () => {
            if (!lastStatusData) return;
            const logEvidenceVal = lastStatusData.log_evidence !== null ? `${lastStatusData.log_evidence.toFixed(4)} +/- ${lastStatusData.log_evidence_error.toFixed(4)}` : "-";
            const valBaselineText = document.getElementById('val-baseline').textContent;
            const valCustomText = document.getElementById('val-custom').textContent;
            const valDeltaText = document.getElementById('val-delta').textContent;
            const jeffText = document.getElementById('jeffreys-text').textContent;
            const jeffDescText = document.getElementById('jeffreys-desc').textContent;
            
            const text = `--- Bayesian Evidence Comparison ---
Baseline log(Z): ${valBaselineText}
Custom Model log(Z): ${valCustomText} (Evidence Z: ${logEvidenceVal})
Delta log(Z): ${valDeltaText}
Evidence Strength: ${jeffText} (${jeffDescText})`;
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
- Qualitative Preference: ${c.qualitative_preference}`;
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

            // Scrape new visual diagnostics information from the UI
            const jacobianText = document.getElementById('jacobian-heatmap-container') ? document.getElementById('jacobian-heatmap-container').innerText.trim() : "No Jacobian computed.";
            const pullsText = document.getElementById('dataset-pull-container') ? document.getElementById('dataset-pull-container').innerText.trim() : "No dataset pulls available.";
            const autopsyText = Array.from(document.querySelectorAll('#autopsy-timeline > div')).map(el => el.innerText.trim()).slice(-10).join('\n') || "No autopsy events.";

            const promptText = `Here is the cosmological data from my CLASS & Cobaya run. Please analyze these diagnostics, evaluate if the custom model resolves the H0 and S8 tensions, check the model struggles/stability, and explain the physical implications:

### Run Status
- Status: ${status}
- Stagnation Detected: ${lastStatusData.stagnation_detected ? "Yes (" + lastStatusData.stagnation_reason + ")" : "No"}

### Bayesian Evidence Comparison
- Baseline log(Z): ${valBaselineText}
- Custom Model log(Z): ${valCustomText}
- Delta log(Z): ${valDeltaText}
- Evidence Strength: ${jeffText}

### Model Comparison & Information Criteria (AIC & BIC)
${compVal}

### Run Health & Solver Stability
${rhVal}
- Neutrino Sector Setup: ${ncdmVal}

### Late-Time Jacobian Sensitivity (∂ln(Observable) / ∂ln(Parameter))
${jacobianText}

### Dataset Pulls & Parameter Shifts
${pullsText}

### Sampler Autopsy & Solver Anomalies (Last 10 Events)
${autopsyText}

### Cosmo Curves Parameters (Late-Time Dynamics)
- Effective w0 (equation of state at z=0): ${w0Val}
- Effective wa (EoS crossing slope): ${waVal}
- Structure Growth Index γ0: ${gammaVal}

### Cosmic Tension Dashboard & Discrepancies
${tensionVal}
- Struggles (Boltzmann Solver Failures): ${strugglesText}

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
            const wParams = `${m.w0.toFixed(2)}, ${m.wa.toFixed(2)}`;
            
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
        const xi = parseFloat(document.getElementById('slide-xi').value);
        const zeta = parseFloat(document.getElementById('slide-zeta').value);
        const betaSlider = parseFloat(document.getElementById('slide-beta').value);
        
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
    
    appendLog("[PIPELINE] Sending sampler recovery request. Priors widening by 20%, proposal scale widening by 2x...");
    try {
        const response = await fetch(`${API_URL}/api/recover_sampler`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                config_name: activeConfig,
                widen_percent: widenPercent,
                proposal_scale: proposalScale
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
    const btn = document.getElementById('btn-reset-history');
    btn.disabled = true;
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
        btn.disabled = false;
    }
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
        const res = await fetch(`${API_URL}/api/likelihood_terrain?param1=${p1}&param2=${p2}&config_name=${encodeURIComponent(activeConfig)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === "success" && data.points) {
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
                
                chartTerrain.options.scales.x.title.text = p1;
                chartTerrain.options.scales.y.title.text = p2;
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
        const res = await fetch(`${API_URL}/api/chain_quality?param=${selectedParam}&config_name=${encodeURIComponent(activeConfig)}`);
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
