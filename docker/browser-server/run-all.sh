#!/usr/bin/bash

node /app/app.js --script /app/launch-session.sh &
magentic ui --host 0.0.0.0 --port $MCPSTUDIO_UI_PORT --config config.yaml
