# api/ws.py
import asyncio
import json
import os
import subprocess
import threading
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from loguru import logger

from ...datamodel import Run
from ..deps import get_db, get_websocket_manager
from ..managers import WebSocketManager
from ...utils.utils import construct_task

router = APIRouter()

@router.websocket("/crawler")
async def control_crawler(
    websocket: WebSocket
):
    await websocket.accept()
    
    # Process and thread management variables
    crawler_process: Optional[subprocess.Popen] = None
    crawler_thread: Optional[threading.Thread] = None
    output_file = "result.yaml"
    
    def run_crawler_process(url: str):
        """Run the crawler process and capture stdout"""
        nonlocal crawler_process
        try:
            # Command to run the crawler
            cmd = [
                "python", "./src/project24/apps/crawlerApp.py", 
                "--app_url", url,
                "--action_index_path", output_file,
                "--crawl_action"
            ]
            
            logger.info(f"Starting crawler process with command: {' '.join(cmd)}")
            crawler_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
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
                        asyncio.get_event_loop()
                    )
            
            # Wait for process to complete
            return_code = crawler_process.wait()
            crawler_process = None
            
            # Send completion status
            if return_code == 0:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({
                        "type": "status",
                        "status": "done"
                    }),
                    asyncio.get_event_loop()
                )
                logger.info("Crawler process completed successfully")
            else:
                asyncio.run_coroutine_threadsafe(
                    websocket.send_json({
                        "type": "status", 
                        "status": "error",
                        "message": f"Process exited with code {return_code}"
                    }),
                    asyncio.get_event_loop()
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
                asyncio.get_event_loop()
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
                
                # Check if crawler is already running
                if crawler_process is not None or (crawler_thread is not None and crawler_thread.is_alive()):
                    await websocket.send_json({
                        "type": "error", 
                        "message": "Crawler is already running"
                    })
                    continue
                
                # Start crawler process in a new thread
                crawler_thread = threading.Thread(
                    target=run_crawler_process,
                    args=(url,),
                    daemon=True
                )
                crawler_thread.start()
                
                # Send running status
                await websocket.send_json({
                    "type": "status",
                    "status": "running"
                })
                logger.info(f"Started crawler for URL: {url}")
            
            elif message_type == "stop":
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
                    if os.path.exists(output_file):
                        with open(output_file, 'r', encoding='utf-8') as f:
                            file_content = f.read()
                        
                        await websocket.send_json({
                            "type": "save",
                            "data": file_content
                        })
                        logger.info(f"Sent file content from {output_file}")
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Output file {output_file} not found"
                        })
                        logger.warning(f"Output file {output_file} does not exist")
                        
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
        # Ensure cleanup
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
