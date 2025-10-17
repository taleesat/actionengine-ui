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

def build_action_crawler_command(url: str, index_path: str, output_dir_path: str) -> list[str]:
    cmd = [ python_executable, app_path,
           "--app_url", url,
           "--action_index_path", index_path,
           "--output_dir_path", output_dir_path,
           "--crawl_action",
           ]
    return cmd

def build_trajectory_crawler_command(url: str, index_path: str, output_dir_path: str) -> list[str]:
    cmd = [ python_executable, app_path,
           "--app_url", url,
           "--action_index_path", index_path,
           "--output_dir_path", output_dir_path,
           "--crawl_trajectory",
           ]
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

            # Read and send screenshot updates from both directories
            action_screenshot_dir = session_data.get('action_screenshot_dir')
            trajectory_screenshot_dir = session_data.get('trajectory_screenshot_dir')
            
            action_screenshot_file = await read_latest_screenshot_data(action_screenshot_dir)
            trajectory_screenshot_file = await read_latest_screenshot_data(trajectory_screenshot_dir)
            
            # Check if we have new screenshots from either directory
            new_action_screenshot = action_screenshot_file and action_screenshot_file not in sent_screenshots
            new_trajectory_screenshot = trajectory_screenshot_file and trajectory_screenshot_file not in sent_screenshots
            
            if new_action_screenshot or new_trajectory_screenshot:
                try:
                    screenshot_message = {
                        "type": "screenshot",
                        "session": session_id
                    }
                    
                    # Add action screenshot if available
                    if new_action_screenshot:
                        with open(action_screenshot_file, 'rb') as f:
                            action_image_data = f.read()
                        action_base64_data = base64.b64encode(action_image_data).decode('utf-8')
                        screenshot_message["action_image_url"] = f"data:image/jpeg;base64,{action_base64_data}"
                        sent_screenshots.add(action_screenshot_file)
                        #logger.info(f"Sent action screenshot update for session {session_id}: {os.path.basename(action_screenshot_file)}")
                    
                    # Add trajectory screenshot if available
                    if new_trajectory_screenshot:
                        with open(trajectory_screenshot_file, 'rb') as f:
                            trajectory_image_data = f.read()
                        trajectory_base64_data = base64.b64encode(trajectory_image_data).decode('utf-8')
                        screenshot_message["trajectory_image_url"] = f"data:image/jpeg;base64,{trajectory_base64_data}"
                        sent_screenshots.add(trajectory_screenshot_file)
                        #logger.info(f"Sent trajectory screenshot update for session {session_id}: {os.path.basename(trajectory_screenshot_file)}")
                    
                    await websocket.send_json(screenshot_message)
                except Exception as e:
                    logger.error(f"Error sending screenshot for session {session_id}: {str(e)}")

            # Read and merge statistics from both action and trajectory files
            try:
                trajectory_statistic_file = session_data.get('trajectory_statistic_file')
                
                # Initialize merged data sets
                merged_visited_urls = set()
                merged_crawled_urls = set()
                merged_crawled_ui_elements = set()
                
                # Read action statistics file
                if action_statistic_file and os.path.exists(action_statistic_file):
                    with open(action_statistic_file, 'r', encoding='utf-8') as f:
                        action_stats_data = json.load(f)
                    
                    # Add action data to merged sets (using sets to avoid duplicates)
                    merged_visited_urls.update(action_stats_data.get('visited_urls', []))
                    merged_crawled_urls.update(action_stats_data.get('crawled_urls', []))
                    merged_crawled_ui_elements.update(action_stats_data.get('crawled_ui_elements', []))
                
                # Read trajectory statistics file
                if trajectory_statistic_file and os.path.exists(trajectory_statistic_file):
                    with open(trajectory_statistic_file, 'r', encoding='utf-8') as f:
                        trajectory_stats_data = json.load(f)
                    
                    # Add trajectory data to merged sets (union to avoid duplicates)
                    merged_visited_urls.update(trajectory_stats_data.get('visited_urls', []))
                    merged_crawled_urls.update(trajectory_stats_data.get('crawled_urls', []))
                    merged_crawled_ui_elements.update(trajectory_stats_data.get('crawled_ui_elements', []))

                # Extract counts from the merged data
                num_visited_urls = len(merged_visited_urls)
                num_crawled_urls = len(merged_crawled_urls)
                num_crawled_ui_elements = len(merged_crawled_ui_elements)
                
                # Send combined statistics message
                stats_message = {
                    "type": "statistic",
                    "session": session_id,
                    "num_visited_urls": num_visited_urls,
                    "num_crawled_urls": num_crawled_urls,
                    "num_crawled_ui_elements": num_crawled_ui_elements
                }
                await websocket.send_json(stats_message)
                
            except Exception as e:
                logger.error(f"Error reading statistics files for session {session_id}: {str(e)}")

            # Read and send output file updates from both action and trajectory files
            action_output_file = session_data.get('action_output_file')
            trajectory_output_file = session_data.get('trajectory_output_file')
            
            # Read action output file
            action_app_graph_data = await read_output_file(action_output_file)
            action_new_atoms = []
            if action_app_graph_data:
                action_update_result = format_update_result(action_app_graph_data)
                
                # Check for new atoms from action crawler
                current_action_atoms = action_update_result.get("atoms", [])
                for atom in current_action_atoms:
                    if atom not in sent_results["atoms"]:
                        action_new_atoms.append(atom)
                        sent_results["atoms"].append(atom)
            
            # Read trajectory output file
            trajectory_app_graph_data = await read_output_file(trajectory_output_file)
            trajectory_new_trajectories = []
            if trajectory_app_graph_data:
                trajectory_update_result = format_update_result(trajectory_app_graph_data)
                
                # Check for new trajectories from trajectory crawler
                current_trajectory_trajectories = trajectory_update_result.get("trajectories", [])
                for trajectory in current_trajectory_trajectories:
                    if trajectory not in sent_results["trajectories"]:
                        trajectory_new_trajectories.append(trajectory)
                        sent_results["trajectories"].append(trajectory)
            
            # Send update if there are new results from either crawler
            if action_new_atoms or trajectory_new_trajectories:
                update_message = {
                    "type": "update_result",
                    "session": session_id,
                    "atoms": action_new_atoms,
                    "trajectories": trajectory_new_trajectories
                }
                try:
                    await send_message(websocket, update_message)
                    logger.info(f"Sent {len(action_new_atoms)} new atoms and {len(trajectory_new_trajectories)} new trajectories for session {session_id}")
                except Exception as e:
                    logger.error(f"Error sending update for session {session_id}: {str(e)}")
                    break
            
            # Wait 1 second before next update
            await asyncio.sleep(1)

            # Check both processes for completion
            action_process = session_data.get('action_process')
            trajectory_process = session_data.get('trajectory_process')
            
            action_done = action_process and action_process.poll() is not None
            trajectory_done = trajectory_process and trajectory_process.poll() is not None
            
            # Determine individual process statuses
            current_action_status = session_data.get('action_status', 'running')
            current_trajectory_status = session_data.get('trajectory_status', 'running')
            
            if current_action_status == 'stopped' or current_trajectory_status == 'stopped':
                action_status = 'stopped' if current_action_status == 'stopped' else ('done' if action_done else 'running')
                trajectory_status = 'stopped' if current_trajectory_status == 'stopped' else ('done' if trajectory_done else 'running')
            else:
                action_status = 'done' if action_done else 'running'
                trajectory_status = 'done' if trajectory_done else 'running'
            
            # Send status update if there's been a change in individual process status
            prev_action_status = session_data.get('_prev_action_status', 'running')
            prev_trajectory_status = session_data.get('_prev_trajectory_status', 'running')
            
            if action_status != prev_action_status or trajectory_status != prev_trajectory_status:
                # Update stored status
                session_data['_prev_action_status'] = action_status
                session_data['_prev_trajectory_status'] = trajectory_status
                session_data['action_status'] = action_status
                session_data['trajectory_status'] = trajectory_status
                
                message = {
                    "type": "status",
                    "action_status": action_status,
                    "trajectory_status": trajectory_status,
                    "url": session_data.get('url'),
                    "session": session_id
                }
                await send_message(websocket, message)
                logger.info(f"Status update for session {session_id}: action={action_status}, trajectory={trajectory_status}")
            
            # Check if both processes have finished
            if action_done and trajectory_done:
                if current_action_status != 'stopped' and current_trajectory_status != 'stopped':
                    session_data['action_status'] = 'done'
                    session_data['trajectory_status'] = 'done'
                logger.info(f"Both crawler processes finished for session {session_id}")
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
                
                # Create separate output files for action and trajectory crawlers
                action_output_file = os.path.join(temp_dir, "action_result.yaml")
                trajectory_output_file = os.path.join(temp_dir, "trajectory_result.yaml")
                
                # Create separate output directories with prefixes
                action_output_dir = os.path.join(temp_dir, "action_output")
                trajectory_output_dir = os.path.join(temp_dir, "trajectory_output")
                os.makedirs(action_output_dir, exist_ok=True)
                os.makedirs(trajectory_output_dir, exist_ok=True)
                
                # Build crawler commands
                action_crawler_command = build_action_crawler_command(url, action_output_file, action_output_dir)
                trajectory_crawler_command = build_trajectory_crawler_command(url, trajectory_output_file, trajectory_output_dir)
                
                try:
                    # Prepare environment for both processes
                    env = os.environ.copy()
                    
                    # Create separate screenshot directories with prefixes
                    action_screenshot_dir = os.path.join(action_output_dir, "action_screenshot")
                    trajectory_screenshot_dir = os.path.join(trajectory_output_dir, "trajectory_screenshot")
                    os.makedirs(action_screenshot_dir, exist_ok=True)
                    os.makedirs(trajectory_screenshot_dir, exist_ok=True)
                    
                    # Create separate log files
                    action_log_file_path = os.path.join(action_output_dir, "action_crawler_console.log")
                    trajectory_log_file_path = os.path.join(trajectory_output_dir, "trajectory_crawler_console.log")
                    
                    # Create separate statistics files
                    action_statistic_file_path = os.path.join(action_output_dir, "action_statistics.json")
                    trajectory_statistic_file_path = os.path.join(trajectory_output_dir, "trajectory_statistics.json")
                    
                    # Start action crawler process
                    action_env = env.copy()
                    action_env["SCREENSHOT_DIR_PATH"] = action_screenshot_dir
                    action_env["AE_BROWSER_INSTANCE"] = "local"
                    
                    with open(action_log_file_path, 'w', encoding='utf-8') as action_log_file:
                        action_process = subprocess.Popen(
                            action_crawler_command,
                            stdout=action_log_file,
                            stderr=subprocess.STDOUT,
                            text=True,
                            cwd=action_output_dir,
                            env=action_env
                        )
                    
                    # Start trajectory crawler process
                    trajectory_env = env.copy()
                    trajectory_env["SCREENSHOT_DIR_PATH"] = trajectory_screenshot_dir
                    trajectory_env["AE_BROWSER_INSTANCE"] = "local"
                    
                    with open(trajectory_log_file_path, 'w', encoding='utf-8') as trajectory_log_file:
                        trajectory_process = subprocess.Popen(
                            trajectory_crawler_command,
                            stdout=trajectory_log_file,
                            stderr=subprocess.STDOUT,
                            text=True,
                            cwd=trajectory_output_dir,
                            env=trajectory_env
                        )
                    
                    logger.info(f"Started action crawler process PID {action_process.pid} for URL {url} with session {session_id} via command {' '.join(action_crawler_command)}")
                    logger.info(f"Started trajectory crawler process PID {trajectory_process.pid} for URL {url} with session {session_id} via command {' '.join(trajectory_crawler_command)}")
                    logger.info(f"Output will be in {temp_dir}")
                    
                    # Store session data for both processes
                    crawler_sessions[session_id] = {
                        "action_process": action_process,
                        "trajectory_process": trajectory_process,
                        "action_status": "running",
                        "trajectory_status": "running",
                        "url": url,
                        "temp_dir": temp_dir,
                        "action_output_dir": action_output_dir,
                        "trajectory_output_dir": trajectory_output_dir,
                        "action_screenshot_dir": action_screenshot_dir,
                        "trajectory_screenshot_dir": trajectory_screenshot_dir,
                        "action_output_file": action_output_file,
                        "trajectory_output_file": trajectory_output_file,
                        "action_statistic_file": action_statistic_file_path,
                        "trajectory_statistic_file": trajectory_statistic_file_path,
                        "action_command": action_crawler_command,
                        "trajectory_command": trajectory_crawler_command
                    }
                    
                    # Send running status
                    message = {
                        "type": "status",
                        "action_status": "running",
                        "trajectory_status": "running",
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
                    action_process = session_data.get('action_process')
                    trajectory_process = session_data.get('trajectory_process')
                    
                    processes_stopped = 0
                    try:
                        # Stop action crawler process
                        if action_process:
                            try:
                                action_process.kill()
                                action_process.wait()
                                logger.info(f"Stopped action crawler process for session {session_id}")
                                processes_stopped += 1
                            except Exception as e:
                                logger.error(f"Error stopping action crawler process for session {session_id}: {str(e)}")
                        
                        # Stop trajectory crawler process
                        if trajectory_process:
                            try:
                                trajectory_process.kill()
                                trajectory_process.wait()
                                logger.info(f"Stopped trajectory crawler process for session {session_id}")
                                processes_stopped += 1
                            except Exception as e:
                                logger.error(f"Error stopping trajectory crawler process for session {session_id}: {str(e)}")
                        
                        if processes_stopped > 0:
                            session_data['action_status'] = 'stopped'
                            session_data['trajectory_status'] = 'stopped'
                            
                            message = {
                                "type": "status",
                                "action_status": "stopped",
                                "trajectory_status": "stopped",
                                "url": session_data.get('url'),
                                "session": session_id
                            }
                            await send_message(websocket, message)
                            
                            logger.info(f"Stopped {processes_stopped} crawler processes for session {session_id}")
                        else:
                            message = {
                                "type": "error",
                                "message": f"No active processes found for session {session_id}"
                            }
                            await send_message(websocket, message)
                            
                    except Exception as e:
                        logger.error(f"Error stopping crawler processes for session {session_id}: {str(e)}")
                        message = {
                            "type": "error",
                            "message": f"Failed to stop crawler: {str(e)}"
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
                    action_status = session_data.get('action_status', 'unknown')
                    trajectory_status = session_data.get('trajectory_status', 'unknown')
                    url = session_data.get('url')
                    
                    # Determine current individual process statuses
                    action_process = session_data.get('action_process')
                    trajectory_process = session_data.get('trajectory_process')
                    
                    if action_status == 'stopped' and trajectory_status == 'stopped':
                        # Both processes were stopped
                        current_action_status = 'stopped'
                        current_trajectory_status = 'stopped'
                    else:
                        action_done = action_process and action_process.poll() is not None
                        trajectory_done = trajectory_process and trajectory_process.poll() is not None
                        current_action_status = 'done' if action_done else action_status
                        current_trajectory_status = 'done' if trajectory_done else trajectory_status
                    
                    # Send current status
                    message = {
                        "type": "status",
                        "action_status": current_action_status,
                        "trajectory_status": current_trajectory_status,
                        "url": url,
                        "session": session_id
                    }
                    await send_message(websocket, message)

                    asyncio.create_task(monitor_crawler(session_id, websocket))
                    logger.info(f"Loaded session {session_id} with action_status={current_action_status}, trajectory_status={current_trajectory_status}")
                    
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
                    action_output_file = session_data.get('action_output_file')
                    trajectory_output_file = session_data.get('trajectory_output_file')
                    
                    # Combine both output files into a single download
                    combined_content = {}
                    files_found = 0
                    
                    if action_output_file and os.path.exists(action_output_file):
                        try:
                            with open(action_output_file, 'r', encoding='utf-8') as f:
                                combined_content['action_crawler_results'] = f.read()
                            files_found += 1
                        except Exception as e:
                            logger.error(f"Error reading action output file for session {session_id}: {str(e)}")
                    
                    if trajectory_output_file and os.path.exists(trajectory_output_file):
                        try:
                            with open(trajectory_output_file, 'r', encoding='utf-8') as f:
                                combined_content['trajectory_crawler_results'] = f.read()
                            files_found += 1
                        except Exception as e:
                            logger.error(f"Error reading trajectory output file for session {session_id}: {str(e)}")
                    
                    if files_found > 0:
                        try:
                            # Convert combined content to YAML format
                            combined_yaml = yaml.dump(combined_content, default_flow_style=False, allow_unicode=True)
                            
                            message = {
                                "type": "save",
                                "session": session_id,
                                "filename": f"combined_crawler_results_{session_id}.yaml",
                                "content": combined_yaml
                            }
                            await send_message(websocket, message)
                            
                            logger.info(f"Sent combined crawler data for session {session_id}")
                            
                        except Exception as e:
                            logger.error(f"Error creating combined output for session {session_id}: {str(e)}")
                            message = {
                                "type": "error",
                                "message": f"Failed to create combined output: {str(e)}"
                            }
                            await send_message(websocket, message)
                    else:
                        message = {
                            "type": "error",
                            "message": f"No output files found for session {session_id}"
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
                    index_id = message.get("index_id")
                    team_config = message.get("team_config")
                    #settings_config = message.get("settings_config")
                    if task and team_config:
                        asyncio.create_task(ws_manager.call_action_engine(run_id, task, index_id))
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
