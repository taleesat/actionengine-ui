#!/bin/bash

#BASE_DISPLAY=100
#while true; do
#  DISPLAY=":$BASE_DISPLAY"
#  if ! xdpyinfo -display $DISPLAY >/dev/null 2>&1; then
#    break
#  fi
#  BASE_DISPLAY=$((BASE_DISPLAY + 1))
#done

SESS_ID=$1
BASE_DISPLAY=`expr 100 + $SESS_ID \* 3` # SESS_ID is 0-indexed, so 0 -> 100, 1 -> 103, etc.
WS_PATH=/ws

DISPLAY=":$BASE_DISPLAY"
PLAYWRIGHT_PORT=`expr 8900 + $BASE_DISPLAY`
NOVNC_PORT=`expr 8901 + $BASE_DISPLAY`
X11VNC_PORT=`expr 8902 + $BASE_DISPLAY`

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
