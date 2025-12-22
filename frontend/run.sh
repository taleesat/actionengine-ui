#!/usr/bin/bash

export AZURE_OPENAI_ENDPOINT="https://actionengine-aoai-west.openai.azure.com/"
export AZURE_OPENAI_API_VERSION="2025-03-01-preview"
export AZURE_OPENAI_TEXT_MODEL="azure/gpt-4o-2"
export AZURE_SCOPE="https://cognitiveservices.azure.com/.default"
export DEPLOYMENT="local"
export MULTI_PLAYWRIGHT_SERVER_ADDRESS="localhost" # IP address of the browser server
export MULTI_PLAYWRIGHT_SERVER_PORT="3000" # Port of the browser server
export MCPSTUDIO_UI_PORT="8000" # Port to be opend
export TS_STAGEHAND_SERVER_ADDRESS="localhost"
export TS_STAGEHAND_SERVER_PORT="3000"
magentic ui --host 0.0.0.0 --port $MCPSTUDIO_UI_PORT --config config.yaml
