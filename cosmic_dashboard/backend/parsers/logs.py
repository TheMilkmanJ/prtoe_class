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
    s_clean = re.sub(r'\binf\b', '"__INF__"', s_clean)
    s_clean = re.sub(r'\bnan\b', '"__NAN__"', s_clean)
    try:
        parsed = json.loads(s_clean)
        return {
            k: (float("inf") if v == "__INF__" else float("nan") if v == "__NAN__" else v)
            for k, v in parsed.items()
        }
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
