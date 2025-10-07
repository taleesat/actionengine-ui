#!/usr/bin/bash

export MCPSTUDIO_UI_PORT="8000"
playwright install
xvfb-run magentic ui --host 0.0.0.0 --port $MCPSTUDIO_UI_PORT --config config.yaml
