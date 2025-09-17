# api/ws.py
import os
import io
import asyncio
import json
from datetime import datetime, timedelta, timezone

from azure.identity import DefaultAzureCredential, ManagedIdentityCredential, AzureCliCredential, get_bearer_token_provider
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from loguru import logger
from dotenv import load_dotenv

from stagehand import StagehandConfig
from ai_recorder.shell import AIRecorderShell

from ...datamodel import Run
from ..deps import get_db, get_websocket_manager
from ..managers import WebSocketManager, playwright_manager
from ...utils.utils import construct_task

router = APIRouter()
load_dotenv()

def get_azure_credential():

    MANAGED_IDENTITY = "managed_identity"
    CLI = "cli"
    DEFAULT = "default"

    identity_provider = os.getenv("AZURE_IDENTITY_PROVIDER")
    credential = None
    if not identity_provider:
        logger.info(f"Using default identity provider: {identity_provider!r} (Env var NOT set)")
        identity_provider = DEFAULT
        credential = DefaultAzureCredential()
    elif identity_provider == DEFAULT:
        logger.info("Initializing DefaultAzureCredential (Env var set)")
        credential = DefaultAzureCredential()
    elif identity_provider == MANAGED_IDENTITY:
        logger.info("Initializing ManagedIdentityCredential (Env var set)")
        credential = ManagedIdentityCredential()
    elif identity_provider == CLI:
        logger.info("Initializing AzureCliCredential (Env var set)")
        credential = AzureCliCredential()
    else:  # Default or unrecognized value
        logger.warning(f"Warning: Unrecognized identity provider value: {identity_provider!r}")
        logger.info("Initializing DefaultAzureCredential")
        credential = DefaultAzureCredential()
    return credential

def get_msrhub_token():
    azure_credential = get_azure_credential()
    token = azure_credential.get_token("api://msrhub/.default")
    return token.token

def get_stagehand_config() -> StagehandConfig:
    """Dependency provider for Stagehand configuration"""
    azure_credential = get_azure_credential()
    azure_ad_token_provider = get_bearer_token_provider(
        azure_credential,
        os.getenv("AZURE_SCOPE")
    )
    deployment = os.getenv("DEPLOYMENT", "local")
    modelname = os.getenv("AZURE_OPENAI_TEXT_MODEL")
    if deployment.lower() == "msrhub":
        modelname = f"azure/{modelname}"
    logger.info(f"Using model: {modelname} in deployment: {deployment}")
    config = StagehandConfig(
        model_name=modelname,
        model_api_base=os.getenv("AZURE_OPENAI_ENDPOINT"),
        model_api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
        azure_ad_token_provider=azure_ad_token_provider
    )
    if deployment.lower() == "msrhub":
        config.remote_browser_connect_options = { "headers" : { "Authorization": f"Bearer {get_msrhub_token()}" } }
    return config

@router.websocket("/runs/{run_id}")
async def run_websocket(
    websocket: WebSocket,
    run_id: int,
    ws_manager: WebSocketManager = Depends(get_websocket_manager),
    db=Depends(get_db),
):
    """WebSocket endpoint for run communication"""
    # Verify run exists and is in valid state
    run_response = db.get(Run, filters={"id": run_id}, return_json=False)
    if not run_response.status or not run_response.data:
        logger.warning(f"Run not found: {run_id}")
        await websocket.close(code=4004, reason="Run not found")
        return

    # run = run_response.data[0]
    # if run.status not in [RunStatus.CREATED, RunStatus.ACTIVE]:
    #     await websocket.close(code=4003, reason="Run not in valid state")
    #     return

    # Connect websocket
    connected = await ws_manager.connect(websocket, run_id)
    if not connected:
        await websocket.close(code=4002, reason="Failed to establish connection")
        return

    try:
        logger.info(f"WebSocket connection established for run {run_id}")

        playwright_server: playwright_manager.MultiPlaywrightServer | None = None
        try:
            playwright_server = await playwright_manager.create_multi_playwright_server_from_env()
        except Exception as e:
            logger.error(f"Failed to create Playwright server: {str(e)}")
            await websocket.send_json(
                {
                    "type": "error",
                    "error": "The service reaches the maximum capacity. Please try again later",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            )
            return
        playwright_server.start_server()
        playwright_server_info = playwright_server.build_playwright_info()
        logger.info(f"Playwright server started for run {run_id} on ({playwright_server_info['playwright_endpoint']} and {playwright_server_info['novnc_endpoint']})")
        await asyncio.sleep(2)  # Allow some time for the container to start

        shell_output = io.StringIO()

        def get_custom_stagehand_config():
            stagehand_config: StagehandConfig = get_stagehand_config()
            stagehand_config.env = "REMOTE"
            stagehand_config.remote_browser_ws_endpoint = playwright_server_info["playwright_endpoint"]
            return stagehand_config

        mcpstudio_shell = AIRecorderShell(get_stagehand_config=get_custom_stagehand_config, output=shell_output)
        await mcpstudio_shell._ensure_ai_ready()
        mcpstudio_shell.ai_recorder.set_show_recording_button(False)

        await ws_manager.send_novnc_endpoint(
            run_id,
            playwright_server_info["novnc_endpoint"],
        )

        # Initialize timeout tracking
        timeout_seconds = 120  # 2 minutes
        last_activity = datetime.now(timezone.utc)
        
        while True:
            try:
                # Calculate remaining timeout
                elapsed = datetime.now(timezone.utc) - last_activity
                remaining_timeout = timeout_seconds - elapsed.total_seconds()
                
                if remaining_timeout <= 0:
                    logger.info(f"WebSocket connection timeout for run {run_id} - inactive for 2 minutes")
                    await websocket.send_json(
                        {
                            "type": "timeout",
                            "error": "Connection closed due to inactivity",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                    await websocket.close(code=1000, reason="Inactivity timeout")
                    break
                
                # Wait for message with timeout
                raw_message = await asyncio.wait_for(
                    websocket.receive_text(), 
                    timeout=remaining_timeout
                )
                
                message = json.loads(raw_message)
                logger.debug(f"Received message for run {run_id}: {message}")
                command = message.get("command")

                await ws_manager.execute_mcpstudio_command(
                    run_id, mcpstudio_shell, command
                )

                # Update last activity time
                last_activity = datetime.now(timezone.utc)
            except asyncio.TimeoutError:
                logger.info(f"WebSocket connection timeout for run {run_id} - inactive for 2 minutes")
                await websocket.send_json(
                    {
                        "type": "timeout",
                        "error": "Connection closed due to inactivity",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                )
                await websocket.close(code=1000, reason="Inactivity timeout")
                break
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received: {raw_message}")
                # Update last activity even for invalid messages to prevent timeout on malformed data
                last_activity = datetime.now(timezone.utc)
                await websocket.send_json(
                    {
                        "type": "error",
                        "error": "Invalid message format",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for run {run_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        await ws_manager.disconnect(run_id)
        if playwright_server:
            playwright_server.stop_server()
            await playwright_manager.return_multi_playwright_server(playwright_server)
