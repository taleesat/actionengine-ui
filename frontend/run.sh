#!/usr/bin/bash

export SCREEN_WIDTH="1920"
export SCREEN_HEIGHT="1080"
export SCREEN_SCALING_FACTOR="1.0"

export LOG_PROMPTS_LOCATION="prompts"
export USE_PROMPT_CACHE="False"

export REDDIT="http://localhost:9999"
export SHOPPING="http://localhost:7770"
export SHOPPING_ADMIN="http://localhost:7780/admin"
export GITLAB="http://localhost:8023"
export WIKIPEDIA="http://wikipedia.org"
export MAP="http://openstreetmap.org"
export HOMEPAGE="http://homepage.com"

export AZURE_OPENAI_ENDPOINT=${OPENAI_ENDPOINT}
export AZURE_OPEN_AI_DEPLOYMENT_ID=${OPENAI_TEXT_MODEL}

export OPENAI_API_KEY=""
export OPENAI_TEXT_MODEL=${OPENAI_MODEL}
export OPENAI_VISION_MODEL=${OPENAI_MODEL}

export MCPSTUDIO_UI_PORT="8000"
playwright install
xvfb-run magentic ui --host 0.0.0.0 --port $MCPSTUDIO_UI_PORT --config config.yaml
