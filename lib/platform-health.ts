import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";

import { getAppConfig } from "@/lib/app-config";

export type PlatformCheck = {
  id: string;
  label: string;
  ok: boolean;
  severity: "error" | "warning";
  message: string;
};

export type PlatformHealth = {
  ok: boolean;
  checks: PlatformCheck[];
};

const PLACEHOLDER_BASE_DOMAIN = "myhomelan.com";
const PLACEHOLDER_SECRET = "change-this-vercelab-secret";

function isWithinRoot(targetPath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, targetPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

async function runProbe(command: string, args: string[]) {
  return await new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      output += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        output: error.message,
      });
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        output: output.trim(),
      });
    });
  });
}

async function checkWritablePath(
  label: string,
  targetPath: string,
): Promise<PlatformCheck> {
  try {
    await access(targetPath, constants.W_OK);

    return {
      id: `path-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
      ok: true,
      severity: "error",
      message: `${targetPath} is writable.`,
    };
  } catch (error) {
    return {
      id: `path-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
      ok: false,
      severity: "error",
      message:
        error instanceof Error
          ? `${targetPath} is not writable: ${error.message}`
          : `${targetPath} is not writable.`,
    };
  }
}

export async function getPlatformHealth(): Promise<PlatformHealth> {
  const config = getAppConfig();
  const strictRuntime = config.env === "production";
  const checks: PlatformCheck[] = [];
  const runtimeSeverity: PlatformCheck["severity"] = strictRuntime
    ? "error"
    : "warning";

  checks.push({
    id: "base-domain",
    label: "Base domain",
    ok: config.baseDomain !== PLACEHOLDER_BASE_DOMAIN,
    severity: "warning",
    message:
      config.baseDomain !== PLACEHOLDER_BASE_DOMAIN
        ? `Configured for ${config.baseDomain}.`
        : "VERCELAB_BASE_DOMAIN is still using the example domain. Make sure your LAN DNS or hosts file points that hostname at this server.",
  });

  checks.push({
    id: "encryption-secret",
    label: "Encryption secret",
    ok: config.security.encryptionSecret !== PLACEHOLDER_SECRET,
    severity: runtimeSeverity,
    message:
      config.security.encryptionSecret !== PLACEHOLDER_SECRET
        ? "A non-default encryption secret is configured."
        : "VERCELAB_ENCRYPTION_SECRET is still using the default placeholder.",
  });

  checks.push({
    id: "host-root",
    label: "Shared host root",
    ok: Boolean(config.paths.hostRoot) || !strictRuntime,
    severity: runtimeSeverity,
    message: config.paths.hostRoot
      ? `Shared Docker host root is ${config.paths.hostRoot}.`
      : "VERCELAB_HOST_ROOT is not set. Use a shared absolute host path when running through the Docker socket.",
  });

  if (config.paths.hostRoot) {
    const managedPaths = [
      config.paths.appsDir,
      config.paths.logsDir,
      config.paths.locksDir,
      path.dirname(config.database.sqlitePath),
    ];
    const aligned = managedPaths.every((managedPath) =>
      isWithinRoot(managedPath, config.paths.hostRoot!),
    );

    checks.push({
      id: "host-path-alignment",
      label: "Host path alignment",
      ok: aligned,
      severity: runtimeSeverity,
      message: aligned
        ? "Managed paths live under VERCELAB_HOST_ROOT, so Docker build contexts resolve on the host."
        : "Managed paths must stay under VERCELAB_HOST_ROOT when deployments run through the host Docker socket.",
    });
  }

  checks.push(
    await checkWritablePath("Apps directory", config.paths.appsDir),
    await checkWritablePath("Logs directory", config.paths.logsDir),
    await checkWritablePath("Locks directory", config.paths.locksDir),
    await checkWritablePath(
      "Database directory",
      path.dirname(config.database.sqlitePath),
    ),
  );

  try {
    const socketStats = await stat(config.runtime.dockerSocketPath);

    checks.push({
      id: "docker-socket",
      label: "Docker socket",
      ok: socketStats.isSocket(),
      severity: runtimeSeverity,
      message: socketStats.isSocket()
        ? `Docker socket is available at ${config.runtime.dockerSocketPath}.`
        : `${config.runtime.dockerSocketPath} exists but is not a Unix socket.`,
    });
  } catch (error) {
    checks.push({
      id: "docker-socket",
      label: "Docker socket",
      ok: false,
      severity: runtimeSeverity,
      message:
        error instanceof Error
          ? `Docker socket is unavailable: ${error.message}`
          : "Docker socket is unavailable.",
    });
  }

  try {
    const procStats = await stat(config.runtime.hostProcPath);

    checks.push({
      id: "host-proc",
      label: "Host metrics mount",
      ok: procStats.isDirectory(),
      severity: runtimeSeverity,
      message: procStats.isDirectory()
        ? `Host metrics path is available at ${config.runtime.hostProcPath}.`
        : `${config.runtime.hostProcPath} exists but is not a directory.`,
    });
  } catch (error) {
    checks.push({
      id: "host-proc",
      label: "Host metrics mount",
      ok: false,
      severity: runtimeSeverity,
      message:
        error instanceof Error
          ? `Host metrics path is unavailable: ${error.message}`
          : "Host metrics path is unavailable.",
    });
  }

  const dockerServer = await runProbe("docker", [
    "version",
    "--format",
    "{{.Server.Version}}",
  ]);

  checks.push({
    id: "docker-server",
    label: "Docker server",
    ok: dockerServer.ok,
    severity: runtimeSeverity,
    message: dockerServer.ok
      ? `Docker server ${dockerServer.output || "is reachable"}.`
      : dockerServer.output || "Docker server is unavailable.",
  });

  const composePlugin = await runProbe("docker", ["compose", "version"]);

  checks.push({
    id: "docker-compose",
    label: "Docker Compose",
    ok: composePlugin.ok,
    severity: runtimeSeverity,
    message: composePlugin.ok
      ? composePlugin.output || "Docker Compose is available."
      : composePlugin.output || "Docker Compose is unavailable.",
  });

  return {
    ok: checks.every((check) => check.ok || check.severity === "warning"),
    checks,
  };
}
