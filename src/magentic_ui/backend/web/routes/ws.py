# api/ws.py
import asyncio
import json
import os
import subprocess
import threading
import tempfile
import time
import uuid
import yaml
from datetime import datetime
from typing import Optional

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

@router.websocket("/crawler")
async def control_crawler(
    websocket: WebSocket
):
    await websocket.accept()
    
    # Process and thread management variables
    crawler_process: Optional[subprocess.Popen] = None
    crawler_thread: Optional[threading.Thread] = None
    file_monitor_thread: Optional[threading.Thread] = None
    crawler_work_dir: Optional[str] = None
    output_file = "result.yaml"
    stop_file_monitoring = threading.Event()
    
    # Get the current event loop to pass to the thread
    event_loop = asyncio.get_running_loop()
    
    def monitor_result_file(loop: asyncio.AbstractEventLoop):
        """Monitor result.yaml file and send updates via websocket"""
        nonlocal crawler_work_dir, output_file
        last_sent_content = None
        
        try:
            logger.info("Starting file monitoring thread")
            while not stop_file_monitoring.is_set():
                if crawler_work_dir:
                    result_file_path = os.path.join(crawler_work_dir, output_file)
                    
                    if os.path.exists(result_file_path):
                        try:
                            with open(result_file_path, 'r', encoding='utf-8') as f:
                                file_content = f.read()
                            
                            # Only send if content has changed
                            if file_content != last_sent_content:
                                # Parse YAML and convert to AppGraph
                                try:
                                    yaml_data = yaml.safe_load(file_content)
                                    if yaml_data:
                                        # Convert to AppGraph object for JSON serialization
                                        app_graph = AppGraph.model_validate(yaml_data)
                                        
                                        # Transform AppGraph to required schema format
                                        result = []
                                        for state in app_graph.states:
                                            state_entry = {
                                                "state": state.id or "Unknown State",
                                                "atoms": []
                                            }
                                            
                                            # Add atoms for this state
                                            for atom in state.atoms:
                                                atom_entry = {
                                                    "id": atom.id,
                                                    "description": atom.description
                                                }
                                                state_entry["atoms"].append(atom_entry)
                                            
                                            result.append(state_entry)
                                        
                                        # Send transformed data via websocket
                                        asyncio.run_coroutine_threadsafe(
                                            websocket.send_json({
                                                "type": "update_result",
                                                "result": result
                                            }),
                                            loop
                                        )
                                        last_sent_content = file_content
                                        logger.info("Sent result.yaml update via websocket")
                                except yaml.YAMLError as e:
                                    logger.warning(f"Error parsing YAML from {result_file_path}: {str(e)}")
                                except Exception as e:
                                    logger.warning(f"Error processing AppGraph from {result_file_path}: {str(e)}")
                                    
                        except Exception as e:
                            logger.error(f"Error reading {result_file_path}: {str(e)}")
                
                # Sleep for 1 second before checking again
                if not stop_file_monitoring.wait(1.0):
                    continue
                else:
                    break
                    
        except Exception as e:
            logger.error(f"Error in file monitoring thread: {str(e)}")
        finally:
            logger.info("File monitoring thread stopped")
    
    def run_crawler_process(url: str, loop: asyncio.AbstractEventLoop):
        """Run the crawler process and capture stdout"""
        nonlocal crawler_process, crawler_work_dir
        try:
            # Create a unique directory for this crawler process
            tmp_dir = os.environ.get("MAGENTIC_TMP_PATH", tempfile.gettempdir())
            crawler_uuid = str(uuid.uuid4())
            crawler_work_dir = os.path.join(tmp_dir, crawler_uuid)
            
            # Create the directory
            os.makedirs(crawler_work_dir, exist_ok=True)
            logger.info(f"Created crawler work directory: {crawler_work_dir}")
            
            # Create .auth directory with combined.json file
            auth_dir = os.path.join(crawler_work_dir, ".auth")
            os.makedirs(auth_dir, exist_ok=True)
            combined_json_path = os.path.join(auth_dir, "combined.json")
            with open(combined_json_path, 'w', encoding='utf-8') as f:
                f.write("{}")
            logger.info(f"Created .auth directory and combined.json file at: {auth_dir}")
            
            # Command to run the crawler
            cmd = [
                python_executable, app_path, 
                "--app_url", url,
                "--action_index_path", output_file,
                "--crawl_action"
            ]
            
            logger.info(f"Starting crawler process with command: {' '.join(cmd)} in directory: {crawler_work_dir}")
            crawler_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
                cwd=crawler_work_dir
            )
            
            # Read stdout line by line and send updates
            log_messages = []
            for line in iter(crawler_process.stdout.readline, ''):
                if line:
                    line = line.strip()
                    log_messages.append(line)
                    logger.info(f"Crawler output: {line}")
                    
                    # Send log update via websocket (in a thread-safe way)
                    asyncio.run_coroutine_threadsafe(
                        websocket.send_json({
                            "type": "update_log",
                            "messages": [line]
                        }),
                        loop
                    )
            
            # Wait for process to complete
            return_code = crawler_process.wait() if crawler_process else 0
            crawler_process = None
            
            # Send completion status
            if return_code == 0:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({
                        "type": "status",
                        "status": "done"
                    }),
                    loop
                )
                logger.info("Crawler process completed successfully")
            else:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({
                        "type": "status", 
                        "status": "error",
                        "message": f"Process exited with code {return_code}"
                    }),
                    loop
                )
                logger.error(f"Crawler process failed with return code: {return_code}")
                
        except Exception as e:
            logger.error(f"Error in crawler process: {str(e)}")
            asyncio.run_coroutine_threadsafe(
                websocket.send_json({
                    "type": "status",
                    "status": "error", 
                    "message": str(e)
                }),
                loop
            )
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            logger.info(f"Received message: {message}")
            
            message_type = message.get("type")
            
            if message_type == "start":
                url = message.get("url")
                if not url:
                    await websocket.send_json({
                        "type": "error",
                        "message": "URL is required for start message"
                    })
                    continue
                
                # Add http:// prefix if the URL doesn't have http or https
                if not url.startswith(('http://', 'https://')):
                    url = 'http://' + url
                    logger.info(f"Prepended http:// to URL: {url}")

                # Check if crawler is already running
                if crawler_process is not None or (crawler_thread is not None and crawler_thread.is_alive()):
                    await websocket.send_json({
                        "type": "error", 
                        "message": "Crawler is already running"
                    })
                    continue
                
                # Reset the stop event
                stop_file_monitoring.clear()
                
                # Start crawler process in a new thread
                crawler_thread = threading.Thread(
                    target=run_crawler_process,
                    args=(url, event_loop),
                    daemon=True
                )
                crawler_thread.start()
                
                # Start file monitoring thread
                file_monitor_thread = threading.Thread(
                    target=monitor_result_file,
                    args=(event_loop,),
                    daemon=True
                )
                file_monitor_thread.start()
                
                # Send running status
                await websocket.send_json({
                    "type": "status",
                    "status": "running"
                })
                logger.info(f"Started crawler and file monitoring for URL: {url}")
            
            elif message_type == "stop":
                # Stop file monitoring
                stop_file_monitoring.set()
                if file_monitor_thread is not None and file_monitor_thread.is_alive():
                    file_monitor_thread.join(timeout=2.0)
                    file_monitor_thread = None
                    logger.info("File monitoring thread stopped")
                
                # Kill the process and thread
                if crawler_process is not None:
                    try:
                        crawler_process.terminate()
                        crawler_process.wait(timeout=5)
                        crawler_process = None
                        logger.info("Crawler process terminated")
                    except subprocess.TimeoutExpired:
                        crawler_process.kill()
                        crawler_process = None
                        logger.info("Crawler process killed (forced)")
                    except Exception as e:
                        logger.error(f"Error stopping crawler process: {str(e)}")
                
                if crawler_thread is not None and crawler_thread.is_alive():
                    # Note: Python threads cannot be forcibly killed, but the process termination will end the thread
                    crawler_thread = None
                    logger.info("Crawler thread reference cleared")
                
                # Send stopped status
                await websocket.send_json({
                    "type": "status",
                    "status": "stopped"
                })
                logger.info("Crawler stopped")
            
            elif message_type == "download":
                # Read the output file and send back the data
                try:
                    # Use the full path to the output file in the crawler work directory
                    output_file_path = os.path.join(crawler_work_dir, output_file) if crawler_work_dir else output_file
                    
                    if os.path.exists(output_file_path):
                        with open(output_file_path, 'r', encoding='utf-8') as f:
                            file_content = f.read()
                        
                        await websocket.send_json({
                            "type": "save",
                            "data": file_content
                        })
                        logger.info(f"Sent file content from {output_file_path}")
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Output file {output_file_path} not found"
                        })
                        logger.warning(f"Output file {output_file_path} does not exist")
                        
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Error reading output file: {str(e)}"
                    })
                    logger.error(f"Error reading output file: {str(e)}")
            
            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                })
                logger.warning(f"Unknown message type received: {message_type}")
                
    except WebSocketDisconnect:
        logger.info("Crawler WebSocket disconnected")
        # Clean up on disconnect
        if crawler_process is not None:
            try:
                crawler_process.terminate()
                crawler_process.wait(timeout=5)
            except:
                crawler_process.kill()
            finally:
                crawler_process = None
    except Exception as e:
        logger.error(f"WebSocket error in crawler control: {str(e)}")
    finally:
        # Stop file monitoring
        stop_file_monitoring.set()
        if file_monitor_thread is not None and file_monitor_thread.is_alive():
            file_monitor_thread.join(timeout=2.0)
            file_monitor_thread = None
            logger.info("File monitoring thread stopped during cleanup")
        
        # Ensure crawler process cleanup
        if crawler_process is not None:
            try:
                crawler_process.terminate()
                crawler_process.wait(timeout=5)
            except:
                crawler_process.kill()
            finally:
                crawler_process = None

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
