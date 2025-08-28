# api/ws.py
import os
import io
import asyncio
import json
from datetime import datetime

from azure.identity import AzureCliCredential, get_bearer_token_provider
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

def get_stagehand_config() -> StagehandConfig:
    """Dependency provider for Stagehand configuration"""
    azure_ad_token_provider = get_bearer_token_provider(
        AzureCliCredential(),
        "https://cognitiveservices.azure.com/.default"
    )
    config = StagehandConfig(
        model_name="azure/gpt-4o-2",
        model_api_base=os.getenv("AZURE_OPENAI_ENDPOINT"),
        model_api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
        azure_ad_token_provider=azure_ad_token_provider
    )
    return config

default_stagehand_config = get_stagehand_config()

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
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )
            return
        playwright_server.start_server()
        logger.info(f"Playwright server started for run {run_id} on ports {playwright_server.playwright_port} and {playwright_server.novnc_port}")
        await asyncio.sleep(2)  # Allow some time for the container to start

        shell_output = io.StringIO()

        def get_custom_stagehand_config():
            stagehand_config: StagehandConfig = get_stagehand_config()
            stagehand_config.env = "REMOTE"
            stagehand_config.remote_browser_ws_endpoint = f"ws://{playwright_server.server_address}:{playwright_server.playwright_port}{playwright_manager.playwright_ws_path}"
            return stagehand_config

        mcpstudio_shell = AIRecorderShell(get_stagehand_config=get_custom_stagehand_config, output=shell_output)
        await mcpstudio_shell._ensure_ai_ready()
        mcpstudio_shell.ai_recorder.set_show_recording_button(False)

        deployment = os.getenv("DEPLOYMENT", "local")
        if deployment.lower() == "msrhub":
            msrhub_default_endpoint = os.getenv("MSRHUB_DEFAULT_ENDPOINT")
            split_address = msrhub_default_endpoint.split(".")
            split_address[0] = f"{split_address[0]}-{playwright_server.novnc_port}"
            playwright_server_address = ".".join(split_address)
            await ws_manager.send_novnc_endpoint(
                run_id,
                playwright_server_address,
                playwright_server.playwright_port,
                443
            )
        else:
            await ws_manager.send_novnc_endpoint(
                run_id,
                playwright_server.server_address,
                playwright_server.playwright_port,
                playwright_server.novnc_port
            )

        while True:
            try:
                raw_message = await websocket.receive_text()
                message = json.loads(raw_message)
                logger.debug(f"Received message for run {run_id}: {message}")
                command = message.get("command")

                await ws_manager.execute_mcpstudio_command(
                    run_id, mcpstudio_shell, command
                )
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received: {raw_message}")
                await websocket.send_json(
                    {
                        "type": "error",
                        "error": "Invalid message format",
                        "timestamp": datetime.utcnow().isoformat(),
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