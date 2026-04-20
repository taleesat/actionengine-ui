#!/usr/bin/bash

# Set up process group leadership and cleanup
set -e

# Create a new process group
setsid true

WS_PATH=ws

BASE_DISPLAY=$1
PLAYWRIGHT_PORT=$2
NOVNC_PORT=$3
X11VNC_PORT=$4

DISPLAY=":$BASE_DISPLAY"

echo "Launching new session on DISPLAY=$DISPLAY with PID $$"

# Array to track child PIDs for cleanup
CHILD_PIDS=()

# Cleanup function
cleanup() {
    echo "Cleaning up session processes..."
    
    # Kill all child processes
    for pid in "${CHILD_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Terminating process $pid"
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait a bit, then force kill any remaining
    sleep 2
    for pid in "${CHILD_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "Force killing process $pid"
            kill -KILL "$pid" 2>/dev/null || true
        fi
    done
    
    echo "Session cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup EXIT SIGTERM SIGINT SIGHUP

# Start Xvfb
echo "Starting Xvfb on $DISPLAY"
Xvfb $DISPLAY -screen 0 1440x1440x24 -ac -nolisten tcp &
XVFB_PID=$!
CHILD_PIDS+=($XVFB_PID)

# Wait for X server to be ready
sleep 2

# Start Openbox
echo "Starting Openbox"
DISPLAY=$DISPLAY openbox --config-file openbox-rc.xml &
OPENBOX_PID=$!
CHILD_PIDS+=($OPENBOX_PID)

# Run X11 setup
SCRIPT_DIR="$(dirname "$0")"
echo "Running X11 setup"
DISPLAY=$DISPLAY $SCRIPT_DIR/x11-setup.sh &
X11_SETUP_PID=$!
CHILD_PIDS+=($X11_SETUP_PID)

# Start x11vnc
echo "Starting x11vnc on port $X11VNC_PORT"
x11vnc -display $DISPLAY -forever -shared -nopw -geometry 1440x1440 -scale 1:1 -nomodtweak -rfbport $X11VNC_PORT &
X11VNC_PID=$!
CHILD_PIDS+=($X11VNC_PID)

# Start noVNC proxy
echo "Starting noVNC proxy on port $NOVNC_PORT"
/usr/local/novnc/utils/novnc_proxy --vnc localhost:$X11VNC_PORT --listen $NOVNC_PORT &
NOVNC_PROXY_PID=$!
CHILD_PIDS+=($NOVNC_PROXY_PID)

# Start Playwright server (this will be the main process)
echo "Starting Playwright server on port $PLAYWRIGHT_PORT"
SCRIPT_DIR="$(dirname "$0")"
PLAYWRIGHT_SERVER_SCRIPT="$SCRIPT_DIR/playwright-server.js"

echo "Session started on $DISPLAY with PIDs: ${CHILD_PIDS[*]}"

# Run Playwright server in foreground - when this exits, the script exits
DISPLAY=$DISPLAY node $PLAYWRIGHT_SERVER_SCRIPT --port $PLAYWRIGHT_PORT --ws-path $WS_PATH
