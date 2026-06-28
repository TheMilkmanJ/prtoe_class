import os
import re
import yaml
from pathlib import Path
from typing import Optional, List
from fastapi import HTTPException
from parsers.logs import safe_parse_python_dict, get_best_fit_from_log
import os.path as osp

def _assert_within_workspace(path: str, detail: str) -> None:
    """Canonical workspace containment check using realpath and commonpath."""
    allowed_dir = os.path.realpath(
        os.path.abspath(os.environ.get("DASHBOARD_WORKSPACE_ROOT", os.getcwd()))
    )
    abs_path = os.path.realpath(os.path.abspath(path))
    try:
        is_allowed = os.path.commonpath([allowed_dir, abs_path]) == allowed_dir
    except ValueError:
        is_allowed = False
    if not is_allowed:
        raise HTTPException(status_code=400, detail=detail)

def get_output_prefix_from_yaml(config_path: str) -> str:
    """Parses the YAML file to find the 'output' key and sanitizes the path."""
    prefix = "chains/cobaya_run"
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            if 'output' in config and isinstance(config['output'], str):
                prefix = config['output']
    except Exception:
        pass
    
    # Sanitize prefix to prevent path traversal
    _assert_within_workspace(prefix, "Path traversal detected in YAML 'output' configuration.")
    return prefix

def get_model_yaml_path(output_prefix: str, active_yaml_path: str = "") -> Optional[Path]:
    """Finds a configuration YAML file corresponding to output_prefix."""
    # 1. Try updated.yaml
    updated_yaml = Path(f"{output_prefix}.updated.yaml")
    if updated_yaml.exists():
        try:
            with open(updated_yaml, 'r') as f:
                content = yaml.safe_load(f)
            if isinstance(content, dict):
                return updated_yaml
        except Exception:
            pass
        
    # 2. Try input.yaml
    input_yaml = Path(f"{output_prefix}.input.yaml")
    if input_yaml.exists():
        try:
            with open(input_yaml, 'r') as f:
                content = yaml.safe_load(f)
            if isinstance(content, dict):
                return input_yaml
        except Exception:
            pass
        
    # 3. Try active_yaml_path
    if active_yaml_path and Path(active_yaml_path).exists():
        try:
            if get_output_prefix_from_yaml(active_yaml_path) == output_prefix:
                try:
                    with open(active_yaml_path, 'r') as f:
                        content = yaml.safe_load(f)
                    if isinstance(content, dict):
                        return Path(active_yaml_path)
                except Exception:
                    pass
        except Exception:
            pass
            
    # 4. Search in root and chains/ directories for matching output field
    for ypath in [Path("."), Path("chains")]:
        if ypath.exists():
            for yfile in ypath.glob("*.yaml"):
                try:
                    if get_output_prefix_from_yaml(str(yfile)) == output_prefix:
                        # Only return if it actually loads to a dict (avoid empty/partial files during write)
                        try:
                            with open(yfile, 'r') as f:
                                content = yaml.safe_load(f)
                            if isinstance(content, dict):
                                return yfile
                        except Exception:
                            pass
                except Exception:
                    pass
    return None

def parse_polychord_stats(stats_file: Path, resume_file: Optional[Path] = None):
    """Parses a PolyChord .stats file or .resume file to extract key metrics."""
    stats = {
        "dead_points": 0,
        "log_evidence": None,
        "log_evidence_error": None,
        "log_evidence_preview": None,
        "log_evidence_preview_error": None,
        "evidence_source": None,
        "evidence_is_final": False,
        "evidence_quality": "missing",
    }

    # 1. Try reading the completed stats file first
    if stats_file.exists():
        try:
            with open(stats_file, 'r') as f:
                content = f.read()

            # Read dead points
            ndead_match = re.search(r"ndead:\s*(\d+)", content)
            if ndead_match:
                stats["dead_points"] = int(ndead_match.group(1))

            # Read nlive
            nlive_match = re.search(r"nlive:\s*(\d+)", content)
            if nlive_match:
                stats["nlive"] = int(nlive_match.group(1))

            # Read log(Z) and error from stats file
            logz_match = re.search(r"log\(Z\)\s*=\s*([-\d.eE+]+)\s*\+/-\s*([-\d.eE+]+)", content)
            if logz_match:
                stats["log_evidence"] = float(logz_match.group(1))
                stats["log_evidence_error"] = float(logz_match.group(2))
                stats["evidence_source"] = "polychord_stats"
                stats["evidence_is_final"] = True
                stats["evidence_quality"] = "final_nested_sampling"
                return stats
        except Exception:
            pass

    # 2. Fall back to reading the resume file for real-time progress
    if resume_file and resume_file.exists():
        try:
            with open(resume_file, 'r') as f:
                content = f.read()

            # Read dead points (iterations)
            dead_points_match = re.search(r"=== Number of dead points/iterations ===\s*\n\s*(\d+)", content)
            if dead_points_match:
                stats["dead_points"] = int(dead_points_match.group(1))

            # Read log(Z)
            logz_match = re.search(r"=== global evidence -- log\(<Z>\) ===\s*\n\s*([-\d.eE+]+)", content)
            if logz_match:
                stats["log_evidence"] = float(logz_match.group(1))
                stats["evidence_source"] = "polychord_resume"
                stats["evidence_is_final"] = False
                stats["evidence_quality"] = "live_nested_sampling"

            # Read log(Z^2) to estimate the error
            logz2_match = re.search(r"=== global evidence\^2 -- log\(<Z\^2>\) ===\s*\n\s*([-\d.eE+]+)", content)
            if logz_match and logz2_match:
                import math
                logz = float(logz_match.group(1))
                logz2 = float(logz2_match.group(1))
                try:
                    diff = logz2 - 2 * logz
                    if 0 < diff < 700:
                        stats["log_evidence_error"] = (math.exp(diff) - 1)**0.5
                    elif diff >= 700:
                        stats["log_evidence_error"] = 10.0
                    else:
                        stats["log_evidence_error"] = 0.1
                except Exception:
                    stats["log_evidence_error"] = 0.1
            return stats
        except Exception:
            pass

    # 3. Fall back to parsing the log file to get baseline
    log_file = stats_file.with_suffix(".log")
    if not log_file.exists() and "polychord_raw" in str(stats_file):
        log_file = stats_file.parent.parent / f"{stats_file.stem}.log"
    if log_file.exists():
        try:
            logls = []
            pattern = re.compile(r"Computed derived parameters:\s*(\{.*\})")
            with open(log_file, 'r') as f:
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
                                
                                cmb_sum = sum(cmb_vals) if cmb_vals else 0.0
                                bao_sum = sum(bao_vals) if bao_vals else 0.0
                                sn_sum = sum(sn_vals) if sn_vals else 0.0
                                
                                chi2_bao = params_dict.get('chi2__BAO', bao_sum)
                                chi2_cmb = params_dict.get('chi2__CMB', cmb_sum)
                                chi2_sn = params_dict.get('chi2__SN', sn_sum)
                                
                                tot_chi2 = (chi2_bao or 0.0) + (chi2_cmb or 0.0) + (chi2_sn or 0.0)
                                # Include all chi2__* terms in total, not just grouped ones
                                if tot_chi2 == 0.0:
                                    tot_chi2 = sum([params_dict[k] for k in chi2_keys])
                                else:
                                    # Add any ungrouped chi2 terms to the grouped total
                                    grouped_keys = {k for k in chi2_keys if any(g in k.lower() for g in ['cmb', 'planck', 'bao', 'boss', 'sn', 'pantheon', 'shoes'])}
                                    ungrouped_vals = [params_dict[k] for k in chi2_keys if k not in grouped_keys]
                                    tot_chi2 += sum(ungrouped_vals)
                                
                                if tot_chi2 > 0.0:
                                    logls.append(-0.5 * tot_chi2)
                        except Exception:
                            pass
            
            if logls:
                import math
                max_val = max(logls)
                logz_prior = max_val + math.log(sum(math.exp(x - max_val) for x in logls)) - math.log(len(logls))
                stats["log_evidence_preview"] = logz_prior
                stats["evidence_source"] = "log_likelihood_preview"
                stats["evidence_is_final"] = False
                stats["evidence_quality"] = "diagnostic_only"
                
                log_mean_L2 = max(2 * x for x in logls) + math.log(sum(math.exp(2 * x - max(2 * y for y in logls)) for x in logls)) - math.log(len(logls))
                diff = log_mean_L2 - 2 * logz_prior
                if 0 < diff < 700:
                    stats["log_evidence_preview_error"] = ((math.exp(diff) - 1) / len(logls))**0.5
                elif diff >= 700:
                    stats["log_evidence_preview_error"] = 10.0
                else:
                    stats["log_evidence_preview_error"] = 0.5
        except Exception:
            pass

    return stats

def get_best_fit_details(output_prefix: str, state=None, active_yaml_path: str = ""):
    """Fixed, non-duplicated version of get_best_fit_details.
    state is optional for backward compatibility with one-argument call sites."""
    # Sanitize output_prefix to prevent directory traversal
    _assert_within_workspace(output_prefix, "Access denied: invalid output prefix path.")

    log_file = Path(f"{output_prefix}.log")
    
    best_log_fit = get_best_fit_from_log(log_file, state) if state else None
    
    prefix_path = Path(output_prefix)
    raw_file = prefix_path.parent / f"{prefix_path.name}_polychord_raw" / f"{prefix_path.name}.txt"
    live_file = prefix_path.parent / f"{prefix_path.name}_polychord_raw" / f"{prefix_path.name}_phys_live.txt"
    final_file = Path(f"{output_prefix}.txt")
    
    files_to_check = []
    if final_file.exists():
        files_to_check.append((final_file, "final"))
    if raw_file.exists():
        files_to_check.append((raw_file, "raw_txt"))
    if live_file.exists():
        files_to_check.append((live_file, "live"))
        
    best_file_fit = None
    best_chi2_file = float('inf')
    
    yaml_to_read = get_model_yaml_path(output_prefix, active_yaml_path)
    if not yaml_to_read or not yaml_to_read.exists():
        return best_log_fit
        
    try:
        with open(yaml_to_read, 'r') as f:
            up_cfg = yaml.safe_load(f) or {}
    except Exception:
        return best_log_fit

    if not isinstance(up_cfg, dict):
        up_cfg = {}

    params = up_cfg.get('params', {})
    likelihoods = up_cfg.get('likelihood', {})
    
    sampled = []
    derived = []
    
    for name, p_dict in params.items():
        if not isinstance(p_dict, dict):
            continue
        if 'value' in p_dict:
            val = p_dict['value']
            if isinstance(val, str) and 'lambda' in val:
                derived.append(name)
        elif 'prior' in p_dict:
            sampled.append(name)
        else:
            derived.append(name)
            
    is_dict = isinstance(state, dict)
    
    for fpath, ftype in files_to_check:
        fpath_str = str(fpath)
        try:
            file_size = os.path.getsize(fpath)
            
            raw_file_positions = state.get("raw_file_positions", {}) if is_dict else getattr(state, "raw_file_positions", {})
            best_fit_file_cache = state.get("best_fit_file_cache", {}) if is_dict else getattr(state, "best_fit_file_cache", {})
            
            if fpath_str not in raw_file_positions:
                raw_file_positions[fpath_str] = 0
            elif file_size < raw_file_positions[fpath_str]:
                raw_file_positions[fpath_str] = 0
                best_fit_file_cache.pop(fpath_str, None)
                
            current_best = best_fit_file_cache.get(fpath_str)
            best_chi2_this_file = current_best["total"] if current_best else float('inf')
            best_fit_this_file = current_best
            
            with open(fpath, 'r', errors='ignore') as f:
                start_pos = raw_file_positions[fpath_str]
                
                # Check for header in final_file on every incremental read so
                # appended rows still use the correct column mapping.
                has_header = False
                names_in_header = []
                if ftype == "final":
                    f.seek(0)
                    first_line = f.readline()
                    if first_line.startswith('#'):
                        has_header = True
                        names_in_header = first_line.lstrip('#').strip().split()
                        if start_pos == 0:
                            start_pos = f.tell()
                            raw_file_positions[fpath_str] = start_pos
                f.seek(start_pos)
                
                for line in f:
                    if line.strip().startswith('#'):
                        continue
                    parts = line.strip().split()
                    if len(parts) >= 2:
                        try:
                            # 1. Compute total chi2 based on file type
                            if ftype == "live":
                                chi2 = -2.0 * float(parts[-1])
                            elif ftype == "raw_txt":
                                chi2 = float(parts[1])
                            elif ftype == "final":
                                if has_header and 'minuslogprior' in names_in_header:
                                    minuslogpost = float(parts[names_in_header.index('minuslogpost')])
                                    minuslogprior = float(parts[names_in_header.index('minuslogprior')])
                                    chi2 = 2.0 * (minuslogpost - minuslogprior)
                                else:
                                    chi2 = 2.0 * (float(parts[1]) - float(parts[2]))

                            if chi2 < best_chi2_this_file:
                                best_chi2_this_file = chi2
                                best_parts = parts
                                
                                raw_params = {}
                                
                                # 2. Map parameters based on file type
                                if ftype == "final" and has_header:
                                    for idx, name in enumerate(names_in_header):
                                        if idx < len(best_parts):
                                            try:
                                                raw_params[name] = float(best_parts[idx])
                                            except ValueError:
                                                pass
                                else:
                                    if ftype == "final":
                                        sampled_clean = [p for p in sampled if not params[p].get('drop')]
                                        names_params = sampled_clean + derived
                                        idx_start = 3
                                    elif ftype == "live":
                                        priors = ["logprior__0"]
                                        likes = [f"loglike__{name}" for name in likelihoods.keys()]
                                        names_params = sampled + derived + priors + likes
                                        idx_start = 0
                                    else: # raw_txt
                                        priors = ["logprior__0"]
                                        likes = [f"loglike__{name}" for name in likelihoods.keys()]
                                        names_params = sampled + derived + priors + likes
                                        idx_start = 2
                                        
                                    for i, name in enumerate(names_params):
                                        idx = idx_start + i
                                        if idx < len(best_parts):
                                            raw_params[name] = float(best_parts[idx])
                                            
                                # 3. Safely sum likelihood parameters to positive chi2 values
                                cmb_vals = []
                                bao_vals = []
                                boss_vals = []
                                desi_vals = []
                                sn_vals = []
                                lensing_vals = []
                                other_vals = []
                                
                                has_cmb_group = any(k.startswith('chi2__') and ('cmb' in k.lower() or 'planck' in k.lower()) for k in raw_params.keys())
                                has_bao_group = any(k.startswith('chi2__') and ('bao' in k.lower() and 'boss' not in k.lower()) for k in raw_params.keys())
                                has_boss_group = any(k.startswith('chi2__') and 'boss' in k.lower() for k in raw_params.keys())
                                has_desi_group = any(k.startswith('chi2__') and 'desi' in k.lower() for k in raw_params.keys())
                                has_sn_group = any(k.startswith('chi2__') and ('sn' in k.lower() or 'pantheon' in k.lower() or 'shoes' in k.lower()) for k in raw_params.keys())
                                has_lensing_group = any(k.startswith('chi2__') and ('lensing' in k.lower() or 'lens' in k.lower()) for k in raw_params.keys())
                                
                                for k, v in raw_params.items():
                                    if not (k.startswith('chi2__') or k.startswith('loglike__')):
                                        continue
                                    
                                    if k.startswith('loglike__'):
                                        k_lower = k.lower()
                                        if has_cmb_group and ('cmb' in k_lower or 'planck' in k_lower):
                                            continue
                                        if has_bao_group and ('bao' in k_lower and 'boss' not in k_lower):
                                            continue
                                        if has_boss_group and 'boss' in k_lower:
                                            continue
                                        if has_desi_group and 'desi' in k_lower:
                                            continue
                                        if has_sn_group and ('sn' in k_lower or 'pantheon' in k_lower or 'shoes' in k_lower):
                                            continue
                                        if has_lensing_group and ('lensing' in k_lower or 'lens' in k_lower):
                                            continue
                                            
                                    val = -2.0 * v if k.startswith('loglike__') else v
                                    k_lower = k.lower()
                                    
                                    if 'desi' in k_lower:
                                        desi_vals.append(val)
                                    elif 'boss' in k_lower:
                                        boss_vals.append(val)
                                    elif 'bao' in k_lower:
                                        bao_vals.append(val)
                                    elif 'lensing' in k_lower or 'lens' in k_lower:
                                        lensing_vals.append(val)
                                    elif 'cmb' in k_lower or 'planck' in k_lower:
                                        cmb_vals.append(val)
                                    elif 'sn' in k_lower or 'pantheon' in k_lower or 'shoes' in k_lower:
                                        sn_vals.append(val)
                                    else:
                                        other_vals.append(val)

                                best_fit_this_file = {
                                    "total": chi2,
                                    "cmb": sum(cmb_vals) if cmb_vals else 0.0,
                                    "bao": sum(bao_vals) if bao_vals else 0.0,
                                    "boss": sum(boss_vals) if boss_vals else 0.0,
                                    "desi": sum(desi_vals) if desi_vals else 0.0,
                                    "sn": sum(sn_vals) if sn_vals else 0.0,
                                    "lensing": sum(lensing_vals) if lensing_vals else 0.0,
                                    "other": sum(other_vals) if other_vals else 0.0,
                                    "raw_params": raw_params
                                }
                        except (ValueError, IndexError):
                            pass
                raw_file_positions[fpath_str] = f.tell()
                if best_fit_this_file:
                    best_fit_file_cache[fpath_str] = best_fit_this_file
                    
                if is_dict:
                    state["raw_file_positions"] = raw_file_positions
                    state["best_fit_file_cache"] = best_fit_file_cache
                else:
                    state.raw_file_positions = raw_file_positions
                    state.best_fit_file_cache = best_fit_file_cache
                
            if best_fit_this_file and (best_file_fit is None or best_fit_this_file["total"] < best_chi2_file):
                best_chi2_file = best_fit_this_file["total"]
                best_file_fit = best_fit_this_file
        except Exception:
            pass
            
    fits = [f for f in [best_log_fit, best_file_fit] if f is not None]
    if fits:
        return min(fits, key=lambda x: x['total'])
    return best_log_fit
