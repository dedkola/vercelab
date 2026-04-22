import "server-only";

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { getAppConfig } from "@/lib/app-config";

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

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

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

  const normalizedName = input.containerName?.trim()
    ? toSlug(input.containerName)
    : "";
  const containerName =
    normalizedName || `container-${Date.now().toString(36).slice(-8)}`;
  const args = ["run", "-d", "--name", containerName];

  for (const mapping of parsePortMappings(input.ports)) {
    args.push("-p", mapping);
  }

  for (const envVariable of parseEnvVariables(input.envVariables)) {
    args.push("-e", `${envVariable.key}=${envVariable.value}`);
  }

  args.push(image);

  const output = await runCommand("docker", args);
  const containerId = output.split(/\r?\n/).filter(Boolean).at(-1) ?? output;

  return {
    containerId: containerId.trim(),
    containerName,
    image,
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
  const stackName = toSlug(requestedStackName || `stack-${Date.now()}`);

  if (!stackName) {
    throw new Error("Stack name is invalid.");
  }

  const stacksRoot = path.join(getAppConfig().paths.appsDir, "manual-stacks");
  const stackDir = path.join(stacksRoot, stackName);
  const composePath = path.join(stackDir, "docker-compose.yml");

  await fs.mkdir(stackDir, { recursive: true });
  await fs.writeFile(composePath, composeContent, "utf8");

  await runCommand("docker", [
    "compose",
    "-p",
    stackName,
    "-f",
    composePath,
    "up",
    "-d",
  ]);

  return {
    composePath,
    services,
    stackName,
  };
}