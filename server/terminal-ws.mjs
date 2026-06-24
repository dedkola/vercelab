import { execFileSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import pty from "@homebridge/node-pty-prebuilt-multiarch";
import { WebSocketServer } from "ws";

const DEFAULT_PORT = 3001;
const HOST_SHELL = "/bin/bash";
const TERMINAL_TYPE = "xterm-256color";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function isRunningInContainer() {
  try {
    accessSync("/.dockerenv", constants.F_OK);
    return true;
  } catch {
    // Continue with cgroup detection below.
  }

  try {
    const cgroup = readFileSync("/proc/1/cgroup", "utf8");

    return /docker|containerd|kubepods/i.test(cgroup);
  } catch {
    return false;
  }
}

function getTerminalTarget() {
  const inContainer = isRunningInContainer();

  if (process.env.VERCELAB_TERMINAL_TARGET === "container") {
    return "container";
  }

  if (process.env.VERCELAB_TERMINAL_TARGET === "host") {
    return inContainer ? "host" : "container";
  }

  return inContainer ? "host" : "container";
}

function readSelfContainerId() {
  try {
    return readFileSync("/etc/hostname", "utf8").trim();
  } catch {
    return os.hostname();
  }
}

function getHostTerminalImage() {
  const configuredImage = process.env.VERCELAB_HOST_TERMINAL_IMAGE?.trim();

  if (configuredImage) {
    return configuredImage;
  }

  const containerId = readSelfContainerId();
  const image = execFileSync(
    "docker",
    ["inspect", "--format", "{{.Config.Image}}", containerId],
    {
      encoding: "utf8",
      timeout: 5000,
    },
  ).trim();

  if (image && image !== "<no value>") {
    return image;
  }

  throw new Error(
    "Unable to resolve the control-plane image for host terminal access. Set VERCELAB_HOST_TERMINAL_IMAGE.",
  );
}

function resolveHostWorkingDirectory(value) {
  const requested =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : (process.env.VERCELAB_HOST_ROOT ?? "/");

  return path.posix.resolve("/", requested);
}

function buildPtyLaunch({ cwd }) {
  const target = getTerminalTarget();

  if (target === "host") {
    const image = getHostTerminalImage();
    const hostCwd = resolveHostWorkingDirectory(cwd);

    return {
      args: [
        "run",
        "--rm",
        "-it",
        "--privileged",
        "--pid=host",
        "--network=host",
        image,
        "nsenter",
        "--target",
        "1",
        "--mount",
        "--uts",
        "--ipc",
        "--net",
        "--pid",
        "--",
        HOST_SHELL,
        "-lc",
        [
          `export TERM=${shellQuote(TERMINAL_TYPE)}`,
          "export COLORTERM=truecolor",
          `cd ${shellQuote(hostCwd)} || cd /`,
          `exec ${HOST_SHELL} -l`,
        ].join("; "),
      ],
      command: "docker",
      cwd: process.cwd(),
      name: TERMINAL_TYPE,
      target,
    };
  }

  const shell =
    process.env.SHELL && path.isAbsolute(process.env.SHELL)
      ? process.env.SHELL
      : HOST_SHELL;
  const localCwd =
    typeof cwd === "string" && cwd.trim().length > 0
      ? path.resolve(cwd)
      : process.cwd();

  return {
    args: ["-l"],
    command: shell,
    cwd: localCwd,
    name: TERMINAL_TYPE,
    target,
  };
}

function sendJson(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

const port = Number.parseInt(
  process.env.VERCELAB_TERMINAL_WS_PORT ?? String(DEFAULT_PORT),
  10,
);
const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  response.writeHead(404);
  response.end();
});
const terminalServer = new WebSocketServer({
  path: "/terminal/ws",
  server,
});

terminalServer.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/terminal/ws", "http://127.0.0.1");
  const cols = Number.parseInt(url.searchParams.get("cols") ?? "120", 10);
  const rows = Number.parseInt(url.searchParams.get("rows") ?? "36", 10);
  const cwd = url.searchParams.get("cwd") ?? undefined;
  let terminal = null;

  try {
    const launch = buildPtyLaunch({
      cwd,
    });

    terminal = pty.spawn(launch.command, launch.args, {
      cols: Number.isFinite(cols) ? cols : 120,
      cwd: launch.cwd,
      env: {
        ...process.env,
        COLORTERM: "truecolor",
        TERM: TERMINAL_TYPE,
      },
      name: launch.name,
      rows: Number.isFinite(rows) ? rows : 36,
    });

    sendJson(socket, {
      target: launch.target,
      type: "ready",
    });

    terminal.onData((data) => {
      sendJson(socket, {
        data,
        type: "output",
      });
    });

    terminal.onExit(({ exitCode, signal }) => {
      sendJson(socket, {
        exitCode,
        signal,
        type: "exit",
      });
      socket.close();
    });
  } catch (error) {
    sendJson(socket, {
      data:
        error instanceof Error
          ? error.message
          : "Unable to start terminal session.",
      type: "error",
    });
    socket.close();
    return;
  }

  socket.on("message", (message) => {
    if (!terminal) {
      return;
    }

    try {
      const payload = JSON.parse(message.toString());

      if (payload.type === "input" && typeof payload.data === "string") {
        terminal.write(payload.data);
      }

      if (payload.type === "resize") {
        const nextCols = Number.parseInt(String(payload.cols), 10);
        const nextRows = Number.parseInt(String(payload.rows), 10);

        if (Number.isFinite(nextCols) && Number.isFinite(nextRows)) {
          terminal.resize(Math.max(20, nextCols), Math.max(8, nextRows));
        }
      }
    } catch {
      // Ignore malformed client messages.
    }
  });

  socket.on("close", () => {
    terminal?.kill();
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Vercelab terminal websocket listening on :${port}`);
});
