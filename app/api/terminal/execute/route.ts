import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COMMAND_TIMEOUT_MS = 30000;
const MAX_COMMAND_LENGTH = 4000;
const MAX_OUTPUT_CHARS = 60000;

type RunCommandResult = {
  clipped: boolean;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
};

function getShell() {
  return process.env.SHELL && path.isAbsolute(process.env.SHELL)
    ? process.env.SHELL
    : "/bin/bash";
}

function appendOutput(
  current: string,
  chunk: Buffer,
  onClip: () => void,
) {
  const next = current + chunk.toString("utf8");

  if (next.length <= MAX_OUTPUT_CHARS) {
    return next;
  }

  onClip();
  return next.slice(next.length - MAX_OUTPUT_CHARS);
}

async function resolveWorkingDirectory(value: unknown) {
  const requested =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : process.cwd();
  const resolved = path.resolve(requested);
  const info = await stat(resolved);

  if (!info.isDirectory()) {
    throw new Error("Working directory is not a directory.");
  }

  await access(resolved, constants.R_OK | constants.X_OK);

  return resolved;
}

async function readUbuntuName() {
  try {
    const release = await readFile("/etc/os-release", "utf8");
    const prettyName = release
      .split("\n")
      .find((line) => line.startsWith("PRETTY_NAME="))
      ?.replace("PRETTY_NAME=", "")
      .replace(/^"|"$/g, "");

    return prettyName ?? null;
  } catch {
    return null;
  }
}

function stripMarkers(stdout: string, token: string) {
  const exitPattern = new RegExp(
    `\\n?__VERCELAB_${token}_EXIT__:(\\d+)\\n?`,
  );
  const cwdPattern = new RegExp(`__VERCELAB_${token}_CWD__:(.*)\\n?`);
  const exitMatch = stdout.match(exitPattern);
  const cwdMatch = stdout.match(cwdPattern);

  return {
    cwd: cwdMatch?.[1] ?? null,
    exitCode: exitMatch?.[1] ? Number.parseInt(exitMatch[1], 10) : null,
    stdout: stdout.replace(exitPattern, "").replace(cwdPattern, ""),
  };
}

function runCommand(command: string, cwd: string): Promise<RunCommandResult> {
  const shell = getShell();
  const token = randomUUID().replace(/-/g, "");
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  let clipped = false;
  let timedOut = false;
  let killTimer: NodeJS.Timeout | null = null;

  return new Promise((resolve, reject) => {
    const child = spawn(shell, ["-s"], {
      cwd,
      env: {
        ...process.env,
        TERM: process.env.TERM ?? "xterm-256color",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 1500);
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk, () => {
        clipped = true;
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk, () => {
        clipped = true;
      });
    });

    child.on("error", (error) => {
      clearTimeout(timeout);

      if (killTimer) {
        clearTimeout(killTimer);
      }

      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (killTimer) {
        clearTimeout(killTimer);
      }

      const parsed = stripMarkers(stdout, token);

      resolve({
        clipped,
        cwd: parsed.cwd ?? cwd,
        durationMs: Date.now() - startedAt,
        exitCode: parsed.exitCode ?? code,
        stderr,
        stdout: parsed.stdout,
        timedOut,
      });
    });

    child.stdin.end(
      [
        "set +e",
        command,
        "__vercelab_status=$?",
        `printf '\\n__VERCELAB_${token}_EXIT__:%s\\n' "$__vercelab_status"`,
        `printf '__VERCELAB_${token}_CWD__:%s\\n' "$PWD"`,
      ].join("\n"),
    );
  });
}

export async function GET() {
  const username = (() => {
    try {
      return os.userInfo().username;
    } catch {
      return process.env.USER ?? "server";
    }
  })();
  const osName = (await readUbuntuName()) ?? `${os.type()} ${os.release()}`;

  return Response.json({
    arch: os.arch(),
    cwd: process.cwd(),
    hostname: os.hostname(),
    osName,
    platform: os.platform(),
    shell: getShell(),
    username,
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    command?: unknown;
    cwd?: unknown;
  } | null;
  const command = typeof body?.command === "string" ? body.command : "";

  if (command.trim().length === 0) {
    return Response.json(
      {
        error: "Command is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (command.length > MAX_COMMAND_LENGTH) {
    return Response.json(
      {
        error: `Command is limited to ${MAX_COMMAND_LENGTH} characters.`,
      },
      {
        status: 400,
      },
    );
  }

  try {
    const cwd = await resolveWorkingDirectory(body?.cwd);
    const result = await runCommand(command, cwd);

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Unable to execute command.",
      },
      {
        status: 400,
      },
    );
  }
}
