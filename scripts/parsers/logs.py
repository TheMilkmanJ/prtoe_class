import os
import re
import json

def safe_parse_python_dict(s: str) -> dict:
    """Safely parse Python dict logs (from Cobaya format) to dictionary without ast.literal_eval."""
    # Replace single quotes with double quotes
    s_clean = s.replace("'", '"')
    # Replace Python booleans/None with JSON equivalents
    s_clean = re.sub(r'\bTrue\b', 'true', s_clean)
    s_clean = re.sub(r'\bFalse\b', 'false', s_clean)
    s_clean = re.sub(r'\bNone\b', 'null', s_clean)
    s_clean = re.sub(r'\binf\b', '1e10', s_clean)
    s_clean = re.sub(r'\bnan\b', '0.0', s_clean)
    try:
        return json.loads(s_clean)
    except Exception as e:
        # Fallback to custom regex key-value parser if it fails
        parsed = {}
        # Regex to find " 'key': value, " or " 'key': 'value', "
        pairs = re.findall(r"\"([a-zA-Z0-9__\-]+)\"\s*:\s*([^,\}]+)", s_clean)
        for k, v in pairs:
            v_strip = v.strip().strip('"').strip("'")
            # Try to convert to float/int
            try:
                if '.' in v_strip or 'e' in v_strip or 'E' in v_strip:
                    parsed[k] = float(v_strip)
                else:
                    parsed[k] = int(v_strip)
            except ValueError:
                if v_strip.lower() == 'true':
                    parsed[k] = True
                elif v_strip.lower() == 'false':
                    parsed[k] = False
                elif v_strip.lower() == 'null':
                    parsed[k] = None
                else:
                    parsed[k] = v_strip
        return parsed

def get_best_fit_from_log(log_path, state):
    """
    Parses the log file to extract real-time evaluations and find the best fit chi2 and parameters.
    state can be a StateManager instance or a dict with log cache/position keys.
    """
    if not log_path or not os.path.exists(log_path):
        return None
        
    try:
        file_size = os.path.getsize(log_path)
        
        # Access properties whether state is a dict or an object
        log_pos = getattr(state, "log_file_position", 0) if not isinstance(state, dict) else state.get("log_file_position", 0)
        if file_size < log_pos:
            log_pos = 0
            
        best_eval = getattr(state, "best_fit_log_cache", None) if not isinstance(state, dict) else state.get("best_fit_log_cache")
        best_chi2 = best_eval["total"] if best_eval else float('inf')
        
        pattern = re.compile(r"Computed derived parameters:\s*(\{.*\})")
        
        with open(log_path, 'r', errors='ignore') as f:
            f.seek(log_pos)
            for line in f:
                match = pattern.search(line)
                if match:
                    try:
                        params_dict = safe_parse_python_dict(match.group(1))
                        chi2_keys = [k for k in params_dict.keys() if k.startswith('chi2__')]
                        if chi2_keys:
                            cmb_vals = [params_dict[k] for k in chi2_keys if 'cmb' in k.lower() or 'planck' in k.lower()]
                            bao_vals = [params_dict[k] for k in chi2_keys if 'bao' in k.lower()]
                            sn_vals = [params_dict[k] for k in chi2_keys if 'sn' in k.lower() or 'pantheon' in k.lower() or 'shoes' in k.lower()]
                            
                            cmb_sum = sum(cmb_vals) if cmb_vals else None
                            bao_sum = sum(bao_vals) if bao_vals else None
                            sn_sum = sum(sn_vals) if sn_vals else None
                            
                            chi2_bao = params_dict.get('chi2__BAO', bao_sum)
                            chi2_cmb = params_dict.get('chi2__CMB', cmb_sum)
                            chi2_sn = params_dict.get('chi2__SN', sn_sum)
                            
                            tot = (chi2_bao or 0.0) + (chi2_cmb or 0.0) + (chi2_sn or 0.0)
                            if tot == 0.0:
                                tot = sum([params_dict[k] for k in chi2_keys])
                                
                            if tot < best_chi2:
                                best_chi2 = tot
                                best_eval = {
                                    "total": tot,
                                    "cmb": chi2_cmb,
                                    "bao": chi2_bao,
                                    "sn": chi2_sn,
                                    "raw_params": params_dict
                                }
                    except Exception:
                        continue
            new_pos = f.tell()
            if not isinstance(state, dict):
                state.log_file_position = new_pos
                state.best_fit_log_cache = best_eval
            else:
                state["log_file_position"] = new_pos
                state["best_fit_log_cache"] = best_eval
    except Exception:
        pass
        
    return getattr(state, "best_fit_log_cache", None) if not isinstance(state, dict) else state.get("best_fit_log_cache")

def get_best_fit_from_bobyqa_log(log_path, state):
    """
    Parse a BOBYQA/run_optimizer.py log file (seeded_run_phase1.log format) to extract:
      - current_chi2: the most recent function evaluation value
      - best_chi2: the global best chi2 across all finished runs
      - best_params: the parameter dict from the best run (parsed from 'Posterior to be computed' line)
      - current_run: which run number is currently active (e.g. 6)
      - total_runs: total number of multi-start runs (e.g. 6)
      - total_evals: cumulative function evaluations across all runs
      - run_results: list of {run, label, chi2} for finished runs
    Returns a dict or None if file not found/empty.
    """
    if not log_path or not os.path.exists(log_path):
        return None

    try:
        file_size = os.path.getsize(log_path)
        if file_size == 0:
            return None

        # Use cached position to avoid re-reading the whole file each time
        is_dict = isinstance(state, dict)
        bobyqa_pos = (state.get("bobyqa_log_position", 0) if is_dict
                      else getattr(state, "bobyqa_log_position", 0))
        bobyqa_cache = (state.get("bobyqa_cache") if is_dict
                        else getattr(state, "bobyqa_cache", None))

        if file_size < bobyqa_pos:
            bobyqa_pos = 0
            bobyqa_cache = None

        if bobyqa_cache is None:
            bobyqa_cache = {
                "global_best_chi2": float("inf"),
                "global_best_params": None,
                "run_results": [],
                "current_run": 0,
                "total_runs": 0,
                "total_evals": 0,
                "current_chi2": None,
                "last_run_params_pending": False,
            }

        # Compiled patterns
        pat_start = re.compile(
            r"\[optimizer\]\s+---\s+Starting Run\s+(\d+)/(\d+)"
        )
        pat_finish = re.compile(
            r"\[optimizer\]\s+Run\s+(\d+)\s+\(([^)]+)\)\s+finished\.\s+Best Chi2 found in this run:\s+([\d.]+)"
        )
        pat_eval = re.compile(
            r"\[pybobyqa\.util\]\s+Function eval\s+(\d+)\s+at point\s+\d+\s+has f\s+=\s+([\d.eE+\-]+)"
        )
        pat_params = re.compile(
            r"\[model\]\s+Posterior to be computed for parameters\s+(\{.*\})"
        )

        with open(log_path, "r", errors="ignore") as f:
            f.seek(bobyqa_pos)
            for line in f:
                # Track starting runs
                m = pat_start.search(line)
                if m:
                    bobyqa_cache["current_run"] = int(m.group(1))
                    bobyqa_cache["total_runs"] = int(m.group(2))
                    bobyqa_cache["last_run_params_pending"] = False
                    continue

                # Track function evaluations (current chi2)
                m = pat_eval.search(line)
                if m:
                    bobyqa_cache["total_evals"] += 1
                    try:
                        f_val = float(m.group(2))
                        bobyqa_cache["current_chi2"] = f_val
                        if f_val < bobyqa_cache["global_best_chi2"]:
                            bobyqa_cache["global_best_chi2"] = f_val
                    except (ValueError, TypeError):
                        pass
                    continue

                # Track finished runs
                m = pat_finish.search(line)
                if m:
                    run_idx = int(m.group(1))
                    run_label = m.group(2).strip()
                    chi2 = float(m.group(3))
                    bobyqa_cache["run_results"] = [
                        r for r in bobyqa_cache["run_results"] if r.get("run") != run_idx
                    ]
                    bobyqa_cache["run_results"].append({"run": run_idx, "label": run_label, "chi2": chi2})
                    if chi2 < bobyqa_cache["global_best_chi2"]:
                        bobyqa_cache["global_best_chi2"] = chi2
                    bobyqa_cache["last_run_params_pending"] = True
                    continue

                # Capture params from the line right after a run finishes
                if bobyqa_cache["last_run_params_pending"]:
                    m = pat_params.search(line)
                    if m:
                        try:
                            raw = m.group(1)
                            # Strip np.float64(...) wrappers
                            raw = re.sub(r"np\.float64\(([^)]+)\)", r"\1", raw)
                            params = safe_parse_python_dict(raw)
                            if params:
                                # Only update global best params if this run's chi2 is the global best
                                finished_runs = bobyqa_cache["run_results"]
                                if finished_runs:
                                    last = finished_runs[-1]
                                    if abs(last["chi2"] - bobyqa_cache["global_best_chi2"]) < 1e-3:
                                        bobyqa_cache["global_best_params"] = params
                        except Exception:
                            pass
                        bobyqa_cache["last_run_params_pending"] = False

            new_pos = f.tell()

        if is_dict:
            state["bobyqa_log_position"] = new_pos
            state["bobyqa_cache"] = bobyqa_cache
        else:
            state.bobyqa_log_position = new_pos
            state.bobyqa_cache = bobyqa_cache

        best_chi2 = bobyqa_cache["global_best_chi2"]
        if best_chi2 == float("inf"):
            best_chi2 = None

        return {
            "total": best_chi2,
            "current_chi2": bobyqa_cache["current_chi2"],
            "raw_params": bobyqa_cache["global_best_params"] or {},
            "total_evals": bobyqa_cache["total_evals"],
            "current_run": bobyqa_cache["current_run"],
            "total_runs": bobyqa_cache["total_runs"],
            "run_results": bobyqa_cache["run_results"],
            # Approximate likelihoods as None (BOBYQA doesn't split chi2 by dataset)
            "cmb": None,
            "bao": None,
            "sn": None,
        }

    except Exception:
        return None


def extract_model_struggles(log_path, state):

    """
    Associates CLASS error tracebacks with subsequent evaluation failures on the same MPI rank.
    """
    if not log_path or not os.path.exists(log_path):
        return {}
        
    try:
        file_size = os.path.getsize(log_path)
        
        # Access attributes dynamically
        is_dict = isinstance(state, dict)
        struggles_pos = state.get("struggles_file_position", 0) if is_dict else getattr(state, "struggles_file_position", 0)
        
        if file_size < struggles_pos:
            struggles_pos = 0
            if is_dict:
                state["struggles_cache"] = {}
                state["struggles_rank_state"] = {}
                state["struggles_rank_traceback"] = {}
            else:
                state.struggles_cache = {}
                state.struggles_rank_state = {}
                state.struggles_rank_traceback = {}
            
        pattern_rank = re.compile(r"\[(\d+)\s*:\s*(\w+)\]")
        
        # Get active properties from state
        s_cache = state.get("struggles_cache", {}) if is_dict else getattr(state, "struggles_cache", {})
        s_rank_state = state.get("struggles_rank_state", {}) if is_dict else getattr(state, "struggles_rank_state", {})
        s_rank_tb = state.get("struggles_rank_traceback", {}) if is_dict else getattr(state, "struggles_rank_traceback", {})
        c_err_logs = state.get("class_error_logs", []) if is_dict else getattr(state, "class_error_logs", [])
        
        with open(log_path, 'r', errors='ignore') as lf:
            lf.seek(struggles_pos)
            for line in lf:
                match = pattern_rank.search(line)
                if match:
                    rank = int(match.group(1))
                    source = match.group(2)
                    
                    if source == 'classy':
                        if "failed" in line.lower() or "error" in line.lower() or "ignored error" in line.lower():
                            s_rank_state[rank] = 'failed_class'
                            s_rank_tb[rank] = [line]
                        elif s_rank_state.get(rank) == 'failed_class':
                            s_rank_tb[rank].append(line)
                    elif source == 'model' and "calculation failed" in line.lower():
                        if s_rank_state.get(rank) == 'failed_class':
                            raw_tb = "".join(s_rank_tb[rank]).strip()
                            if raw_tb and raw_tb not in c_err_logs:
                                c_err_logs.append(raw_tb)
                                if len(c_err_logs) > 10:
                                    c_err_logs.pop(0)
                            traceback_text = raw_tb.lower()
                            
                            if "ncdm" in traceback_text or "neutrino" in traceback_text or "non-cold" in traceback_text:
                                s_cache["NCDM (Massive Neutrinos)"] = s_cache.get("NCDM (Massive Neutrinos)", 0) + 1
                            elif "background" in traceback_text:
                                s_cache["Background Dynamics"] = s_cache.get("Background Dynamics", 0) + 1
                            elif "thermo" in traceback_text or "reionization" in traceback_text:
                                s_cache["Thermal History"] = s_cache.get("Thermal History", 0) + 1
                            elif "perturb" in traceback_text:
                                s_cache["Perturbations (Cls)"] = s_cache.get("Perturbations (Cls)", 0) + 1
                            elif "lensing" in traceback_text:
                                s_cache["Lensing Integration"] = s_cache.get("Lensing Integration", 0) + 1
                            else:
                                s_cache["Numerical Instability"] = s_cache.get("Numerical Instability", 0) + 1
                                
                            s_rank_state[rank] = None
                            s_rank_tb[rank] = []
                    elif source == 'model' and s_rank_state.get(rank) == 'failed_class':
                        s_rank_state[rank] = None
                        s_rank_tb[rank] = []
                else:
                    for r, status_val in s_rank_state.items():
                        if status_val == 'failed_class':
                            s_rank_tb[r].append(line)
                            
            new_pos = lf.tell()
            if is_dict:
                state["struggles_file_position"] = new_pos
                state["struggles_cache"] = s_cache
                state["struggles_rank_state"] = s_rank_state
                state["struggles_rank_traceback"] = s_rank_tb
                state["class_error_logs"] = c_err_logs
            else:
                state.struggles_file_position = new_pos
                state.struggles_cache = s_cache
                state.struggles_rank_state = s_rank_state
                state.struggles_rank_traceback = s_rank_tb
                state.class_error_logs = c_err_logs
    except Exception:
        pass
        
    return dict(state.get("struggles_cache", {}) if is_dict else getattr(state, "struggles_cache", {}))
