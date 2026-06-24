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
const HOST_SHELL = "/bin/bash";
const TERMINAL_TYPE = "xterm-256color";

type RunCommandResult = {
  clipped: boolean;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
};

type TerminalTarget = "container" | "host";

function getShell() {
  return process.env.SHELL && path.isAbsolute(process.env.SHELL)
      ? process.env.SHELL
      : "/bin/bash";
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
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

function resolveHostWorkingDirectory(value: unknown) {
  const requested =
      typeof value === "string" && value.trim().length > 0
          ? value.trim()
          : (process.env.VERCELAB_HOST_ROOT ?? "/");

  return path.posix.resolve("/", requested);
}

async function isRunningInContainer() {
  try {
    await access("/.dockerenv", constants.F_OK);
    return true;
  } catch {
    // Continue with cgroup detection below.
  }

  try {
    const cgroup = await readFile("/proc/1/cgroup", "utf8");

    return /docker|containerd|kubepods/i.test(cgroup);
  } catch {
    return false;
  }
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

async function getTerminalTarget(): Promise<TerminalTarget> {
  const inContainer = await isRunningInContainer();

  if (process.env.VERCELAB_TERMINAL_TARGET === "container") {
    return "container";
  }

  if (process.env.VERCELAB_TERMINAL_TARGET === "host") {
    return inContainer ? "host" : "container";
  }

  return inContainer ? "host" : "container";
}

function runProcess(
    executable: string,
    args: string[],
    options?: {
      input?: string;
      timeoutMs?: number;
    },
): Promise<{
  code: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}> {
  const timeoutMs = options?.timeoutMs ?? COMMAND_TIMEOUT_MS;
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let killTimer: NodeJS.Timeout | null = null;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
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
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
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

      resolve({
        code,
        stderr,
        stdout,
        timedOut,
      });
    });

    child.stdin.on("error", () => {
      // The child can exit before consuming stdin when Docker/nsenter fails.
    });

    child.stdin.end(options?.input ?? "");
  });
}

async function readSelfContainerId() {
  try {
    return (await readFile("/etc/hostname", "utf8")).trim();
  } catch {
    return os.hostname();
  }
}

async function getHostTerminalImage() {
  if (process.env.VERCELAB_HOST_TERMINAL_IMAGE?.trim()) {
    return process.env.VERCELAB_HOST_TERMINAL_IMAGE.trim();
  }

  const containerId = await readSelfContainerId();
  const inspected = await runProcess(
      "docker",
      ["inspect", "--format", "{{.Config.Image}}", containerId],
      {
        timeoutMs: 5000,
      },
  );
  const image = inspected.stdout.trim();

  if (inspected.code === 0 && image.length > 0 && image !== "<no value>") {
    return image;
  }

  throw new Error(
      "Unable to resolve the control-plane image for host terminal access. Set VERCELAB_HOST_TERMINAL_IMAGE.",
  );
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

async function buildHostDockerArgs() {
  const image = await getHostTerminalImage();

  return [
    "run",
    "--rm",
    "-i",
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
    "-s",
  ];
}

async function runCommand(
    command: string,
    cwd: string,
    target: TerminalTarget,
): Promise<RunCommandResult> {
  const executable = target === "host" ? "docker" : getShell();
  const args = target === "host" ? await buildHostDockerArgs() : ["-s"];
  const token = randomUUID().replace(/-/g, "");
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  let clipped = false;
  let timedOut = false;
  let killTimer: NodeJS.Timeout | null = null;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: target === "host" ? process.cwd() : cwd,
      env: {
        ...process.env,
        TERM: process.env.TERM ?? TERMINAL_TYPE,
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

    child.stdin.on("error", () => {
      // The child can exit before consuming stdin when Docker/nsenter fails.
    });

    child.stdin.end(
        [
          `export TERM=${shellQuote(TERMINAL_TYPE)}`,
          "export COLORTERM=truecolor",
          "export COLUMNS=${COLUMNS:-120}",
          "export LINES=${LINES:-40}",
          `cd ${shellQuote(cwd)} || exit 127`,
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
  try {
    const target = await getTerminalTarget();

    if (target === "host") {
      const cwd = resolveHostWorkingDirectory(undefined);
      const info = await runCommand(
          [
            "printf '__VERCELAB_INFO_USER__:%s\\n' \"$(id -un 2>/dev/null || printf root)\"",
            "printf '__VERCELAB_INFO_HOST__:%s\\n' \"$(hostname 2>/dev/null || printf host)\"",
            "printf '__VERCELAB_INFO_OS__:%s\\n' \"$(. /etc/os-release 2>/dev/null && printf \"%s\" \"$PRETTY_NAME\" || uname -sr)\"",
            "printf '__VERCELAB_INFO_ARCH__:%s\\n' \"$(uname -m 2>/dev/null || printf unknown)\"",
          ].join("\n"),
          cwd,
          target,
      );
      const readInfo = (key: string) =>
          info.stdout.match(new RegExp(`__VERCELAB_INFO_${key}__:(.*)`))?.[1] ??
          "";

      return Response.json({
        arch: readInfo("ARCH") || os.arch(),
        cwd: info.cwd,
        hostname: readInfo("HOST") || "host",
        osName: readInfo("OS") || "Ubuntu host",
        platform: "linux",
        shell: HOST_SHELL,
        target,
        username: readInfo("USER") || "root",
      });
    }

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
      target,
      username,
    });
  } catch (error) {
    return Response.json(
        {
          error:
              error instanceof Error && error.message.trim().length > 0
                  ? error.message
                  : "Unable to open host shell.",
        },
        {
          status: 503,
        },
    );
  }
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
    const target = await getTerminalTarget();
    const cwd =
        target === "host"
            ? resolveHostWorkingDirectory(body?.cwd)
            : await resolveWorkingDirectory(body?.cwd);
    const result = await runCommand(command, cwd, target);

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
