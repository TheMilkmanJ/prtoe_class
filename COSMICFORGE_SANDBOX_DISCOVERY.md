# CosmicForge - Sandbox Process Discovery & Root Cause

## Key Finding: Processes ARE Visible

Despite suspicion that Antigravity-started processes might be in a sandbox, the running processes **ARE** visible to the dashboard via psutil:

```
✅ PID 259094 (lcdm_config run)
   Cmdline: python3 prtoe_class/run_optimizer.py prtoe_class/lcdm_config.yaml ...
   Config detected: prtoe_class/lcdm_config.yaml

✅ PID 261446 (prtoe_standard run)  
   Cmdline: python3 run_optimizer.py prtoe_standard.yaml ...
   Config detected: prtoe_standard.yaml
```

## Root Cause: Dashboard Startup Hanging

The real issue is **not** process adoption - it's that the **dashboard itself is hanging during startup** and never reaches responsive state.

### Evidence
1. Dashboard process starts with 99%+ CPU
2. Never binds to port 8000
3. Never responds to /api/login
4. strace shows scipy.linalg loading but then gets cut off

### Hypothesis: Blocking Initialization

The dashboard startup is stuck in one of these:
- `background_process_watcher()` task initialization
- `system_metrics_watcher()` task initialization  
- Module imports during startup (scipy.linalg, cobaya, etc.)
- Some synchronous I/O in the lifespan startup handler

### Why the Fixes Didn't Solve It

The fixes applied (`run_in_executor` wrappers) are correct BUT only help if the dashboard actually starts. The startup itself is failing before get_status() is even called.

## Working Solution Path

Instead of relying on process adoption + API polling, use direct file monitoring:

```python
# Alternative: Direct file-based tracking
def track_runs_directly():
    """Track running optimizations by monitoring output files, not processes"""
    for yaml_path in glob('prtoe_class/*.yaml'):
        output_prefix = get_output_prefix_from_yaml(yaml_path)
        summary_file = f"{output_prefix}.summary.json"
        
        if Path(summary_file).exists():
            # Run is active - load data directly
            with open(summary_file) as f:
                data = json.load(f)
            # This data is what the frontend needs
            return {
                'is_optimizer': True,
                'best_chi2': data['best_chi2'],
                'n_modes': len(data['modes']),
                'cpu_percent': psutil.cpu_percent(interval=0),  # system-wide
                'active_output_prefix': output_prefix,
            }
```

## Immediate Action Items

### Option 1: Debug Dashboard Startup (High Effort)
1. Add timeout to `background_process_watcher()` in lifespan startup
2. Add timeout to `system_metrics_watcher()` initialization
3. Profile which module import is slow
4. Run dashboard without scipy (trim imports)

### Option 2: Implement File-Based Tracking (Medium Effort)
1. Add `/api/auto_discover_runs` endpoint
2. Scans for `.summary.json` + `.yaml` files instead of adopting processes
3. Populates response without needing process object
4. More robust - works even if dashboard crashes
5. No startup blocking

### Option 3: Direct Frontend Polling (Low Effort)
1. Frontend polls `/api/auto_discover_runs` separately
2. Doesn't depend on background_process_watcher
3. Can timeout gracefully if endpoint slow
4. Display partial data while waiting for full startup

## Files Involved

- `scripts/cosmo_dashboard_backend.py`
  - Line 680-690: lifespan startup (where it hangs)
  - Line 1154-1165: system_metrics_watcher (may be slow)
  - Line 3122-3150: get_status endpoint (never reached)

- `backend/process_watcher.py`
  - Line 134-230: find_and_adopt_running_cobaya (probably not even reached)

## Data Pipeline Status

| Component | Status | Notes |
|-----------|--------|-------|
| Process detection | ✅ Works | psutil finds processes correctly |
| YAML parsing | ✅ Works | get_output_prefix_from_yaml correct |
| Backend adoption logic | ✅ Code OK | But never gets called |
| API response fields | ✅ Code OK | is_optimizer, best_chi2, etc. present |
| Frontend UI | ✅ Code OK | Properly handles is_optimizer flag |
| Dashboard startup | ❌ BLOCKED | Hangs before reaching initialization complete |

## Recommendation

Given the 2 running optimizer processes at ~130 min runtime each, I recommend **Option 2 (File-Based Tracking)** as it:
- Doesn't require dashboard restart to activate
- Works even if startup hangs
- More resilient to crashes
- Can run in parallel with existing adoption mechanism
- Allows frontend to display data immediately

Estimated implementation: 1-2 hours
