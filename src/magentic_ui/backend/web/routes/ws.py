# api/ws.py
import asyncio
import json
import os
import subprocess
import tempfile
import uuid
import yaml
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from loguru import logger

from ...datamodel import Run
from ..deps import get_db, get_websocket_manager
from ..managers import WebSocketManager
from ...utils.utils import construct_task
from .appGraph import AppGraph

router = APIRouter()

python_executable = os.environ.get("PYTHON_EXECUTABLE")
app_path = os.environ.get("CRAWLER_APP_PATH")

def build_crawler_command(url: str, output_file: str) -> list[str]:
    cmd = [ python_executable, app_path,
           "--app_url", url,
           "--action_index_path", output_file,
           "--crawl_action", "--crawl_trajectory" ]
    return cmd

# Global session storage - in production, this should be replaced with persistent storage
crawler_sessions: Dict[str, Dict[str, Any]] = {}

def generate_session_id() -> str:
    """Generate a unique session ID"""
    return str(uuid.uuid4())

def create_temp_directory(session_id: str) -> str:
    """Create a temporary directory for the session"""
    temp_dir = os.path.join(tempfile.gettempdir(), f"crawler_session_{session_id}")
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir

async def read_output_file(output_file: str) -> Optional[Dict[str, Any]]:
    """Read and parse the YAML output file"""
    try:
        if os.path.exists(output_file):
            with open(output_file, 'r', encoding='utf-8') as f:
                content = yaml.safe_load(f)
                if content and isinstance(content, dict):
                    return content
    except Exception as e:
        logger.error(f"Error reading output file {output_file}: {str(e)}")
    return None

def format_update_result(app_graph_data: Dict[str, Any]) -> Dict[str, Any]:
    """Format the app graph data into the expected update_result format"""
    try:
        # Extract states with their atoms
        states = []
        if app_graph_data and 'states' in app_graph_data:
            for state in app_graph_data['states']:
                state_data = {
                    "state": state.get('id', ''),
                    "atoms": []
                }
                if 'atoms' in state:
                    for atom in state['atoms']:
                        atom_data = {
                            "id": atom.get('id', ''),
                            "description": atom.get('description', '')
                        }
                        state_data["atoms"].append(atom_data)
                states.append(state_data)

        # Extract trajectories
        trajectories = []
        if app_graph_data and 'trajectories' in app_graph_data:
            for trajectory in app_graph_data['trajectories']:
                traj_data = {
                    "description": trajectory.get('description', ''),
                    "actions": []
                }
                if 'actions' in trajectory:
                    for action in trajectory['actions']:
                        action_desc = action.get('description', action.get('type', ''))
                        traj_data["actions"].append(action_desc)
                trajectories.append(traj_data)

        return {
            "type": "update_result",
            "atoms": states,
            "trajectories": trajectories
        }
    except Exception as e:
        logger.error(f"Error formatting update result: {str(e)}")
        return {
            "type": "update_result",
            "atoms": [],
            "trajectories": []
        }

async def monitor_crawler_output(session_id: str, websocket: WebSocket, output_file: str):
    """Monitor the crawler output file and send updates every second"""
    logger.info(f"Starting output monitoring for session {session_id}")
    
    try:
        while session_id in crawler_sessions:
            session_data = crawler_sessions[session_id]
            
            # Check if process is still running
            if session_data.get('process'):
                try:
                    process = session_data['process']
                    return_code = process.poll()
                    if return_code is not None:
                        # Process has finished
                        logger.info(f"Crawler process finished for session {session_id} with return code {return_code}")
                        session_data['status'] = 'done'
                        await websocket.send_json({
                            "type": "status",
                            "status": "done",
                            "session": session_id
                        })
                        break
                except Exception as e:
                    logger.error(f"Error checking process status for session {session_id}: {str(e)}")
            
            # Read and send output file updates
            app_graph_data = await read_output_file(output_file)
            if app_graph_data:
                update_result = format_update_result(app_graph_data)
                update_result["session"] = session_id
                try:
                    await websocket.send_json(update_result)
                except Exception as e:
                    logger.error(f"Error sending update for session {session_id}: {str(e)}")
                    break
            
            # Wait 1 second before next update
            await asyncio.sleep(1)
            
    except Exception as e:
        logger.error(f"Error in output monitoring for session {session_id}: {str(e)}")
    finally:
        logger.info(f"Output monitoring ended for session {session_id}")

@router.websocket("/crawler")
async def control_crawler(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            logger.info(f"Received message: {message}")
            
            message_type = message.get("type")
            
            if message_type == "start":
                # Handle start message
                url = message.get("url")
                if not url:
                    await websocket.send_json({
                        "type": "error",
                        "message": "URL is required for start message"
                    })
                    continue
                
                # Generate session and create temp directory
                session_id = generate_session_id()
                temp_dir = create_temp_directory(session_id)
                output_file = os.path.join(temp_dir, "result.yaml")
                
                # Build crawler command
                crawler_command = build_crawler_command(url, output_file)
                
                try:
                    # Start the crawler process
                    process = subprocess.Popen(
                        crawler_command,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True
                    )
                    
                    # Store session data
                    crawler_sessions[session_id] = {
                        "process": process,
                        "status": "running",
                        "url": url,
                        "temp_dir": temp_dir,
                        "output_file": output_file,
                        "command": crawler_command
                    }
                    
                    # Send running status
                    await websocket.send_json({
                        "type": "status",
                        "status": "running",
                        "session": session_id
                    })
                    
                    # Start background monitoring
                    asyncio.create_task(monitor_crawler_output(session_id, websocket, output_file))
                    
                    logger.info(f"Started crawler for session {session_id} with URL {url}")
                    
                except Exception as e:
                    logger.error(f"Error starting crawler: {str(e)}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Failed to start crawler: {str(e)}"
                    })
            
            elif message_type == "stop":
                # Handle stop message
                session_id = message.get("session")
                if not session_id:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Session ID is required for stop message"
                    })
                    continue
                
                if session_id in crawler_sessions:
                    session_data = crawler_sessions[session_id]
                    process = session_data.get('process')
                    
                    if process:
                        try:
                            process.terminate()
                            # Wait a bit for graceful termination
                            try:
                                process.wait(timeout=5)
                            except subprocess.TimeoutExpired:
                                process.kill()  # Force kill if doesn't terminate gracefully
                                process.wait()
                            
                            session_data['status'] = 'stopped'
                            
                            await websocket.send_json({
                                "type": "status",
                                "status": "stopped",
                                "session": session_id
                            })
                            
                            logger.info(f"Stopped crawler for session {session_id}")
                            
                        except Exception as e:
                            logger.error(f"Error stopping crawler for session {session_id}: {str(e)}")
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Failed to stop crawler: {str(e)}"
                            })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"No active process found for session {session_id}"
                        })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Session {session_id} not found"
                    })
            
            elif message_type == "load":
                # Handle load message
                session_id = message.get("session")
                if not session_id:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Session ID is required for load message"
                    })
                    continue
                
                if session_id in crawler_sessions:
                    session_data = crawler_sessions[session_id]
                    status = session_data.get('status', 'unknown')
                    output_file = session_data.get('output_file')
                    
                    # Send current status
                    await websocket.send_json({
                        "type": "status",
                        "status": status,
                        "session": session_id
                    })
                    
                    # Send current results if available
                    if output_file:
                        app_graph_data = await read_output_file(output_file)
                        if app_graph_data:
                            update_result = format_update_result(app_graph_data)
                            update_result["session"] = session_id
                            await websocket.send_json(update_result)
                    
                    # If still running, start monitoring again
                    if status == "running":
                        asyncio.create_task(monitor_crawler_output(session_id, websocket, output_file))
                    
                    logger.info(f"Loaded session {session_id} with status {status}")
                    
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Session {session_id} not found"
                    })
            
            elif message_type == "download":
                # Handle download message
                session_id = message.get("session")
                if not session_id:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Session ID is required for download message"
                    })
                    continue
                
                if session_id in crawler_sessions:
                    session_data = crawler_sessions[session_id]
                    output_file = session_data.get('output_file')
                    
                    if output_file and os.path.exists(output_file):
                        try:
                            with open(output_file, 'r', encoding='utf-8') as f:
                                file_content = f.read()
                            
                            await websocket.send_json({
                                "type": "save",
                                "session": session_id,
                                "data": file_content
                            })
                            
                            logger.info(f"Sent raw data for session {session_id}")
                            
                        except Exception as e:
                            logger.error(f"Error reading output file for session {session_id}: {str(e)}")
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Failed to read output file: {str(e)}"
                            })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Output file not found for session {session_id}"
                        })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Session {session_id} not found"
                    })
            
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                })
                logger.warning(f"Unknown message type received: {message_type}")
                
    except WebSocketDisconnect:
        logger.info("Crawler WebSocket disconnected")
        logger.info("Crawler process will continue running in background")
    except Exception as e:
        logger.error(f"WebSocket error in crawler control: {str(e)}")
    finally:
        logger.info("WebSocket cleanup complete, crawler process preserved for session persistence")

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

        while True:
            try:
                raw_message = await websocket.receive_text()
                message = json.loads(raw_message)

                if message.get("type") == "start":
                    # Handle start message
                    logger.info(f"Received start request for run {run_id}")
                    task = construct_task(
                        query=message.get("task"), files=message.get("files")
                    )
                    team_config = message.get("team_config")
                    #settings_config = message.get("settings_config")
                    if task and team_config:
                        # await ws_manager.start_stream(run_id, task, team_config)
                        #asyncio.create_task(ws_manager.start_stream(run_id, task, team_config, settings_config))
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
