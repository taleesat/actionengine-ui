#!/usr/bin/bash


API_DEFAULT="http://${BROWSER_SERVER_ADDRESS}:8082/api"

if [ "${AE_BROWSER_SERVER:-}" = "msrhub" ]; then
  export GATSBY_API_URL="https://${SERVICE_NAME}-${INSTANCE_ID}-8082/api"
else
  export GATSBY_API_URL="$API_DEFAULT"
fi

gatsby clean
gatsby develop -p 8085 -H 0.0.0.0
