#!/bin/bash

#BASE_DISPLAY=100
#while true; do
#  DISPLAY=":$BASE_DISPLAY"
#  if ! xdpyinfo -display $DISPLAY >/dev/null 2>&1; then
#    break
#  fi
#  BASE_DISPLAY=$((BASE_DISPLAY + 1))
#done

WS_PATH=ws

BASE_DISPLAY=$1
PLAYWRIGHT_PORT=$2
NOVNC_PORT=$3
X11VNC_PORT=$4

DISPLAY=":$BASE_DISPLAY"

echo "Launching new session on DISPLAY=$DISPLAY"

# Start Xvfb
Xvfb $DISPLAY -screen 0 1440x1440x24 -ac -nolisten tcp &
XVFB_PID=$!

# Start Openbox
DISPLAY=$DISPLAY openbox &
OPENBOX_PID=$!

SCRIPT_DIR="$(dirname "$0")"
DISPLAY=$DISPLAY $SCRIPT_DIR/x11-setup.sh
X11_SETUP_PID=$!

x11vnc -display $DISPLAY -forever -shared -nopw -geometry 1440x1440 -scale 1:1 -nomodtweak -rfbport $X11VNC_PORT &
X11VNC_PID=$!

/usr/local/novnc/utils/novnc_proxy --vnc localhost:$X11VNC_PORT --listen $NOVNC_PORT &
NOVNC_PROXY_PID=$!

# Start Playwright server
SCRIPT_DIR="$(dirname "$0")"
PLAYWRIGHT_SERVER_SCRIPT="$SCRIPT_DIR/playwright-server.js"
DISPLAY=$DISPLAY node $PLAYWRIGHT_SERVER_SCRIPT --port $PLAYWRIGHT_PORT --ws-path $WS_PATH
#PLAYWRIGHT_SERVER_PID=$!

echo "Session started on $DISPLAY"
