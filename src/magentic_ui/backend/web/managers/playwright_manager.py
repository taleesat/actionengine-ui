import os

import docker
import asyncio

docker_image = "magentic-ui-vnc-browser:latest"
playwright_ws_path = "/ws"

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