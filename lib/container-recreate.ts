import "server-only";

import { spawn } from "node:child_process";

import { getAppConfig } from "@/lib/app-config";
import {
  buildDefaultHostedDomain,
  buildTraefikLabels,
  buildTraefikRouterName,
  buildTraefikTcpLabels,
  toContainerSlug,
} from "@/lib/container-routing";
import { inspectContainer } from "@/lib/container-inspect";
import type { ExposureMode } from "@/lib/validation";

export type RecreateChanges = {
  name?: string;
  image?: string;
  envVars?: Array<{ key: string; value: string }>;
  port?: number;
  exposureMode?: ExposureMode;
};

async function runCommand(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

      if (code === 0) {
        resolve(output);
      } else {
        reject(
          new Error(
            [
              output,
              `${command} ${args.join(" ")} exited with status ${code}.`,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        );
      }
    });
  });
}

async function stopAndRemoveContainer(containerId: string) {
  try {
    await runCommand("docker", ["stop", containerId]);
  } catch {
    // Container may already be stopped — ignore
  }

  await runCommand("docker", ["rm", "-f", containerId]);
}

export async function recreateContainer(
  containerId: string,
  changes: RecreateChanges,
): Promise<{ newContainerId: string; containerName: string; warning?: string }> {
  const current = await inspectContainer(containerId);
  const config = getAppConfig();

  const newName =
    changes.name?.trim()
      ? toContainerSlug(changes.name)
      : current.name;

  const newImage = changes.image?.trim() || current.image;
  const newEnvVars = changes.envVars ?? current.envVars;

  const resolvedExposureMode: ExposureMode =
    changes.exposureMode ??
    (current.traefikMethod === "tcp"
      ? "tcp"
      : current.traefikMethod && current.traefikPort
        ? "http"
        : current.portBindings.length > 0
          ? "host"
          : "internal");

  const resolvedPort = changes.port
    ? changes.port
    : current.traefikPort
      ? Number.parseInt(current.traefikPort, 10)
      : null;

  const baseArgs = [
    "run",
    "-d",
    "--name",
    newName,
    "--restart",
    "unless-stopped",
    "--network",
    config.proxy.network,
  ];

  for (const { key, value } of newEnvVars) {
    baseArgs.push("-e", `${key}=${value}`);
  }

  let warning: string | undefined;

  if (current.labels["com.docker.compose.project"]) {
    warning =
      "This container was part of a compose project. It has been recreated as a standalone container.";
  }

  const args = [...baseArgs];

  if (resolvedExposureMode === "http") {
    const port = resolvedPort ?? 80;
    const routedHost = buildDefaultHostedDomain(newName, config.baseDomain);

    for (const [key, value] of Object.entries(
      buildTraefikLabels({
        entrypoint: config.proxy.entrypoint,
        host: routedHost,
        network: config.proxy.network,
        port,
        routerName: buildTraefikRouterName(newName),
      }),
    )) {
      args.push("--label", `${key}=${value}`);
    }
  } else if (resolvedExposureMode === "tcp") {
    const port = resolvedPort ?? 80;
    const entrypoint = `tcp-${port}`;

    for (const [key, value] of Object.entries(
      buildTraefikTcpLabels({
        entrypoint,
        network: config.proxy.network,
        port,
        routerName: buildTraefikRouterName(newName),
      }),
    )) {
      args.push("--label", `${key}=${value}`);
    }
  } else if (resolvedExposureMode === "host") {
    args.push("--label", "traefik.enable=false");

    for (const binding of current.portBindings) {
      args.push("-p", `${binding.hostPort}:${binding.containerPort.replace(/\/tcp$/, "")}`);
    }
  } else {
    args.push("--label", "traefik.enable=false");
  }

  args.push(newImage);

  await stopAndRemoveContainer(containerId);

  const output = await runCommand("docker", args);
  const newContainerId = output.split(/\r?\n/).filter(Boolean).at(-1)?.trim() ?? output;

  return {
    newContainerId,
    containerName: newName,
    warning,
  };
}
