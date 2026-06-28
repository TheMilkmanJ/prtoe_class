"""Process watcher helpers extracted from cosmo_dashboard_backend to reduce module size and improve testability.
Functions intentionally import the main backend module lazily at runtime to avoid circular imports during module import time.

Design notes:
- BUG-09 fix: backend module is cached after the first lazy import via _get_backend().
- BUG-08 fix: all state mutations in background_process_watcher are guarded by an asyncio.Lock.
- BUG-06 fix: monitor spawn logic extracted into _spawn_monitor() helper used in both places.
- BUG-10 fix: process adoption uses exact cmdline argument matching instead of substring search.
- BUG-05 fix: AdoptedProcess.returncode and poll() semantics are clearly documented; zombie
  processes are treated as exited (returncode=0) since we cannot call os.waitpid on unrelated PIDs.
- BUG-07 fix: monitor_restart_attempts reset behaviour is documented.
"""
import asyncio
import logging
import os
import subprocess
from pathlib import Path

import psutil

logger = logging.getLogger(__name__)

# BUG-08 fix: single lock instance shared across all async code that mutates state
_state_lock: asyncio.Lock | None = None


def _get_state_lock() -> asyncio.Lock:
    """Return (or lazily create) the asyncio.Lock used to guard state mutations.

    Must be called from within a running event loop so asyncio.Lock() is
    created in the correct loop.
    """
    global _state_lock
    if _state_lock is None:
        _state_lock = asyncio.Lock()
    return _state_lock


# BUG-09 fix: cache backend module after first import
_backend_cache = None


def _get_backend():
    """Return the dashboard backend module, importing it once and caching the result.

    Lazy import (not at module level) avoids closing the circular import cycle:
      cosmo_dashboard_backend → process_watcher → cosmo_dashboard_backend
    """
    global _backend_cache
    if _backend_cache is None:
        import sys
        names_to_check = ['__main__', 'cosmo_dashboard_backend', 'scripts.cosmo_dashboard_backend', 'prtoe_class.scripts.cosmo_dashboard_backend']
        matched_name = None
        for name in names_to_check:
            mod = sys.modules.get(name)
            if mod:
                has_st = hasattr(mod, 'state')
                logger.info(f"[process_watcher] Found sys.modules key '{name}', hasattr(state)={has_st}, id(mod)={id(mod)}")
                if has_st:
                    _backend_cache = mod
                    matched_name = name
                    break
        if _backend_cache is None:
            logger.info("[process_watcher] No module in sys.modules had 'state'. Falling back to __import__.")
            _backend_cache = __import__(
                "prtoe_class.scripts.cosmo_dashboard_backend", fromlist=["*"]
            )
            matched_name = "imported_fallback"
        logger.info(f"[process_watcher] _get_backend resolved to '{matched_name}', id(state)={id(getattr(_backend_cache, 'state', None))}")
    return _backend_cache


class AdoptedProcess:
    """Lightweight process handle for a Cobaya/optimizer PID we did not spawn.

    IMPORTANT — returncode semantics (BUG-05 fix / documentation):
    - returncode is always 0 for adopted processes because we cannot call
      os.waitpid() on a PID we did not fork (it would raise PermissionError
      or return wrong data). Do NOT rely on returncode to detect crash vs clean exit.
      Use detect_run_crash_in_log() in the watcher for that purpose.
    - poll() returns None while the process is alive, 0 once it has exited or
      become a zombie.  Zombie == process has exited from the OS perspective;
      the parent simply has not called wait().  We treat it as "finished".
    """

    def __init__(self, pid: int):
        self.pid = pid
        # Always 0 — see class docstring for why
        self.returncode = 0

    def poll(self):
        """Return None if running, 0 if exited/zombie/gone."""
        try:
            if psutil.pid_exists(self.pid):
                p = psutil.Process(self.pid)
                if p.status() == psutil.STATUS_ZOMBIE:
                    # Zombie: process has exited, parent hasn't reaped it yet.
                    # Treat as finished (returncode=0 — see class docstring).
                    return 0
                return None  # genuinely running
        except psutil.NoSuchProcess:
            return 0  # gone between pid_exists and Process()
        except Exception as exc:
            logger.debug("AdoptedProcess.poll() error for PID %d: %s", self.pid, exc)
            return 0
        # pid_exists() returned False
        return 0


# BUG-06 fix: extract monitor spawn into a single helper
def _spawn_monitor(state, backend) -> bool:
    """Attempt to spawn the monitor (plot_chains.py) process.

    Returns True on success, False on failure. Mutates state.monitor_process.
    """
    try:
        python_executable, _, monitor_env = backend.resolve_cobaya_runtime(
            backend.get_active_class_engine()
        )
        monitor_cmd = [
            python_executable, "plot_chains.py",
            "--config", state.active_yaml_path,
            "--monitor-and-stop",
            "--interval", "150",
        ]
        state.monitor_process = subprocess.Popen(
            monitor_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=monitor_env,
            start_new_session=True,
        )
        backend.log_dashboard_error(
            f"Spawned monitor process: PID {state.monitor_process.pid}"
        )
        return True
    except Exception as exc:
        backend.log_dashboard_error(f"Failed to spawn monitor process: {exc}")
        return False


def _cmdline_contains_exact_arg(cmdline: list, arg: str) -> bool:
    """BUG-10 fix: check that arg is an exact element in cmdline (not a substring).

    e.g. '/chains/foo' will NOT match '/chains/foobar/...' because we compare
    individual tokens, not the joined string.
    """
    return arg in cmdline


def find_and_adopt_running_cobaya():
    """Adopt any existing Cobaya or optimizer run. Mutates backend.state when a process is found.
    Prioritizes prtoe_standard.yaml over lcdm_config.yaml when multiple runs are active.
    Lazy-imports the backend module to avoid circular import at top-level.
    """
    # BUG-09 fix: use cached backend
    backend = _get_backend()
    state = getattr(backend, 'state')
    if state.running_process is not None:
        return

    # Collect candidates: (priority, proc, yaml_file, is_optimizer)
    # Priority: 0=prtoe_standard (preferred), 1=other optimizer, 2=cobaya
    candidates = []

    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time']):
        try:
            # Skip launcher shell wrapper processes
            proc_name = (proc.info.get('name') or '').lower()
            if proc_name in ('bash', 'sh', 'zsh', 'dash', 'tmux', 'screen'):
                continue

            cmdline = proc.info.get('cmdline') or []
            if not cmdline:
                continue
            cmd_str = " ".join(cmdline).lower()
            yaml_file = None

            # CHECK COSMICFORGE/OPTIMIZER FIRST (more specific) to avoid matching "cobaya_packages"
            # FIX: Any process with run_cosmicforge.py OR run_optimizer.py is ALWAYS an optimizer
            if "run_cosmicforge.py" in cmd_str or "run_optimizer.py" in cmd_str:
                # Detect both new (run_cosmicforge.py) and old (run_optimizer.py) names for backward compatibility
                for arg in cmdline:
                    if arg.endswith(('.yaml', '.ini')):
                        yaml_file = arg
                        break
                # Prioritize prtoe_standard.yaml over lcdm_config.yaml
                if yaml_file:
                    if 'prtoe_standard' in yaml_file:
                        priority = 0
                    else:
                        priority = 1
                else:
                    priority = 1
                # ALWAYS mark as optimizer - this is the critical fix
                candidates.append((priority, proc, yaml_file, True))

            elif "cobaya" in cmd_str and "run" in cmd_str:
                for arg in cmdline:
                    if arg.endswith(('.yaml', '.ini')):
                        yaml_file = arg
                        break
                if yaml_file:
                    candidates.append((2, proc, yaml_file, False))
        except Exception:
            continue

    # Sort by priority (lower is better) and adopt the highest-priority candidate
    if candidates:
        candidates.sort(key=lambda x: x[0])
        
        # Debug: log all detected candidates
        for i, (priority, proc, yaml_file, is_optimizer) in enumerate(candidates):
            run_type = "CosmicForge" if is_optimizer else "Cobaya"
            backend.log_dashboard_error(
                f"  [Candidate {i+1}] Priority={priority}, PID={proc.info['pid']}, Type={run_type}, Config={yaml_file}",
                console=True
            )
        
        priority, proc, yaml_file, is_optimizer = candidates[0]

        pid = proc.info['pid']
        # FIX: Resolve YAML path to absolute, trying common locations
        yaml_path = None
        if yaml_file:
            yaml_path = Path(yaml_file)
            if not yaml_path.is_absolute():
                # If it already starts with prtoe_class/, use it as-is from repo root
                if str(yaml_path).startswith('prtoe_class/'):
                    yaml_path = Path('/home/themilkmanj') / yaml_path
                else:
                    # Try relative to prtoe_class directory
                    prtoe_path = Path('/home/themilkmanj/prtoe_class') / yaml_file
                    if prtoe_path.exists():
                        yaml_path = prtoe_path
                    else:
                        # Fall back to relative to cwd or as-is
                        yaml_path = Path.cwd() / yaml_file
        
        state.running_process = AdoptedProcess(pid)
        state.active_yaml_path = str(yaml_path) if yaml_path else ""
        state.active_output_prefix = backend.get_output_prefix_from_yaml(
            state.active_yaml_path
        )
        state.current_status = "running"
        state.is_optimizer = is_optimizer
        state.run_start_time = proc.info.get('create_time')

        run_type = "CosmicForge" if is_optimizer else "Cobaya"
        backend.log_dashboard_error(
            f"✅ Adopted running {run_type} process: PID {pid}, "
            f"Config: {yaml_file} → {state.active_yaml_path}, "
            f"Output Prefix: {state.active_output_prefix}, "
            f"is_optimizer={is_optimizer}",
            console=True
        )
    else:
        # Debug: log that no processes were detected
        backend.log_dashboard_error(
            "  [Process Watcher] No running Cobaya/CosmicForge processes detected",
            console=True
        )

    # Adopt monitor if a main process was found
    if (
        state.running_process is not None
        and state.monitor_process is None
        and not getattr(state, 'is_optimizer', False)
    ):
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = proc.info.get('cmdline') or []
                # BUG-10 fix: use exact token match instead of substring on joined string
                if (
                    "plot_chains.py" in cmdline
                    and _cmdline_contains_exact_arg(cmdline, state.active_yaml_path)
                ):
                    state.monitor_process = AdoptedProcess(proc.info['pid'])
                    backend.log_dashboard_error(
                        f"✅ Adopted running Monitor process: PID {proc.info['pid']}",
                        console=True
                    )
                    break
            except Exception:
                pass

        # Auto-spawn monitor if missing and not intentionally stopped
        if (
            state.monitor_process is None
            and not getattr(state, 'intentionally_stopped', False)
        ):
            # BUG-06 fix: use shared _spawn_monitor() helper
            _spawn_monitor(state, backend)


async def background_process_watcher():
    """Long-running asyncio task that polls the Cobaya/optimizer process every 5s.

    State mutation notes (BUG-07, BUG-08):
    - All mutations to `state` go through _state_lock to prevent races with
      concurrent HTTP request handlers reading state simultaneously.
    - monitor_restart_attempts is reset to 0 when the main process finishes
      normally. If background_process_watcher itself crashes (outer except),
      the counter survives and continues from its last value on the next
      iteration — this is acceptable and intentional (prevents infinite restart
      loops even across watcher restarts).
    """
    # BUG-09 fix: cache backend once for the lifetime of this task
    backend = _get_backend()
    state = getattr(backend, 'state')
    lock = _get_state_lock()

    if not hasattr(state, 'monitor_restart_attempts'):
        state.monitor_restart_attempts = 0
    MONITOR_RESTART_LIMIT = 3

    while True:
        try:
            # BUG-08 fix: guard all state mutations with the lock
            async with lock:
                if not state.running_process:
                    find_and_adopt_running_cobaya()

                if state.running_process:
                    if state.running_process.poll() is None:
                        # Process is still alive
                        state.current_status = "running"
                        try:
                            if (
                                state.monitor_process
                                and getattr(state.monitor_process, 'poll', lambda: 0)() is not None
                            ):
                                state.monitor_process = None
                                state.monitor_restart_attempts = (
                                    getattr(state, 'monitor_restart_attempts', 0) + 1
                                )
                                if (
                                    state.monitor_restart_attempts <= MONITOR_RESTART_LIMIT
                                    and not getattr(state, 'intentionally_stopped', False)
                                ):
                                    # BUG-06 fix: use shared _spawn_monitor() helper
                                    _spawn_monitor(state, backend)
                                    if state.monitor_process:
                                        backend.log_dashboard_error(
                                            f"Watchdog: Respawned monitor "
                                            f"(attempt {state.monitor_restart_attempts}) "
                                            f"PID {state.monitor_process.pid}"
                                        )
                                else:
                                    alert = {
                                        "parameter": "Monitor Restart Failure",
                                        "status": (
                                            f"Monitor died {state.monitor_restart_attempts} times"
                                        ),
                                        "suggestion": (
                                            "Investigate monitor/plot_chains.py or check "
                                            "disk/permissions. Manual restart required."
                                        ),
                                    }
                                    if not any(
                                        isinstance(a, dict) and a.get('status') == alert['status']
                                        for a in state.watchdog_alerts
                                    ):
                                        state.watchdog_alerts.append(alert)
                        except Exception as exc:
                            logger.debug("Monitor watchdog check error: %s", exc)

                    else:
                        # Process has exited (poll() returned 0)
                        state.current_status = backend.classify_finished_run_status(
                            state.running_process.returncode, state.active_output_prefix
                        )
                        crash_msg = backend.detect_run_crash_in_log(
                            f"{state.active_output_prefix}.log"
                            if state.active_output_prefix
                            else None
                        )
                        if crash_msg:
                            backend.log_dashboard_error(
                                f"[RUN FAILED] {crash_msg}", console=True
                            )
                            crash_alert = {
                                "parameter": "Run Failure",
                                "status": crash_msg,
                                "suggestion": (
                                    "Check the log file for details and fix the underlying issue."
                                ),
                            }
                            if not any(
                                isinstance(a, dict) and a.get("status") == crash_msg
                                for a in state.watchdog_alerts
                            ):
                                state.watchdog_alerts.append(crash_alert)

                        backend.log_run_to_db(
                            state.active_yaml_path or "",
                            getattr(state, 'model_type', 'general'),
                            state.current_status,
                            state.active_output_prefix,
                        )
                        if state.current_status == "completed" and "lcdm" in (
                            state.active_output_prefix or ""
                        ).lower():
                            try:
                                backend.auto_archive_lcdm()
                            except Exception as exc:
                                backend.log_dashboard_error(
                                    f"Background auto-archiving LCDM completed run failed: {exc}"
                                )

                        state.running_process = None
                        state.intentionally_stopped = False
                        # BUG-07: reset here so next run starts fresh.
                        # If the watcher itself crashes before this point,
                        # the counter retains its value — acceptable, prevents
                        # infinite restart loops across watcher restarts.
                        state.monitor_restart_attempts = 0

                        # Broadcast completion outside the lock to avoid holding it
                        # during potentially slow network/disk operations
            # --- outside the lock ---
            if state.running_process is None and state.current_status in (
                "completed", "failed", "crashed"
            ):
                try:
                    current = await backend.get_status()
                    await backend.manager.broadcast(
                        {"type": "status_update", "data": current}
                    )
                    await backend.send_notification(
                        "run_completed",
                        {"status": state.current_status, "prefix": state.active_output_prefix},
                    )
                except Exception as exc:
                    logger.debug("Post-completion broadcast error: %s", exc)

        except Exception as exc:
            try:
                backend.log_dashboard_error(
                    f"Error in background_process_watcher: {exc}"
                )
                alert = {
                    "parameter": "Watchdog Error",
                    "status": str(exc),
                    "suggestion": "Check backend logs.",
                }
                if not any(
                    isinstance(a, dict) and a.get('status') == alert['status']
                    for a in state.watchdog_alerts
                ):
                    state.watchdog_alerts.append(alert)
            except Exception:
                pass

        await asyncio.sleep(5)
