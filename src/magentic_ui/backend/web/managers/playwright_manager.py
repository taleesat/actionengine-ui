import os

import requests
import docker
import asyncio

docker_image = "magentic-ui-vnc-browser:latest"
playwright_ws_path = "/ws"

class MultiPlaywrightServer:

    def __init__(self, server_address: str, server_port: int, sess_id: int):
        self.server_address = server_address
        self.server_port = server_port
        self.sess_id = sess_id
        self.playwright_port = None
        self.novnc_port = None

    def start_server(self):
        url = f"http://{self.server_address}:{self.server_port}/launch/{self.sess_id}"
        response = requests.post(url, data={})  # empty body
        if response.status_code != 200:
            raise RuntimeError(f"Failed to start Playwright server: {response.text}")
        playwright_server = response.json()
        self.playwright_port = playwright_server.get("playwright_port")
        self.novnc_port = playwright_server.get("novnc_port")
        return {
            "playwright_server": self.server_address,
            "playwright_port": self.playwright_port,
            "novnc_port": self.novnc_port,
        }

    def stop_server(self):
        url = f"http://{self.server_address}:{self.server_port}/stop/{self.sess_id}"
        response = requests.post(url, data={})
        if response.status_code != 200:
            raise RuntimeError(f"Failed to stop Playwright server: {response.text}")

all_multi_playwright_servers = set()
sess_lock = asyncio.Lock()
ongoing_sess = set()

async def create_multi_playwright_server_from_env() -> MultiPlaywrightServer:
    multi_playwright_server_address = os.getenv("MULTI_PLAYWRIGHT_SERVER_ADDRESS", "localhost")
    multi_playwright_server_port = int(os.getenv("MULTI_PLAYWRIGHT_SERVER_PORT", 3000))
    async with sess_lock:
        sess_id = 0
        while sess_id in ongoing_sess:
            sess_id += 1
        ongoing_sess.add(sess_id)
    server = MultiPlaywrightServer(multi_playwright_server_address, multi_playwright_server_port, sess_id)
    all_multi_playwright_servers.add(server)
    return server

async def return_multi_playwright_server(server: MultiPlaywrightServer) -> None:
    async with sess_lock:
        ongoing_sess.discard(server.sess_id)

async def cleanup_multi_playwright_servers() -> None:
    global all_multi_playwright_servers
    async with sess_lock:
        for server in all_multi_playwright_servers:
            server.stop_server()
        all_multi_playwright_servers.clear()
        ongoing_sess.clear()

class DockerPlaywrightServer:

    def __init__(self, docker_address: str, docker_port: int, bind_workspace: str, playwright_port: int, novnc_port: int):
        self.docker_client = docker.DockerClient(base_url=f"tcp://{docker_address}:{docker_port}")
        self.bind_workspace = bind_workspace
        self.docker_address = docker_address
        self.playwright_port = playwright_port
        self.novnc_port = novnc_port
        self.container = None

    async def create_container(self) -> None:
        self.container = await asyncio.to_thread(
            self.docker_client.containers.create,
            name=f"magentic-ui-vnc-browser_{self.playwright_port}_{self.novnc_port}",
            image="magentic-ui-vnc-browser:latest",
            detach=True,
            auto_remove=True,
            ports={
                f"{self.playwright_port}/tcp": self.playwright_port,
                f"{self.novnc_port}/tcp": self.novnc_port,
            },
            volumes={
                self.bind_workspace: {"bind": "/workspace", "mode": "rw"}
            },
            environment={
                "PLAYWRIGHT_WS_PATH": playwright_ws_path,
                "PLAYWRIGHT_PORT": str(self.playwright_port),
                "NO_VNC_PORT": str(self.novnc_port),
            },
        )

    async def start_container(self) -> None:
        if not self.container:
            raise RuntimeError("Docker container has not been created")
        await asyncio.to_thread(self.container.start)

    def stop_container(self) -> None:
        if self.container:
            try:
                self.container.stop()
            except docker.errors.APIError as e:
                print(f"Error stopping Docker container, just ignore it: {e}")
            self.container = None

lock = asyncio.Lock()
used_ports = set()

all_docker_playwright_servers = set()

async def create_docker_playwright_from_env() -> DockerPlaywrightServer:
    global lock
    docker_address = os.getenv("DOCKER_ADDRESS", "localhost")
    docker_port = int(os.getenv("DOCKER_PORT", 2375))
    start_port = int(os.getenv("DOCKER_START_PORT", 9800))
    async with lock:
        i = start_port
        while i in used_ports:
            i += 1
        playwright_port = i
        used_ports.add(playwright_port)
        i += 1
        while i in used_ports:
            i += 1
        novnc_port = i
        used_ports.add(novnc_port)
        docker_playwright = DockerPlaywrightServer(
            docker_address,
            docker_port,
            bind_workspace=os.getenv("DOCKER_WORKSPACE_DIR", "/workspace"),
            playwright_port=playwright_port,
            novnc_port=novnc_port
        )
        all_docker_playwright_servers.add(docker_playwright)
    return docker_playwright

async def return_docker_playwright(docker_playwright: DockerPlaywrightServer) -> None:
    global lock
    async with lock:
        used_ports.discard(docker_playwright.playwright_port)
        used_ports.discard(docker_playwright.novnc_port)
        all_docker_playwright_servers.remove(docker_playwright)

async def cleanup_docker_playwright_servers() -> None:
    global all_docker_playwright_servers
    async with lock:
        for docker_playwright in all_docker_playwright_servers:
            docker_playwright.stop_container()
        all_docker_playwright_servers.clear()
        used_ports.clear()