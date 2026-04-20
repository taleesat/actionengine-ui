const { chromium } = require("playwright");
const { Command } = require("commander");

const program = new Command();
program
  .option("--port <number>", "Playwright port number", "37367")
  .option("--ws-path <path>", "WebSocket path", "ws");

program.parse(process.argv);
const options = program.opts();

const port = parseInt(options.port);
const wsPath = options.wsPath;

(async () => {
  console.log("Starting Playwright server...");

  // Start the remote debugging server
  const browserServer = await chromium.launchServer({
    headless: false,
    port: port,
    wsPath: wsPath,
    args: [
      "--start-fullscreen",
      "--start-maximized",
      "--window-size=1440,1440",
      "--window-position=0,0",
      "--disable-infobars",
      "--no-default-browser-check",
      "--kiosk",
      "--disable-session-crashed-bubble",
      "--noerrdialogs",
      "--force-device-scale-factor=1.0",
      "--disable-features=DefaultViewportMetaTag",
      "--force-device-width=1440",
    ],
  });

  console.log(`Playwright server running: ${browserServer.wsEndpoint()}`);

  // Keep the process running
  process.on("SIGINT", async () => {
    console.log("Shutting down Playwright server...");
    await browserServer.close();
    process.exit(0);
  });
})();
