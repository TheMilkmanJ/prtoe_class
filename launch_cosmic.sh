#!/usr/bin/env bash
# =============================================================================
#  CosmicDashboard — Robust Launcher
#  • Auto-starts the FastAPI backend (cosmo_dashboard_backend.py)
#  • Auto-starts a localtunnel for phone/remote access (with health monitoring + auto-restart on drops)
#  • Injects the tunnel URL directly into the backend via /api/set_tunnel_url (and writes chains/current_phone_url.txt)
#  • Restarts either service automatically if it crashes
#  • Opens the dashboard in the browser on launch
#  • Supports LT_SUBDOMAIN=foo for attempting a memorable https://foo.loca.lt
#  • The in-app 📱 controls + manual set make the phone link resilient even when localtunnel flakes (as it often does)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_SCRIPT="$SCRIPT_DIR/scripts/cosmo_dashboard_backend.py"
BACKEND_URL="http://localhost:8000"
BACKEND_LOG="$SCRIPT_DIR/chains/dashboard_backend.log"
TUNNEL_LOG="$SCRIPT_DIR/chains/dashboard_tunnel.log"
PORT=8000
RESTART_DELAY=5   # seconds to wait before restarting a crashed service

# Set Python path to prtoe_gold conda environment directly to avoid shell function activation crashes
PYTHON=""
for _env in prtoe_gold pgtoe_gold; do
  for _root in "/home/themilkmanj/miniconda3" "$HOME/miniconda3" "$HOME/anaconda3"; do
    if [ -f "${_root}/envs/${_env}/bin/python3" ]; then
      PYTHON="${_root}/envs/${_env}/bin/python3"
      break 2
    fi
  done
done
if [ -z "$PYTHON" ] && command -v conda &>/dev/null; then
    PYTHON=$(conda run -n prtoe_gold --no-capture-output python3 2>/dev/null \
      || conda run -n pgtoe_gold --no-capture-output python3 2>/dev/null \
      || command -v python3 || command -v python)
elif [ -z "$PYTHON" ] && [ -n "${CONDA_PREFIX:-}" ]; then
    PYTHON="${CONDA_PREFIX}/bin/python3"
else
    PYTHON=$(command -v python3 || command -v python)
    # Add ~/.local/bin to PATH for pip-installed packages when not using conda
    export PATH="$HOME/.local/bin:${PATH}"
fi
# Cobaya/PolyChord must use the same conda env for python AND mpirun (mixed MPI = instant segfault).
export DASHBOARD_PYTHON="$PYTHON"
_CONDA_BIN="$(dirname "$PYTHON")"
_CONDA_LIB="$(dirname "$_CONDA_BIN")/lib"
export PATH="$_CONDA_BIN:$PATH"
# if [ -d "$_CONDA_LIB" ]; then
#     export LD_LIBRARY_PATH="$_CONDA_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# fi
NPX=$(command -v npx || true)

mkdir -p "$SCRIPT_DIR/chains"

# ---------------------------------------------------------------------------
# Interactive launch configuration prompts (WSL/Linux/Mac compatible)
# ---------------------------------------------------------------------------
if [ -t 0 ]; then
    echo "==========================================================================="
    echo " COSMICDASHBOARD LAUNCH CONFIGURATION"
    echo "==========================================================================="
    
    # Subdomain prompt (fully optional)
    read -r -p " Enter LT_SUBDOMAIN (optional, press Enter for random): " input_subdomain
    export LT_SUBDOMAIN="${input_subdomain:-${LT_SUBDOMAIN:-}}"
    
    # Username prompt (defaults to admin)
    default_user="${DASHBOARD_USER:-admin}"
    read -r -p " Enter DASHBOARD_USER [$default_user]: " input_user
    export DASHBOARD_USER="${input_user:-$default_user}"
    
    # Password prompt (defaults to generating a random password)
    default_pass="${DASHBOARD_PASS:-}"
    if [ -n "$default_pass" ]; then
        read -r -p " Enter DASHBOARD_PASS [$default_pass]: " input_pass
        export DASHBOARD_PASS="${input_pass:-$default_pass}"
    else
        read -r -p " Enter DASHBOARD_PASS (press Enter for random): " input_pass
        export DASHBOARD_PASS="${input_pass:-}"
    fi
    
    echo "==========================================================================="
    echo ""
fi

# ---------------------------------------------------------------------------
# Dashboard HTTP Basic Auth credentials (prevents repeated login prompts)
# ---------------------------------------------------------------------------
# If the user has not exported DASHBOARD_PASS, generate ONE stable password
# for the lifetime of this launcher session and export it. The backend child
# process (and any watcher restarts) will inherit it and skip its own random
# generation. The same value is used by the health-check curls below.
if [ -z "${DASHBOARD_PASS:-}" ]; then
    DASHBOARD_PASS=$(python3 -c "
import secrets, string
# Use a shorter, user-friendly random password (alphanum + safe symbols)
alphabet = string.ascii_letters + string.digits + '-_'
print(''.join(secrets.choice(alphabet) for _ in range(12)))
")
    echo "==========================================================================="
    echo " COSMICDASHBOARD LOGIN CREDENTIALS (stable for this launcher run)"
    echo ""
    echo "   Username : ${DASHBOARD_USER:-admin}"
    echo "   Password : $DASHBOARD_PASS"
    echo ""
    echo "   (Enter these when your browser prompts for login.)"
    echo "   To use your own fixed password every time, run before the launcher:"
    echo "     export DASHBOARD_USER=yourname"
    echo "     export DASHBOARD_PASS=your-memorable-password"
    echo ""
    echo "   Credentials also written to chains/dashboard_credentials.txt"
    echo "==========================================================================="
    echo "$DASHBOARD_PASS" > "$SCRIPT_DIR/chains/dashboard_credentials.txt"
    chmod 600 "$SCRIPT_DIR/chains/dashboard_credentials.txt" 2>/dev/null || true
fi

export DASHBOARD_USER="${DASHBOARD_USER:-admin}"
export DASHBOARD_PASS
export DASHBOARD_WORKSPACE_ROOT="${DASHBOARD_WORKSPACE_ROOT:-$(pwd)}"

# ---------------------------------------------------------------------------
# Cleanup: kill background workers on exit
# ---------------------------------------------------------------------------
BACKEND_PID=""
TUNNEL_PID=""
BACKEND_WATCHER_PID=""
TUNNEL_WATCHER_PID=""
SHUTDOWN=0
SHUTDOWN_FLAG="$SCRIPT_DIR/chains/.launcher_shutdown"
BACKEND_PID_FILE="$SCRIPT_DIR/chains/dashboard_backend.pid"

kill_workspace_cobaya() {
    # Detached mpirun/Cobaya trees ignore launcher Ctrl+C unless we kill them explicitly.
    local pattern
    for pattern in \
        "mpirun.*cobaya run" \
        "cobaya run.*${SCRIPT_DIR}" \
        "plot_chains.py.*${SCRIPT_DIR}"; do
        pkill -TERM -f "$pattern" 2>/dev/null || true
    done
    sleep 0.4
    for pattern in "mpirun.*cobaya run" "cobaya run.*${SCRIPT_DIR}"; do
        pkill -KILL -f "$pattern" 2>/dev/null || true
    done
}

cleanup() {
    SHUTDOWN=1
    touch "$SHUTDOWN_FLAG" 2>/dev/null || true
    echo ""
    echo "[CosmicDashboard] Shutting down..."

    kill_workspace_cobaya

    if [ -f "$BACKEND_PID_FILE" ]; then
        bp="$(cat "$BACKEND_PID_FILE" 2>/dev/null || true)"
        if [ -n "${bp:-}" ]; then
            kill -TERM "$bp" 2>/dev/null || true
        fi
    fi

    [ -n "$BACKEND_WATCHER_PID" ] && kill -TERM "$BACKEND_WATCHER_PID" 2>/dev/null || true
    [ -n "$TUNNEL_WATCHER_PID"  ] && kill -TERM "$TUNNEL_WATCHER_PID"  2>/dev/null || true
    [ -n "$TUNNEL_PID"  ]         && kill -TERM "$TUNNEL_PID"   2>/dev/null || true

    # Any other background jobs started from this shell (browser opener, etc.)
    for job_pid in $(jobs -p 2>/dev/null); do
        kill -TERM "$job_pid" 2>/dev/null || true
    done

    sleep 0.4

    if [ -f "$BACKEND_PID_FILE" ]; then
        bp="$(cat "$BACKEND_PID_FILE" 2>/dev/null || true)"
        if [ -n "${bp:-}" ]; then
            kill -KILL "$bp" 2>/dev/null || true
        fi
    fi
    [ -n "$BACKEND_WATCHER_PID" ] && kill -KILL "$BACKEND_WATCHER_PID" 2>/dev/null || true
    [ -n "$TUNNEL_WATCHER_PID"  ] && kill -KILL "$TUNNEL_WATCHER_PID"  2>/dev/null || true
    [ -n "$TUNNEL_PID"  ]         && kill -KILL "$TUNNEL_PID"  2>/dev/null || true

    fuser -k "${PORT}/tcp" 2>/dev/null || true

    rm -f "$SHUTDOWN_FLAG" "$BACKEND_PID_FILE" 2>/dev/null || true
    echo "[CosmicDashboard] Goodbye."
    exit 0
}
trap cleanup SIGINT SIGTERM

# ---------------------------------------------------------------------------
# Wait for the backend to respond (with timeout)
# ---------------------------------------------------------------------------
wait_for_backend() {
    local timeout_sec="${1:-120}"
    local deadline=$((SECONDS + timeout_sec))
    while [ $SECONDS -lt $deadline ]; do
        # Use a highly reliable Python socket check instead of curl to avoid curl dependency or auth issues (Security/Portability Fix)
        if "$DASHBOARD_PYTHON" -c "import socket; s = socket.socket(); s.settimeout(1.5); s.connect(('127.0.0.1', 8000))" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

# ---------------------------------------------------------------------------
# Start / restart the backend in a loop (watchdog)
# ---------------------------------------------------------------------------
run_backend_watcher() {
    while [ ! -f "$SHUTDOWN_FLAG" ]; do
        echo "[Backend] Starting cosmo_dashboard_backend.py..."
        "$PYTHON" "$BACKEND_SCRIPT" \
            >> "$BACKEND_LOG" 2>&1 &
        BACKEND_PID=$!
        echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
        echo "[Backend] PID=$BACKEND_PID  (log: $BACKEND_LOG)"
        wait "$BACKEND_PID" 2>/dev/null || true
        rm -f "$BACKEND_PID_FILE"
        [ -f "$SHUTDOWN_FLAG" ] && break
        echo "[Backend] Process exited. Restarting in ${RESTART_DELAY}s..."
        sleep "$RESTART_DELAY"
    done
}

# ---------------------------------------------------------------------------
# Parse / push the localtunnel URL to the backend (called by watcher)
# Also writes to chains/current_phone_url.txt for easy manual access (cat that file)
# ---------------------------------------------------------------------------
push_tunnel_url() {
    local url="$1"
    if [ -z "$url" ]; then return 1; fi
    # Always write the file as fallback (backend will read it if push fails)
    echo "$url" > "$SCRIPT_DIR/chains/current_phone_url.txt" 2>/dev/null || true
    # Retry a few times in case the backend isn't quite ready yet
    for _ in 1 2 3 4 5; do
        local result
        result=$(curl -s --max-time 5 \
            -u "${DASHBOARD_USER:-}:${DASHBOARD_PASS:-}" \
            -X POST "$BACKEND_URL/api/set_tunnel_url" \
            -H "Content-Type: application/json" \
            -d "{\"url\": \"$url\"}" 2>&1)
        if echo "$result" | grep -q '"status":"success"'; then
            echo "[Tunnel] URL pushed to backend: $url"
            return 0
        fi
        sleep 2
    done
    echo "[Tunnel] Warning: could not push URL to backend (backend may still be starting) -- file fallback is available"
}

# ---------------------------------------------------------------------------
# Start / restart localtunnel in a loop (watchdog) - made more robust against common drops
# ---------------------------------------------------------------------------
run_tunnel_watcher() {
    if [ -z "$NPX" ]; then
        echo "[Tunnel] npx not found — phone link unavailable. Install Node.js to enable."
        return
    fi

    while [ ! -f "$SHUTDOWN_FLAG" ]; do
        echo "[Tunnel] Starting localtunnel on port $PORT..."
        # Clear any stale URL first
        curl -s --max-time 5 \
            -u "${DASHBOARD_USER:-}:${DASHBOARD_PASS:-}" \
            -X POST "$BACKEND_URL/api/set_tunnel_url" \
            -H "Content-Type: application/json" \
            -d '{"url": ""}' >/dev/null 2>&1 || true
        : > "$SCRIPT_DIR/chains/current_phone_url.txt" 2>/dev/null || true

        # Start localtunnel (append everything to log). Support optional stable subdomain via LT_SUBDOMAIN=foo
        local subdomain_flag=""
        if [ -n "${LT_SUBDOMAIN:-}" ]; then
            subdomain_flag="--subdomain ${LT_SUBDOMAIN}"
            echo "[Tunnel] Using requested subdomain: ${LT_SUBDOMAIN}.loca.lt (may be taken)"
        fi

        npx localtunnel --port "$PORT" $subdomain_flag >>"$TUNNEL_LOG" 2>&1 &
        TUNNEL_PID=$!
        echo "[Tunnel] localtunnel client PID=$TUNNEL_PID (log: $TUNNEL_LOG)"

        # Poll recent log output for the "your url is ..." line (more reliable than live fifo pipe)
        local found_url=""
        for _ in $(seq 1 25); do
            sleep 1
            # Extract the most recent .loca.lt URL from the log (localtunnel prints "your url is: https://...")
            found_url=$(tail -n 100 "$TUNNEL_LOG" 2>/dev/null | grep -oE 'https?://[a-zA-Z0-9-]+\.loca\.lt' | tail -1 || true)
            if [ -n "$found_url" ]; then
                push_tunnel_url "$found_url"
                break
            fi
        done

        if [ -z "$found_url" ]; then
            echo "[Tunnel] Did not see URL in log yet; will keep monitoring while process runs..."
            echo "[Tunnel] Tip: You can also run 'npx localtunnel --port $PORT' in another terminal and use the 📱sync button in the dashboard UI to paste the URL manually."
        fi

        # While the localtunnel client is alive, periodically health-check the published URL.
        # loca.lt tunnels frequently drop silently; this forces a clean restart.
        # Also periodically re-grep log and re-push URL (in case of restart inside tunnel or missed initial).
        local health_fails=0
        local recheck_count=0
        while kill -0 "$TUNNEL_PID" 2>/dev/null; do
            sleep 20
            recheck_count=$((recheck_count + 1))
            if [ -n "$found_url" ]; then
                # -I succeeds (gets headers) as long as the tunnel is forwarding HTTP, even if backend requires auth (401 is fine)
                if curl -s --max-time 6 -I "$found_url" >/dev/null 2>&1; then
                    health_fails=0
                else
                    health_fails=$((health_fails + 1))
                    echo "[Tunnel] Health check #$health_fails failed for $found_url"
                    if [ $health_fails -ge 3 ]; then
                        echo "[Tunnel] Tunnel looks dead from outside — killing client to trigger restart..."
                        kill "$TUNNEL_PID" 2>/dev/null || true
                        sleep 1
                        break
                    fi
                fi
            fi
            # Every ~3 minutes (9 cycles), re-scan log for URL (in case localtunnel re-announced) and re-push
            if [ $((recheck_count % 9)) -eq 0 ]; then
                local latest_url
                latest_url=$(tail -n 50 "$TUNNEL_LOG" 2>/dev/null | grep -oE 'https?://[a-zA-Z0-9-]+\.loca\.lt' | tail -1 || true)
                if [ -n "$latest_url" ] && [ "$latest_url" != "$found_url" ]; then
                    echo "[Tunnel] Detected updated URL in log: $latest_url"
                    found_url="$latest_url"
                    push_tunnel_url "$found_url"
                elif [ -n "$found_url" ]; then
                    # Re-affirm the current one (helps if backend restarted)
                    push_tunnel_url "$found_url" >/dev/null 2>&1 || true
                fi
            fi
        done

        wait "$TUNNEL_PID" 2>/dev/null || true
        TUNNEL_PID=""
        [ -f "$SHUTDOWN_FLAG" ] && break
        echo "[Tunnel] localtunnel exited. Clearing URL + restarting in ${RESTART_DELAY}s..."
        # Ensure backend + file are cleared
        curl -s --max-time 5 \
            -u "${DASHBOARD_USER:-}:${DASHBOARD_PASS:-}" \
            -X POST "$BACKEND_URL/api/set_tunnel_url" \
            -H "Content-Type: application/json" \
            -d '{"url": ""}' >/dev/null 2>&1 || true
        : > "$SCRIPT_DIR/chains/current_phone_url.txt" 2>/dev/null || true
        sleep "$RESTART_DELAY"
    done
}

# ---------------------------------------------------------------------------
# Open browser
# ---------------------------------------------------------------------------
open_browser() {
    if wait_for_backend 45; then
        echo "[Browser] Dashboard is up — opening $BACKEND_URL"
        # WSL: open in Windows default browser
        if command -v powershell.exe &>/dev/null; then
            powershell.exe Start-Process "$BACKEND_URL" &
        elif command -v cmd.exe &>/dev/null; then
            cmd.exe /c start "" "$BACKEND_URL" &
        elif command -v xdg-open &>/dev/null; then
            xdg-open "$BACKEND_URL" &
        elif command -v open &>/dev/null; then
            open "$BACKEND_URL" &
        else
            echo "[Browser] Could not detect a browser opener. Navigate to $BACKEND_URL manually."
        fi
    else
        echo "[Browser] Backend did not start in time — skipping auto-open. Navigate to $BACKEND_URL manually."
    fi
}

# ---------------------------------------------------------------------------
# Check if backend is already running; if so, just open the browser
# ---------------------------------------------------------------------------
echo "==================================================="
echo "       CosmicDashboard — Robust Launcher"
echo "==================================================="
echo ""

rm -f "$SHUTDOWN_FLAG" "$BACKEND_PID_FILE" 2>/dev/null || true

if wait_for_backend 3 2>/dev/null || curl -s --max-time 1 "$BACKEND_URL/api/health" >/dev/null 2>&1 || curl -s --max-time 1 -u "${DASHBOARD_USER:-admin}:${DASHBOARD_PASS}" "$BACKEND_URL/api/status" >/dev/null 2>&1; then
    echo "[Backend] Already running at $BACKEND_URL"
    open_browser
else
    # Kill any stale backend on our port first
    fuser -k "${PORT}/tcp" 2>/dev/null || true
    sleep 1

    # Start the backend watchdog in background
    run_backend_watcher &
    BACKEND_WATCHER_PID=$!

    # Open the browser once the backend is ready
    open_browser
fi

# Start the tunnel watchdog in background
run_tunnel_watcher &
TUNNEL_WATCHER_PID=$!

echo ""
echo "[CosmicDashboard] All services running. Press Ctrl+C to stop."
echo "  Dashboard:  $BACKEND_URL"
echo "  Backend log: $BACKEND_LOG"
echo "  Tunnel log:  $TUNNEL_LOG"
echo "  Current phone URL (if active): chains/current_phone_url.txt  (or use the 📱 button in UI)"
echo ""
echo "  Tip: To get a stable-ish phone URL, run with:  LT_SUBDOMAIN=yourname ./launch_cosmic.sh"
echo "       (then your link will be https://yourname.loca.lt — note: may collide on free service)"
echo "  If the phone pill in dashboard header isn't appearing or link is dead: click the always-visible 📱sync button to paste from another 'npx localtunnel --port 8000' terminal, or the backend now falls back to the .txt file."
echo ""

# Block until watchers exit (Ctrl+C runs cleanup trap).
if [ -n "${BACKEND_WATCHER_PID:-}" ]; then
    wait "$BACKEND_WATCHER_PID" 2>/dev/null || true
fi
if [ -n "${TUNNEL_WATCHER_PID:-}" ]; then
    wait "$TUNNEL_WATCHER_PID" 2>/dev/null || true
fi
