# CosmicForge Data Display Fixes - Verification Checklist

## Problem Statement
CosmicForge Run tab shows **BLANK** (no data), while Standard Run real-time monitor displays CPU usage and confidence level.

## Root Causes Identified

### 1. **Event Loop Blocking (CRITICAL)**
- **Issue**: `find_and_adopt_running_cobaya()` was synchronous but called from async endpoint
- **Impact**: Blocks entire event loop, API becomes unresponsive
- **File**: `scripts/cosmo_dashboard_backend.py` line 3138
- **Status**: ✅ FIXED - Wrapped in `run_in_executor()`

### 2. **History Check Blocking (CRITICAL)**
- **Issue**: `check_and_update_history()` does blocking file I/O in async context
- **Impact**: Locks up /api/status responses
- **File**: `scripts/cosmo_dashboard_backend.py` line 3972
- **Status**: ✅ FIXED - Wrapped in `run_in_executor()`

### 3. **YAML Path Resolution (CRITICAL)**
- **Issue**: When adoption detects `lcdm_config.yaml` (relative), parsing returns wrong prefix
- **Impact**: Output prefix becomes `chains/cobaya_run` (fallback) instead of `chains/lcdm_polychord`
- **Files**: 
  - `backend/process_watcher.py` lines 160-175 (Cobaya adoption)
  - `backend/process_watcher.py` lines 192-210 (CosmicForge adoption)
- **Status**: ✅ FIXED - Added path resolution logic:
  - If yaml_file starts with `prtoe_class/`, resolve as `/home/themilkmanj/{yaml_file}`
  - Otherwise try relative to prtoe_class directory
  - Fall back to current working directory

### 4. **Frontend Data Pipeline (NO ISSUE FOUND)**
- **JavaScript**:  `cosmic_dashboard/frontend/index.js` lines 2316-2349
  - ✅ Correctly checks `data.is_optimizer`
  - ✅ Correctly populates all `opt-stat-*` fields from API response
  - ✅ Auto-switches monitor tab when is_optimizer=true
- **HTML**: `cosmic_dashboard/frontend/index.html` lines 432-483
  - ✅ CosmicForge monitor view has all required stat cards

### 5. **Backend Data Pipeline (NO ISSUES FOUND)**
- **Adoption**: `backend/process_watcher.py` lines 218 + 180
  - ✅ Sets `state.is_optimizer = True` for CosmicForge processes
- **API Response**: `scripts/cosmo_dashboard_backend.py` line 3936
  - ✅ Adds `is_optimizer` to stats_data response
  - ✅ Loads `.summary.json` when is_optimizer=True (lines 3939-3970)
  - ✅ Exposes: best_chi2, n_modes, convergence_detected, constraint_violations

## Files Modified

| File | Changes | Status |
|------|---------|--------|
| `scripts/cosmo_dashboard_backend.py` | Lines 3138, 3972: Wrapped blocking calls in `run_in_executor()` | ✅ FIXED |
| `backend/process_watcher.py` | Lines 160-210: Added YAML path resolution logic | ✅ FIXED |
| `cosmic_dashboard/frontend/` | Consolidated from separate `dashboard/` and `cosmic_dashboard/` | ✅ CONSOLIDATED |

## Expected Behavior After Fixes

### /api/status Response (for running CosmicForge process)
```json
{
  "is_optimizer": true,
  "active_output_prefix": "chains/lcdm_polychord",
  "best_chi2": 2456.78,
  "n_modes": 3,
  "constraint_violations": 0,
  "convergence_detected": true,
  "dead_points": 1250,
  "cpu_percent": 87.5,
  "status": "running"
}
```

### Frontend Display
1. **Real-Time Monitor Tab** → Auto-switches to "CosmicForge" when adoption happens
2. **Optimizer Stats** populated:
   - ✅ Total Evaluations: 1250
   - ✅ Best χ²: 2456.78
   - ✅ Active Phase: "Local Search (BOBYQA)" or "Surrogate MCMC"
   - ✅ System CPU Load: 87.5% (with gauge animation)
   - ✅ Speed: `-` (from statSpeed.textContent)
   - ✅ ETA: `-` (from statEta.textContent)
3. **CosmicForge Run Tab** (lines 705-778):
   - Convergence Progress plot
   - Multimodal Modes Comparison table
   - Mode Tension Analysis
   - MCMC Diagnostics (if available)
   - Mode Metadata & Quality Metrics table

## Verification Steps

### Step 1: Check Backend is Responsive
```bash
# After restarting dashboard
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"cosmicforge"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token'))"

# Should get a token in <5 seconds (not hang)
```

### Step 2: Verify API Returns Optimizer Data
```bash
# With running process adopted
curl http://localhost:8000/api/status \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys, json; d = json.load(sys.stdin); print(f'is_optimizer={d.get(\"is_optimizer\")}, best_chi2={d.get(\"best_chi2\")}, cpu={d.get(\"cpu_percent\")}')"

# Should show: is_optimizer=True, best_chi2=<number>, cpu=<percentage>
```

### Step 3: Verify Frontend Display
1. Open dashboard in browser
2. Monitor tab should auto-switch to "CosmicForge"
3. All stat cards should be populated:
   - ✅ "Total Evaluations" shows > 0
   - ✅ "Best χ²" shows actual value (not "-")
   - ✅ "System CPU Load" gauge shows actual percentage
   - ✅ "Active Phase" shows phase name

### Step 4: Verify CosmicForge Run Tab
1. Click "CosmicForge Run" tab
2. Should show:
   - ✅ Convergence plot (not fallback placeholder)
   - ✅ Modes comparison table (if modes found)
   - ✅ Tension analysis (if multimodal)

## Running Processes

- **PID 259094**: lcdm_config run (estimated time remaining ~30 min)
- **PID 261446**: prtoe_standard run (estimated time remaining ~45 min)

Both processes use old `run_optimizer.py` name in cmdline but process_watcher detects both names (line 175, 186).

## Next Steps

1. **Restart dashboard** with all fixes applied
2. **Test /api/status** endpoint for responsiveness
3. **Monitor frontend** for data population
4. **If API still hangs**: Check for other blocking calls (file reads, YAML parsing, etc.)
5. **If data still blank**: Add console.log() in index.js line 2316+ to debug is_optimizer value
