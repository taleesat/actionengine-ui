const express = require("express");
const { spawn } = require("child_process");
const { Command } = require("commander");

const program = new Command();
program
  .option("--port <number>", "Port number", "3000")
  .option("--script <path>", "Launch script", "/app/launch-session.sh");

const app = express();
const processMap = {}; // Track processes by session ID

program.parse(process.argv);
const options = program.opts();
const script = options.script;
const port = parseInt(options.port);

app.use(express.json());

app.post("/launch/:sess_id", (req, res) => {
  const sessId = req.params.sess_id;

  var baseDisplay = 100 + parseInt(sessId);
  var playwrightPort = 9000 + sessId * 3;
  var novncPort = playwrightPort + 1;
  var x11vncPort = novncPort + 1;

  const child = spawn(script, [baseDisplay, playwrightPort, novncPort, x11vncPort], {
    detached: true,
    stdio: "ignore"
  });

  processMap[sessId] = child;
  child.unref();

  res.send({ message: `Session ${sessId} launched`, pid: child.pid, display: baseDisplay, playwright_port: playwrightPort, novnc_port: novncPort, x11vnc_port: x11vncPort });
});

app.post("/stop/:sess_id", (req, res) => {
  const sessId = req.params.sess_id;
  const child = processMap[sessId];

  if (!child) {
    return res.status(404).send({ error: `No session found with ID ${sessId}` });
  }

  process.kill(-child.pid, "SIGTERM"); // Kill the entire process group
  delete processMap[sessId];
  res.send({ message: `Session ${sessId} stopped` });
});

app.listen(port, () => {
  console.log(`Session launcher listening on port ${port}`);
});
