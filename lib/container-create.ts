import "server-only";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { getAppConfig } from "@/lib/app-config";
import {
  buildDefaultHostedDomain,
  buildTraefikLabels,
  buildTraefikRouterName,
  toContainerSlug,
} from "@/lib/container-routing";

export type CatalogImage = {
  description: string | null;
  isOfficial: boolean;
  name: string;
  pullCount: number;
  starCount: number;
};

type CreateFromImageInput = {
  containerName?: string;
  envVariables?: string;
  image: string;
  ports?: string;
};

type CreateFromComposeInput = {
  composeContent: string;
  stackName?: string;
};

type CommandOptions = {
  cwd?: string;
  env?: Partial<NodeJS.ProcessEnv>;
};

function parseEnvVariables(rawValue?: string) {
  if (!rawValue) {
    return [] as Array<{ key: string; value: string }>;
  }

  const parsed: Array<{ key: string; value: string }> = [];

  for (const line of rawValue.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 1) {
      throw new Error(
        `Invalid environment variable line "${trimmed}". Use KEY=VALUE format.`,
      );
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(
        `Invalid environment variable key "${key}". Use letters, numbers, and underscores only.`,
      );
    }

    parsed.push({ key, value });
  }

  return parsed;
}

function parsePortMappings(rawValue?: string) {
  if (!rawValue) {
    return [] as string[];
  }

  const seen = new Set<string>();
  const parsed: string[] = [];

  for (const part of rawValue.split(/[\n,]/)) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    if (!/^\d{1,5}(?::\d{1,5})?(?:\/(tcp|udp))?$/.test(trimmed)) {
      throw new Error(
        `Invalid port mapping "${trimmed}". Use HOST:CONTAINER or CONTAINER format.`,
      );
    }

    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      parsed.push(trimmed);
    }
  }

  return parsed;
}

function resolveInternalPortFromMapping(mapping: string) {
  const normalized = mapping.trim().split("/")[0] ?? "";
  const portSegment = normalized.split(":").at(-1) ?? "";
  const parsed = Number.parseInt(portSegment, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizePortValue(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function choosePreferredPort(ports: Array<number | null>) {
  const candidates = ports.filter(
    (port): port is number => typeof port === "number" && port > 0,
  );

  if (!candidates.length) {
    return null;
  }

  for (const preferredPort of [80, 8080, 3000, 8000, 5000, 5173]) {
    if (candidates.includes(preferredPort)) {
      return preferredPort;
    }
  }

  return candidates[0] ?? null;
}

async function ensureProxyNetwork(network: string) {
  try {
    await runCommand("docker", ["network", "inspect", network]);
  } catch {
    await runCommand("docker", ["network", "create", network]);
  }
}

async function inspectImageExposedPorts(image: string) {
  const inspect = async () =>
    await runCommand("docker", [
      "image",
      "inspect",
      image,
      "--format",
      "{{json .Config.ExposedPorts}}",
    ]);

  let output: string;

  try {
    output = await inspect();
  } catch {
    await runCommand("docker", ["pull", image]);
    output = await inspect();
  }

  if (!output || output === "null") {
    return [] as number[];
  }

  const exposedPorts = JSON.parse(output) as Record<string, unknown> | null;

  return Object.keys(exposedPorts ?? {}).map(resolveInternalPortFromMapping);
}

async function resolveImageContainerPort(
  image: string,
  portMappings: string[],
) {
  const mappedPort = choosePreferredPort(
    portMappings.map(resolveInternalPortFromMapping),
  );

  if (mappedPort) {
    return mappedPort;
  }

  return choosePreferredPort(await inspectImageExposedPorts(image));
}

function extractComposeNetworks(serviceConfig: unknown): string[] {
  if (!serviceConfig || typeof serviceConfig !== "object") {
    return ["default"];
  }

  const service = serviceConfig as { networks?: unknown };

  if (!service.networks) {
    return ["default"];
  }

  if (Array.isArray(service.networks)) {
    return service.networks
      .filter((network): network is string => typeof network === "string")
      .filter(Boolean);
  }

  if (typeof service.networks === "object") {
    return Object.keys(service.networks as Record<string, unknown>);
  }

  return ["default"];
}

function resolveComposeServicePort(serviceConfig: unknown) {
  if (!serviceConfig || typeof serviceConfig !== "object") {
    return null;
  }

  const service = serviceConfig as {
    expose?: unknown;
    ports?: unknown;
  };

  if (Array.isArray(service.ports)) {
    const portFromMappings = choosePreferredPort(
      service.ports.map((entry) => {
        if (typeof entry === "string") {
          return resolveInternalPortFromMapping(entry);
        }

        if (entry && typeof entry === "object") {
          return normalizePortValue(
            (entry as { target?: unknown }).target,
          );
        }

        return null;
      }),
    );

    if (portFromMappings) {
      return portFromMappings;
    }
  }

  if (Array.isArray(service.expose)) {
    return choosePreferredPort(
      service.expose.map((entry) => normalizePortValue(entry)),
    );
  }

  return null;
}

async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
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

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

      if (code === 0) {
        resolve(output);
        return;
      }

      reject(
        new Error(
          [output, `${command} ${args.join(" ")} exited with status ${code}.`]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}

export async function searchContainerCatalog(query: string) {
  const normalized = query.trim();

  if (normalized.length < 2) {
    return [] as CatalogImage[];
  }

  const response = await fetch(
    `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(normalized)}&page_size=12&page=1`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Container catalog request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      is_official?: boolean;
      pull_count?: number;
      repo_name?: string;
      short_description?: string;
      star_count?: number;
    }>;
  };

  return (payload.results ?? [])
    .map((entry) => ({
      description: entry.short_description ?? null,
      isOfficial: Boolean(entry.is_official),
      name: entry.repo_name?.trim() ?? "",
      pullCount: Number(entry.pull_count ?? 0),
      starCount: Number(entry.star_count ?? 0),
    }))
    .filter((entry) => entry.name.length > 0);
}

export async function createContainerFromImage(input: CreateFromImageInput) {
  const image = input.image.trim();

  if (!image) {
    throw new Error("Image is required.");
  }

  const config = getAppConfig();
  const portMappings = parsePortMappings(input.ports);
  const containerPort = await resolveImageContainerPort(image, portMappings);

  if (!containerPort) {
    throw new Error(
      "Unable to determine a web port for this image. Add a port mapping or use an image that exposes an application port.",
    );
  }

  const normalizedName = input.containerName?.trim()
    ? toContainerSlug(input.containerName)
    : "";
  const containerName =
    normalizedName || `container-${Date.now().toString(36).slice(-8)}`;
  const routedHost = buildDefaultHostedDomain(containerName, config.baseDomain);
  const args = [
    "run",
    "-d",
    "--name",
    containerName,
    "--restart",
    "unless-stopped",
    "--network",
    config.proxy.network,
  ];

  for (const [key, value] of Object.entries(
    buildTraefikLabels({
      entrypoint: config.proxy.entrypoint,
      host: routedHost,
      network: config.proxy.network,
      port: containerPort,
      routerName: buildTraefikRouterName(containerName),
    }),
  )) {
    args.push("--label", `${key}=${value}`);
  }

  for (const mapping of portMappings) {
    args.push("-p", mapping);
  }

  const envVariables = parseEnvVariables(input.envVariables);

  for (const envVariable of envVariables) {
    args.push("-e", `${envVariable.key}=${envVariable.value}`);
  }

  await ensureProxyNetwork(config.proxy.network);
  args.push(image);

  const output = await runCommand("docker", args);
  const containerId = output.split(/\r?\n/).filter(Boolean).at(-1) ?? output;

  return {
    containerId: containerId.trim(),
    containerName,
    domain: routedHost,
    image,
    url: `https://${routedHost}`,
  };
}

export async function createContainerFromCompose(input: CreateFromComposeInput) {
  const composeContent = input.composeContent.trim();

  if (!composeContent) {
    throw new Error("Compose content is required.");
  }

  let parsedCompose: unknown;

  try {
    parsedCompose = parseYaml(composeContent);
  } catch {
    throw new Error("Compose YAML is invalid.");
  }

  if (!parsedCompose || typeof parsedCompose !== "object") {
    throw new Error("Compose YAML must define an object with services.");
  }

  const composeObject = parsedCompose as {
    services?: Record<string, unknown>;
  };
  const services = Object.keys(composeObject.services ?? {});

  if (!services.length) {
    throw new Error("Compose file must include at least one service.");
  }

  const requestedStackName = input.stackName?.trim() ?? "";
  const stackName = toContainerSlug(requestedStackName || `stack-${Date.now()}`);

  if (!stackName) {
    throw new Error("Stack name is invalid.");
  }

  const config = getAppConfig();
  const stacksRoot = path.join(config.paths.appsDir, "manual-stacks");
  const stackDir = path.join(stacksRoot, stackName);
  const composePath = path.join(stackDir, ".vercelab.base.compose.yml");
  const overridePath = path.join(stackDir, ".vercelab.proxy.compose.yml");
  const overrideServices: Record<string, unknown> = {};
  const routedHosts: string[] = [];

  for (const serviceName of services) {
    const serviceConfig = composeObject.services?.[serviceName];
    const containerPort = resolveComposeServicePort(serviceConfig);

    if (!containerPort) {
      continue;
    }

    const routeSlug =
      services.length === 1
        ? stackName
        : toContainerSlug(`${stackName}-${serviceName}`);
    const routedHost = buildDefaultHostedDomain(routeSlug, config.baseDomain);
    const networks = Array.from(
      new Set([...extractComposeNetworks(serviceConfig), config.proxy.network]),
    );

    overrideServices[serviceName] = {
      labels: buildTraefikLabels({
        entrypoint: config.proxy.entrypoint,
        host: routedHost,
        network: config.proxy.network,
        port: containerPort,
        routerName: buildTraefikRouterName(`${stackName}-${serviceName}`),
      }),
      networks,
      restart: "unless-stopped",
    };
    routedHosts.push(routedHost);
  }

  if (!Object.keys(overrideServices).length) {
    throw new Error(
      "Compose file must expose at least one service port so Vercelab can route it through Traefik.",
    );
  }

  await fs.mkdir(stackDir, { recursive: true });
  await fs.writeFile(composePath, composeContent, "utf8");
  await fs.writeFile(
    overridePath,
    stringifyYaml({
      services: overrideServices,
      networks: {
        [config.proxy.network]: {
          external: true,
          name: config.proxy.network,
        },
      },
    }),
    "utf8",
  );

  await ensureProxyNetwork(config.proxy.network);
  await runCommand("docker", [
    "compose",
    "-p",
    stackName,
    "-f",
    composePath,
    "-f",
    overridePath,
    "up",
    "-d",
  ]);

  return {
    composePath,
    domains: routedHosts,
    overridePath,
    services,
    stackName,
    urls: routedHosts.map((host) => `https://${host}`),
  };
}