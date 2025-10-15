# api/ws.py
import asyncio
import base64
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
                if content:
                    app_graph = AppGraph.model_validate(content)
                    return app_graph.model_dump()
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

async def read_latest_screenshot_data(screenshot_dir: str) -> Optional[str]:
    """
    Read the latest screenshot from the screenshot directory.
    Files are in format {timestamp}.jpg and {timestamp}_annotated.jpg
    We ignore annotated ones and return the latest non-annotated screenshot.
    """
    try:
        if not os.path.exists(screenshot_dir):
            return None
            
        # List all jpg files in the directory
        screenshot_files = []
        for filename in os.listdir(screenshot_dir):
            if filename.endswith('.jpg') and not filename.endswith('_annotated.jpg'):
                screenshot_files.append(filename)
        
        if not screenshot_files:
            return None
            
        # Sort by timestamp (filename without extension)
        screenshot_files.sort(key=lambda x: x.replace('.jpg', ''), reverse=True)
        
        # Return the latest screenshot file path
        latest_file = screenshot_files[0]
        return os.path.join(screenshot_dir, latest_file)
        
    except Exception as e:
        logger.error(f"Error reading latest screenshot from {screenshot_dir}: {str(e)}")
        return None

async def monitor_crawler(session_id: str, websocket: WebSocket):
    """Monitor the crawler and send updates every second"""
    logger.info(f"Starting monitoring for session {session_id}")

    session_data = crawler_sessions.get(session_id)
    if not session_data:
        logger.error(f"No session data found for session {session_id}, stopping monitoring")
        return

    output_file = session_data.get('output_file')
    screenshot_dir = session_data.get('screenshot_dir')
    action_statistic_file = session_data.get('action_statistic_file')
    
    # Track what has been sent to avoid duplicates
    sent_results = {
        "atoms": [],
        "trajectories": []
    }

    sent_screenshots = set()
    
    try:
        while True:
            if websocket.client_state != websocket.client_state.CONNECTED:
                logger.info(f"WebSocket disconnected for session {session_id}, stopping monitoring")
                break

            # Read and send screenshot updates
            latest_screenshot_file = await read_latest_screenshot_data(screenshot_dir)
            if latest_screenshot_file and latest_screenshot_file not in sent_screenshots:
                try:
                    # Read the screenshot file and encode it as base64
                    with open(latest_screenshot_file, 'rb') as f:
                        image_data = f.read()
                    
                    # Encode as base64
                    base64_data = base64.b64encode(image_data).decode('utf-8')
                    
                    # Create data URI format (data:image/jpg;base64,...)
                    image_url = f"data:image/jpeg;base64,{base64_data}"
                    
                    filename = os.path.basename(latest_screenshot_file)
                    screenshot_message = {
                        "type": "screenshot",
                        "session": session_id,
                        "image_url": image_url
                    }
                    await websocket.send_json(screenshot_message)
                    sent_screenshots.add(latest_screenshot_file)
                    logger.info(f"Sent screenshot update for session {session_id}: {filename}")
                except Exception as e:
                    logger.error(f"Error sending screenshot for session {session_id}: {str(e)}")

            # Read and send action statistic file
            try:
                if os.path.exists(action_statistic_file):
                    with open(action_statistic_file, 'r', encoding='utf-8') as f:
                        stats_data = json.load(f)
                        
                    # Extract counts from the statistics data
                    num_visited_urls = len(stats_data.get('visited_urls', []))
                    num_crawled_urls = len(stats_data.get('crawled_urls', []))
                    num_crawled_ui_elements = len(stats_data.get('crawled_ui_elements', []))
                    
                    # Send statistics message
                    stats_message = {
                        "type": "statistic",
                        "session": session_id,
                        "num_visited_urls": num_visited_urls,
                        "num_crawled_urls": num_crawled_urls,
                        "num_crawled_ui_elements": num_crawled_ui_elements
                    }
                    await websocket.send_json(stats_message)
                    #logger.info(f"Sent statistics update for session {session_id}: {num_visited_urls} visited, {num_crawled_urls} crawled, {num_crawled_ui_elements} UI elements")
            except Exception as e:
                logger.error(f"Error reading action statistics file for session {session_id}: {str(e)}")

            # Read and send output file updates
            app_graph_data = await read_output_file(output_file)
            if app_graph_data:
                update_result = format_update_result(app_graph_data)
                
                # Check for new atoms
                new_atoms = []
                current_atoms = update_result.get("atoms", [])
                for atom in current_atoms:
                    if atom not in sent_results["atoms"]:
                        new_atoms.append(atom)
                        sent_results["atoms"].append(atom)
                
                # Check for new trajectories
                new_trajectories = []
                current_trajectories = update_result.get("trajectories", [])
                for trajectory in current_trajectories:
                    if trajectory not in sent_results["trajectories"]:
                        new_trajectories.append(trajectory)
                        sent_results["trajectories"].append(trajectory)
                
                # Only send update if there are new results
                if new_atoms or new_trajectories:
                    update_message = {
                        "type": "update_result",
                        "session": session_id,
                        "atoms": new_atoms,
                        "trajectories": new_trajectories
                    }
                    try:
                        await send_message(websocket, update_message)
                        logger.info(f"Sent {len(new_atoms)} new atoms and {len(new_trajectories)} new trajectories for session {session_id}")
                    except Exception as e:
                        logger.error(f"Error sending update for session {session_id}: {str(e)}")
                        break
            
            # Wait 1 second before next update
            await asyncio.sleep(1)

            process = session_data.get('process')
            if process and process.poll() is not None:
                # Process has finished or stopped
                current_status = session_data.get('status')
                if current_status == 'stopped':
                    message = {
                        "type": "status",
                        "status": "stopped",
                        "url": session_data.get('url'),
                        "session": session_id
                    }
                else:
                    session_data['status'] = 'done'
                    message = {
                        "type": "status",
                        "status": "done",
                        "url": session_data.get('url'),
                        "session": session_id
                    }
                await send_message(websocket, message)
                logger.info(f"Crawler process finished for session {session_id}")
                break
    except asyncio.CancelledError:
        logger.info(f"Output monitoring task cancelled for session {session_id}")
        raise
    except Exception as e:
        logger.error(f"Error in output monitoring for session {session_id}: {str(e)}")
    finally:
        logger.info(f"Output monitoring ended for session {session_id}")

async def send_message(websocket: WebSocket, message: Dict[str, Any]):
    """Send a JSON message over the websocket"""
    try:
        logger.info(f"Sending message: {message}")
        await websocket.send_json(message)
    except Exception as e:
        logger.error(f"Error sending message over websocket: {str(e)}")

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
                    message = {
                        "type": "error",
                        "message": "URL is required for start message"
                    }
                    await send_message(websocket, message)
                    continue
                
                if not url.startswith("http://") and not url.startswith("https://"):
                    url = "http://" + url  # Default to http if no scheme provided
                # Generate session and create temp directory
                session_id = generate_session_id()
                temp_dir = create_temp_directory(session_id)
                output_file = os.path.join(temp_dir, "result.yaml")
                
                # Build crawler command
                crawler_command = build_crawler_command(url, output_file)
                
                try:
                    # Start the crawler process
                    env = os.environ.copy()
                    screenshot_dir_path = os.path.join(temp_dir, "screenshot")
                    os.makedirs(screenshot_dir_path, exist_ok=True)
                    env["SCREENSHOT_DIR_PATH"] = screenshot_dir_path
                    log_file_path = os.path.join(temp_dir, "crawler_console.log")
                    action_statistic_file_path = os.path.join(temp_dir, "action_statistics.json")
                    with open(log_file_path, 'w', encoding='utf-8') as log_file:
                        process = subprocess.Popen(
                            crawler_command,
                            stdout=log_file,
                            stderr=subprocess.STDOUT,
                            text=True,
                            cwd=temp_dir,
                            env=env
                        )
                    logger.info(f"Started crawler process PID {process.pid} for URL {url} with session {session_id} via command {' '.join(crawler_command)}; its output will be in {temp_dir}")
                    
                    # Store session data
                    crawler_sessions[session_id] = {
                        "process": process,
                        "status": "running",
                        "url": url,
                        "temp_dir": temp_dir,
                        "screenshot_dir": screenshot_dir_path,
                        "output_file": output_file,
                        "action_statistic_file": action_statistic_file_path,
                        "command": crawler_command
                    }
                    
                    # Send running status
                    message = {
                        "type": "status",
                        "status": "running",
                        "url": url,
                        "session": session_id
                    }
                    await send_message(websocket, message)
                    
                    # Start background monitoring for both logs and output
                    asyncio.create_task(monitor_crawler(session_id, websocket))
                    
                except Exception as e:
                    logger.error(f"Error starting crawler: {str(e)}")
                    message = {
                        "type": "error",
                        "message": f"Failed to start crawler: {str(e)}"
                    }
                    await send_message(websocket, message)
            
            elif message_type == "stop":
                # Handle stop message
                session_id = message.get("session")
                if not session_id:
                    message = {
                        "type": "error",
                        "message": "Session ID is required for stop message"
                    }
                    await send_message(websocket, message)
                    continue
                
                if session_id in crawler_sessions:
                    session_data = crawler_sessions[session_id]
                    process = session_data.get('process')
                    
                    if process:
                        try:
                            process.kill()  # Force kill if doesn't terminate gracefully
                            process.wait()
                            
                            session_data['status'] = 'stopped'
                            
                            message = {
                                "type": "status",
                                "status": "stopped",
                                "url": session_data.get('url'),
                                "session": session_id
                            }
                            await send_message(websocket, message)
                            
                            logger.info(f"Stopped crawler for session {session_id}")
                            
                        except Exception as e:
                            logger.error(f"Error stopping crawler for session {session_id}: {str(e)}")
                            message = {
                                "type": "error",
                                "message": f"Failed to stop crawler: {str(e)}"
                            }
                            await send_message(websocket, message)
                    else:
                        message = {
                            "type": "error",
                            "message": f"No active process found for session {session_id}"
                        }
                        await send_message(websocket, message)
                else:
                    message = { 
                        "type": "error",
                        "message": f"Session {session_id} not found"
                    }
                    await send_message(websocket, message)
            elif message_type == "load":
                # Handle load message
                session_id = message.get("session")
                if not session_id:
                    message = {
                        "type": "error",
                        "message": "Session ID is required for load message"
                    }
                    await send_message(websocket, message)
                    continue
                
                if session_id in crawler_sessions:
                    session_data = crawler_sessions[session_id]
                    status = session_data.get('status', 'unknown')
                    output_file = session_data.get('output_file')
                    screenshot_dir_path = session_data.get('screenshot_dir')
                    url = session_data.get('url')
                    
                    # Send current status
                    message = {
                        "type": "status",
                        "status": status,
                        "url": url,
                        "session": session_id
                    }
                    await send_message(websocket, message)

                    action_statistic_file_path = session_data.get('action_statistic_file')
                    asyncio.create_task(monitor_crawler(session_id, websocket))
                    logger.info(f"Loaded session {session_id} with status {status}")
                    
                else:
                    message = {
                        "type": "error",
                        "message": f"Session {session_id} not found"
                    }
                    await send_message(websocket, message)

            elif message_type == "download":
                # Handle download message
                session_id = message.get("session")
                if not session_id:
                    message = {
                        "type": "error",
                        "message": "Session ID is required for download message"
                    }
                    await send_message(websocket, message)
                    continue
                
                if session_id in crawler_sessions:
                    session_data = crawler_sessions[session_id]
                    output_file = session_data.get('output_file')
                    
                    if output_file and os.path.exists(output_file):
                        try:
                            with open(output_file, 'r', encoding='utf-8') as f:
                                file_content = f.read()
                            
                            message = {
                                "type": "save",
                                "session": session_id,
                                "filename": os.path.basename(output_file),
                                "content": file_content
                            }
                            await send_message(websocket, message)
                            
                            logger.info(f"Sent raw data for session {session_id}")
                            
                        except Exception as e:
                            logger.error(f"Error reading output file for session {session_id}: {str(e)}")
                            message = {
                                "type": "error",
                                "message": f"Failed to read output file: {str(e)}"
                            }
                            await send_message(websocket, message)
                    else:
                        message = {
                            "type": "error",
                            "message": f"Output file not found for session {session_id}"
                        }
                        await send_message(websocket, message)
                else:
                    message = {
                        "type": "error",
                        "message": f"Session {session_id} not found"
                    }
                    await send_message(websocket, message)

            else:
                message = {
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }
                await send_message(websocket, message)
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
                        asyncio.create_task(ws_manager.call_action_engine(run_id, task))
                    else:
                        logger.warning(f"Invalid start message format for run {run_id}")
                        message = {
                            "type": "error",
                            "error": "Invalid start message format",
                            "timestamp": datetime.utcnow().isoformat(),
                        }
                        await websocket.send_json(message)

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
