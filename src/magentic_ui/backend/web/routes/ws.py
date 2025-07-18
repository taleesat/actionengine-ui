# api/ws.py
import os
import io
import asyncio
import json
from datetime import datetime

from azure.identity import AzureCliCredential, get_bearer_token_provider
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
import litellm
from loguru import logger
from dotenv import load_dotenv

from stagehand import StagehandConfig
from mcpstudio import MCPStudioShell

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

        playwright_server: playwright_manager.DockerPlaywrightServer = await playwright_manager.create_docker_playwright_from_env()
        await playwright_server.create_container()
        await playwright_server.start_container()
        logger.info(f"Playwright server started for run {run_id} on ports {playwright_server.playwright_port} and {playwright_server.novnc_port}")
        await asyncio.sleep(2)  # Allow some time for the container to start

        stagehand_config: StagehandConfig = default_stagehand_config
        shell_output = io.StringIO()
        mcpstudio_shell = MCPStudioShell(output=shell_output)
        await mcpstudio_shell.initialize(
            config=stagehand_config,
            env="REMOTE",
            remote_browser_ws_endpoint=f"ws://{playwright_server.docker_address}:{playwright_server.playwright_port}{playwright_manager.playwright_ws_path}",
        )

        await ws_manager.send_novnc_endpoint(
            run_id,
            playwright_server.docker_address,
            playwright_server.playwright_port,
            playwright_server.novnc_port
        )

        while True:
            try:
                raw_message = await websocket.receive_text()
                message = json.loads(raw_message)
                task = json.loads(message.get("task"))
                logger.debug(f"Received message for run {run_id}: {message}")

                await ws_manager.execute_mcpstudio_command(
                    run_id, mcpstudio_shell, task.get("content")
                )

                """
                if message.get("type") == "start":
                    logger.info(f"Received start request for run {run_id}")
                    task = construct_task(
                        query=message.get("task"), files=message.get("files")
                    )
                    team_config = message.get("team_config")
                    if task and team_config:
                        asyncio.create_task(ws_manager.call_action_engine(run_id, task))
                    else:
                        logger.warning(f"Invalid start message format for run {run_id}")
                        await websocket.send_json(
                            {
                                "type": "error",
                                "error": "Invalid start message format",
                                "timestamp": datetime.utcnow().isoformat(),
                            }
                        )

                elif message.get("type") == "stop":
                    logger.info(f"Received stop request for run {run_id}")
                    reason = message.get("reason") or "User requested stop/cancellation"
                    await ws_manager.stop_run(run_id, reason=reason)
                    break

                elif message.get("type") == "ping":
                    await websocket.send_json(
                        {"type": "pong", "timestamp": datetime.utcnow().isoformat()}
                    )

                elif message.get("type") == "input_response":
                    # Handle input response from client
                    response = message.get("response")
                    if response is not None:
                        await ws_manager.handle_input_response(run_id, response)
                    else:
                        logger.warning(
                            f"Invalid input response format for run {run_id}"
                        )
                elif message.get("type") == "pause":
                    logger.info(f"Received pause request for run {run_id}")
                    await ws_manager.pause_run(run_id)

                elif message.get("type") == "resume":
                    logger.info(f"Received resume request for run {run_id}")
                    await ws_manager.resume_run(run_id)
                """
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
        playwright_server.stop_container()
        await playwright_manager.return_docker_playwright(playwright_server)