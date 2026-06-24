import "server-only";

import { spawn } from "node:child_process";

export type ContainerPortBinding = {
  containerPort: string;
  hostPort: string;
};

export type ContainerInspectData = {
  id: string;
  name: string;
  image: string;
  imageVersion: string;
  appPort: string | null;
  traefikPort: string | null;
  traefikMethod: string | null;
  traefikRouterName: string | null;
  labels: Record<string, string>;
  envVars: Array<{ key: string; value: string }>;
  portBindings: ContainerPortBinding[];
};

type DockerInspectRaw = {
  Id: string;
  Name: string;
  Config: {
    Image: string;
    Env: string[] | null;
    ExposedPorts: Record<string, unknown> | null;
    Labels: Record<string, string> | null;
  };
  HostConfig: {
    PortBindings: Record<string, Array<{ HostPort: string }> | null> | null;
  };
};

async function runDockerInspect(containerId: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("docker", ["inspect", "--format", "{{json .}}", containerId], {
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
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `docker inspect exited with status ${code}.`));
      }
    });
  });
}

function extractImageVersion(image: string): string {
  const colonIndex = image.lastIndexOf(":");
  if (colonIndex === -1) {
    return "latest";
  }
  const tag = image.slice(colonIndex + 1);
  return tag || "latest";
}

function parseEnvVars(envArray: string[] | null): Array<{ key: string; value: string }> {
  if (!envArray) {
    return [];
  }

  return envArray
    .map((entry) => {
      const eqIndex = entry.indexOf("=");
      if (eqIndex === -1) {
        return { key: entry, value: "" };
      }
      return {
        key: entry.slice(0, eqIndex),
        value: entry.slice(eqIndex + 1),
      };
    })
    .filter(({ key }) => key.length > 0);
}

function parsePortBindings(
  portBindings: Record<string, Array<{ HostPort: string }> | null> | null,
): ContainerPortBinding[] {
  if (!portBindings) {
    return [];
  }

  const result: ContainerPortBinding[] = [];

  for (const [containerPort, bindings] of Object.entries(portBindings)) {
    if (!bindings) {
      continue;
    }
    for (const binding of bindings) {
      if (binding.HostPort) {
        result.push({ containerPort, hostPort: binding.HostPort });
      }
    }
  }

  return result;
}

function extractFirstExposedPort(
  exposedPorts: Record<string, unknown> | null,
): string | null {
  if (!exposedPorts) {
    return null;
  }
  const ports = Object.keys(exposedPorts);
  return ports[0] ?? null;
}

function extractTraefikInfo(labels: Record<string, string> | null): {
  traefikPort: string | null;
  traefikMethod: string | null;
  traefikRouterName: string | null;
} {
  if (!labels) {
    return { traefikPort: null, traefikMethod: null, traefikRouterName: null };
  }

  let traefikPort: string | null = null;
  let traefikMethod: string | null = null;
  let traefikRouterName: string | null = null;

  for (const [key, value] of Object.entries(labels)) {
    const httpServiceMatch =
      /^traefik\.http\.services\.([^.]+)\.loadbalancer\.server\.port$/.exec(key);

    if (httpServiceMatch) {
      traefikPort = value;
      traefikMethod = "http";
      traefikRouterName ??= httpServiceMatch[1];
      continue;
    }

    const tcpServiceMatch =
      /^traefik\.tcp\.services\.([^.]+)\.loadbalancer\.server\.port$/.exec(key);

    if (tcpServiceMatch) {
      traefikPort = value;
      traefikMethod = "tcp";
      traefikRouterName ??= tcpServiceMatch[1];
      continue;
    }

    const entrypointMatch =
      /^traefik\.http\.routers\.([^.]+)\.entrypoints$/.exec(key);

    if (entrypointMatch && traefikMethod !== "tcp") {
      traefikMethod = value;
      traefikRouterName ??= entrypointMatch[1];
    }
  }

  return { traefikPort, traefikMethod, traefikRouterName };
}

export async function inspectContainer(containerId: string): Promise<ContainerInspectData> {
  const raw = await runDockerInspect(containerId);

  let parsed: DockerInspectRaw;

  try {
    parsed = JSON.parse(raw) as DockerInspectRaw;
  } catch {
    throw new Error("Unable to parse docker inspect output.");
  }

  const labels = parsed.Config.Labels ?? {};
  const { traefikPort, traefikMethod, traefikRouterName } = extractTraefikInfo(labels);

  const appPort =
    extractFirstExposedPort(parsed.Config.ExposedPorts) ??
    (parsed.HostConfig.PortBindings
      ? Object.keys(parsed.HostConfig.PortBindings)[0] ?? null
      : null);

  return {
    id: parsed.Id,
    name: parsed.Name.replace(/^\//, ""),
    image: parsed.Config.Image,
    imageVersion: extractImageVersion(parsed.Config.Image),
    appPort,
    traefikPort,
    traefikMethod,
    traefikRouterName,
    labels,
    envVars: parseEnvVars(parsed.Config.Env),
    portBindings: parsePortBindings(parsed.HostConfig.PortBindings),
  };
}
