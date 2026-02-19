const express = require("express");
const { spawn } = require("child_process");
const { Command } = require("commander");

const program = new Command();
program
  .option("--port <number>", "Port number", "3000")
  .option("--script <path>", "Launch script", "/app/launch-session.sh");

const app = express();
const processMap = {}; // Track processes by session ID

// Keep track of all spawned process groups for cleanup
const allProcessGroups = new Set();

program.parse(process.argv);
const options = program.opts();
const script = options.script;
const port = parseInt(options.port);

app.use(express.json());

app.post("/launch/:sess_id", (req, res) => {
  const sessId = req.params.sess_id;
  console.log(`Launching session ${sessId}`);

  // Check if session already exists
  if (processMap[sessId]) {
    console.log(`Session ${sessId} already exists`);
    return res.status(404).send({ error: `Session ${sessId} already running` });
  }

  var sessIdInt = parseInt(sessId);
  var baseDisplay = 100 + sessIdInt;
  var playwrightPort = 5000 + sessIdInt * 2;
  var x11vncPort = playwrightPort + 1;
  var novncPort = 9000 + sessIdInt;

  const child = spawn(script, [baseDisplay, playwrightPort, novncPort, x11vncPort], {
    detached: true,
    stdio: "pipe"  // Changed from "ignore" to "pipe" for better process tracking
  });

  processMap[sessId] = child;
  allProcessGroups.add(child.pid);

  // Capture and print stdout
  child.stdout.on('data', (data) => {
    console.log(`[Session ${sessId} STDOUT]: ${data.toString().trim()}`);
  });

  // Capture and print stderr
  child.stderr.on('data', (data) => {
    console.error(`[Session ${sessId} STDERR]: ${data.toString().trim()}`);
  });

  // Handle child process events
  child.on('error', (error) => {
    console.error(`Error in session ${sessId}:`, error);
    allProcessGroups.delete(child.pid);
    delete processMap[sessId];
  });

  child.on('exit', (code, signal) => {
    console.log(`Session ${sessId} exited with code ${code} and signal ${signal}`);
    allProcessGroups.delete(child.pid);
    delete processMap[sessId];
  });

  // Don't unref() - we want to keep track of these processes
  // child.unref();

  res.send({ message: `Session ${sessId} launched`, pid: child.pid, display: baseDisplay, playwright_port: playwrightPort, novnc_port: novncPort, x11vnc_port: x11vncPort });
  console.log(`Launched session ${sessId} with PID ${child.pid} at display : ${baseDisplay}, playwright_port: ${playwrightPort}, novnc_port: ${novncPort}, x11vnc_port: ${x11vncPort}`);
});

app.post("/stop/:sess_id", (req, res) => {
  const sessId = req.params.sess_id;
  console.log(`Stopping session ${sessId}`);
  const child = processMap[sessId];

  if (!child) {
    return res.status(404).send({ error: `No session found with ID ${sessId}` });
  }

  try {
    // Kill the entire process group
    process.kill(-child.pid, "SIGTERM");
    allProcessGroups.delete(child.pid);
    
    // Give processes time to clean up, then force kill if needed
    setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (err) {
        // Process already dead, ignore error
      }
    }, 5000);
    
  } catch (error) {
    console.error(`Error stopping session ${sessId}:`, error);
  }

  delete processMap[sessId];
  res.send({ message: `Session ${sessId} stopped` });
  console.log(`Stopped session ${sessId}`);
});

// Cleanup function to kill all child processes
function cleanup() {
  console.log('Cleaning up all child processes...');
  
  // Kill all tracked process groups
  allProcessGroups.forEach(pid => {
    try {
      console.log(`Killing process group ${pid}`);
      process.kill(-pid, 'SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch (err) {
          // Process already dead, ignore error
        }
      }, 3000);
      
    } catch (error) {
      console.error(`Error killing process group ${pid}:`, error);
    }
  });
  
  // Clear tracking
  allProcessGroups.clear();
  
  setTimeout(() => {
    console.log('Cleanup complete, exiting...');
    process.exit(0);
  }, 5000);
}

// Handle various termination signals
process.on('SIGINT', () => {
  console.log('Received SIGINT (Ctrl+C)');
  cleanup();
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
  cleanup();
});

process.on('SIGHUP', () => {
  console.log('Received SIGHUP');
  cleanup();
});

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  cleanup();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  cleanup();
});

app.listen(port, () => {
  console.log(`Session launcher listening on port ${port}`);
});
