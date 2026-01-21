import os

import requests
import docker
import asyncio

from azure.identity import DefaultAzureCredential, ManagedIdentityCredential, AzureCliCredential, get_bearer_token_provider
from loguru import logger

docker_image = "magentic-ui-vnc-browser:latest"
playwright_ws_path = "/ws"

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

class TSStagehandServer:

    def __init__(self, server_address: str, server_port: int, deployment: str, sess_id: int):
        self.server_address = server_address
        self.server_port = server_port
        self.deployment = deployment
        self.sess_id = sess_id
        self.ts_stagehand_server = None

    def start_server(self):
        protocol = "http"
        url = f"{protocol}://{self.server_address}:{self.server_port}/launch/{self.sess_id}"
        logger.info(f"Starting Playwright server at {url}")
        if self.deployment == "msrhub":
            azure_credential = get_azure_credential()
            token = azure_credential.get_token("api://msrhub/.default")
            headers = {
                "Authorization": f"Bearer {token.token}",
            }
            response = requests.post(url, headers=headers, data={})
        else:
            response = requests.post(url, data={})  # empty body
        if response.status_code != 200:
            logger.error(f"Failed to start Playwright server: {response.text}")
            raise RuntimeError(f"Failed to start Playwright server: {response.text}")
        self.ts_stagehand_server = response.json()
        logger.info(f"Playwright server started: {self.ts_stagehand_server}")

    def stop_server(self):
        protocol = "http"
        url = f"{protocol}://{self.server_address}:{self.server_port}/stop/{self.sess_id}"
        logger.info(f"Stopping Playwright server at {url}")
        if self.deployment == "msrhub":
            azure_credential = get_azure_credential()
            token = azure_credential.get_token("api://msrhub/.default")
            headers = {
                "Authorization": f"Bearer {token.token}",
            }
            response = requests.post(url, headers=headers, data={}, verify=False)
        else:
            response = requests.post(url, data={})
        if response.status_code != 200:
            raise RuntimeError(f"Failed to stop Playwright server: {response.text}")
    
    def build_server_info(self) -> dict:
        if self.deployment == "local":
            novnc_endpoint = f"http://{self.server_address}:{self.ts_stagehand_server.get('novnc_port')}"
            return {
                "ts_stagehand_host": self.server_address,
                "ts_stagehand_port": self.ts_stagehand_server.get('playwright_port'),
                "novnc_endpoint": novnc_endpoint,
            }
        elif self.deployment == "msrhub":
            browser_server_release_name = os.getenv("BROWSER_SERVER_RELEASE_NAME")
            app_env_domain = os.getenv("CONTAINER_APP_ENV_DOMAIN")
            novnc_endpoint = f"https://{browser_server_release_name}-{self.ts_stagehand_server.get('novnc_port')}.{app_env_domain}"
            return {
                "ts_stagehand_host": f"{browser_server_release_name}-{self.ts_stagehand_server.get('playwright_port')}.msrhub.com",
                "ts_stagehand_port": 80,
                "novnc_endpoint": novnc_endpoint,
            }
        elif self.deployment == "github":
            codespace_id = os.getenv("CODESPACE_ID")
            novnc_endpoint = f"https://{codespace_id}-{self.ts_stagehand_server.get('novnc_port')}.app.github.dev"
            return {
                "ts_stagehand_host": self.server_address,
                "ts_stagehand_port": self.ts_stagehand_server.get('playwright_port'),
                "novnc_endpoint": novnc_endpoint,
            }
        else:
            raise RuntimeError(f"Unsupported deployment type: {self.deployment}")


class MultiPlaywrightServer:

    def __init__(self, server_address: str, server_port: int, deployment: str, sess_id: int):
        self.server_address = server_address
        self.server_port = server_port
        self.deployment = deployment
        self.sess_id = sess_id
        self.playwright_server = None

    def start_server(self):
        protocol = "http"
        url = f"{protocol}://{self.server_address}:{self.server_port}/launch/{self.sess_id}"
        logger.info(f"Starting Playwright server at {url}")
        if self.deployment == "msrhub":
            azure_credential = get_azure_credential()
            token = azure_credential.get_token("api://msrhub/.default")
            headers = {
                "Authorization": f"Bearer {token.token}",
            }
            response = requests.post(url, headers=headers, data={})
        else:
            response = requests.post(url, data={})  # empty body
        if response.status_code != 200:
            logger.error(f"Failed to start Playwright server: {response.text}")
            raise RuntimeError(f"Failed to start Playwright server: {response.text}")
        self.playwright_server = response.json()
        logger.info(f"Playwright server started: {self.playwright_server}")

    def stop_server(self):
        protocol = "http"
        url = f"{protocol}://{self.server_address}:{self.server_port}/stop/{self.sess_id}"
        logger.info(f"Stopping Playwright server at {url}")
        if self.deployment == "msrhub":
            azure_credential = get_azure_credential()
            token = azure_credential.get_token("api://msrhub/.default")
            headers = {
                "Authorization": f"Bearer {token.token}",
            }
            response = requests.post(url, headers=headers, data={}, verify=False)
        else:
            response = requests.post(url, data={})
        if response.status_code != 200:
            raise RuntimeError(f"Failed to stop Playwright server: {response.text}")
    
    def build_playwright_info(self) -> dict:
        if self.deployment == "local":
            playwright_endpoint = f"ws://{self.server_address}:{self.playwright_server.get('playwright_port')}{playwright_ws_path}"
            novnc_endpoint = f"http://{self.server_address}:{self.playwright_server.get('novnc_port')}"
            return {
                "playwright_endpoint": playwright_endpoint,
                "novnc_endpoint": novnc_endpoint,
            }
        elif self.deployment == "msrhub":
            browser_server_release_name = os.getenv("BROWSER_SERVER_RELEASE_NAME")
            app_env_domain = os.getenv("CONTAINER_APP_ENV_DOMAIN")
            playwright_endpoint = f"ws://{browser_server_release_name}-{self.playwright_server.get('playwright_port')}.msrhub.com{playwright_ws_path}"
            novnc_endpoint = f"https://{browser_server_release_name}-{self.playwright_server.get('novnc_port')}.{app_env_domain}"
            return {
                "playwright_endpoint": playwright_endpoint,
                "novnc_endpoint": novnc_endpoint,
            }
        elif self.deployment == "github":
            codespace_id = os.getenv("CODESPACE_ID")
            playwright_endpoint = f"ws://{self.server_address}:{self.playwright_server.get('playwright_port')}{playwright_ws_path}"
            novnc_endpoint = f"https://{codespace_id}-{self.playwright_server.get('novnc_port')}.app.github.dev"
            return {
                "playwright_endpoint": playwright_endpoint,
                "novnc_endpoint": novnc_endpoint,
            }
        else:
            raise RuntimeError(f"Unsupported deployment type: {self.deployment}")

all_multi_playwright_servers = set()
all_ts_stagehand_servers = set()
sess_lock = asyncio.Lock()
ongoing_sess = set()
max_ongoing_sess = int(os.getenv("MAX_USERS", 5))

async def create_ts_stagehand_server_from_env() -> TSStagehandServer:
    deployment = os.getenv("DEPLOYMENT", "local")
    deployment = deployment.lower()
    if deployment == "local":
        ts_stagehand_server_address = os.getenv("TS_STAGEHAND_SERVER_ADDRESS", "localhost")
        ts_stagehand_server_port = int(os.getenv("TS_STAGEHAND_SERVER_PORT", 3000))
    elif deployment == "msrhub":
        browser_server_release_name = os.getenv("BROWSER_SERVER_RELEASE_NAME")
        ts_stagehand_server_address = f"{browser_server_release_name}.msrhub.com"
        ts_stagehand_server_port = 80
    elif deployment == "github":
        ts_stagehand_server_address = os.getenv("TS_STAGEHAND_SERVER_ADDRESS", "localhost")
        ts_stagehand_server_port = int(os.getenv("TS_STAGEHAND_SERVER_PORT", 3000))
    else:
        raise RuntimeError(f"Unsupported deployment type: {deployment}")
    async with sess_lock:
        if len(ongoing_sess) >= max_ongoing_sess:
            raise RuntimeError("Maximum number of ongoing sessions reached")
        sess_id = 0
        while sess_id in ongoing_sess:
            sess_id += 1
        ongoing_sess.add(sess_id)
    server = TSStagehandServer(ts_stagehand_server_address, ts_stagehand_server_port, deployment, sess_id)
    all_ts_stagehand_servers.add(server)
    return server

async def return_ts_stagehand_server(server: TSStagehandServer) -> None:
    async with sess_lock:
        ongoing_sess.discard(server.sess_id)

async def create_multi_playwright_server_from_env() -> MultiPlaywrightServer:
    deployment = os.getenv("DEPLOYMENT", "local")
    deployment = deployment.lower()
    if deployment == "local":
        multi_playwright_server_address = os.getenv("MULTI_PLAYWRIGHT_SERVER_ADDRESS", "localhost")
        multi_playwright_server_port = int(os.getenv("MULTI_PLAYWRIGHT_SERVER_PORT", 3000))
    elif deployment == "msrhub":
        browser_server_release_name = os.getenv("BROWSER_SERVER_RELEASE_NAME")
        #app_env_domain = os.getenv("CONTAINER_APP_ENV_DOMAIN")
        #multi_playwright_server_address = f"{browser_server_release_name}.{app_env_domain}"
        multi_playwright_server_address = f"{browser_server_release_name}.msrhub.com"
        multi_playwright_server_port = 80
    elif deployment == "github":
        multi_playwright_server_address = os.getenv("MULTI_PLAYWRIGHT_SERVER_ADDRESS", "localhost")
        multi_playwright_server_port = int(os.getenv("MULTI_PLAYWRIGHT_SERVER_PORT", 3000))
    else:
        raise RuntimeError(f"Unsupported deployment type: {deployment}")
    async with sess_lock:
        if len(ongoing_sess) >= max_ongoing_sess:
            raise RuntimeError("Maximum number of ongoing sessions reached")
        sess_id = 0
        while sess_id in ongoing_sess:
            sess_id += 1
        ongoing_sess.add(sess_id)
    server = MultiPlaywrightServer(multi_playwright_server_address, multi_playwright_server_port, deployment, sess_id)
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