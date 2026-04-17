import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { open } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

import { stringify } from "yaml";

import { getAppConfig } from "@/lib/app-config";
import {
  completeOperation,
  createDeploymentRecord,
  createOperation,
  deleteDeploymentRecord,
  getLatestDeploymentOperation,
  getStoredDeploymentById,
  readDeploymentSecretToken,
  updateDeploymentRecord,
  type OperationType,
  type StoredDeployment,
} from "@/lib/persistence";
import {
  createDeploymentSchema,
  updateDeploymentSettingsSchema,
} from "@/lib/validation";

type CommandOptions = {
  cwd?: string;
  env?: Partial<NodeJS.ProcessEnv>;
};

type RuntimeFiles = {
  composeMode: "dockerfile" | "compose";
  composeFile: string;
  serviceName: string | null;
  fileArgs: string[];
};

type ReadComposeLogsOptions = {
  includeAllServices?: boolean;
  tail?: number;
  timestamps?: boolean;
};

function parseDeploymentEnvVariables(
  rawValue: string | null,
): Record<string, string> {
  if (!rawValue) {
    return {};
  }

  const parsed: Record<string, string> = {};
  const lines = rawValue.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex < 1) {
      throw new Error(
        `Invalid environment variable line \"${trimmed}\". Use KEY=VALUE format.`,
      );
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(
        `Invalid environment variable key \"${key}\". Use letters, numbers, and underscores only.`,
      );
    }

    parsed[key] = value;
  }

  return parsed;
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

function normalizeStringInput(
  value: FormDataEntryValue | string | null | undefined,
) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeDomainInput(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new Error("Domain is required.");
  }

  const candidate = /^https?:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `https://${trimmedValue}`;

  let hostname: string;

  try {
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch {
    throw new Error("Enter a valid domain or subdomain.");
  }

  const baseDomain = getAppConfig().baseDomain.toLowerCase();
  const normalizedHost = hostname.replace(/\.$/, "");

  if (normalizedHost === baseDomain) {
    throw new Error(`Domain must include a subdomain before ${baseDomain}.`);
  }

  if (normalizedHost.endsWith(`.${baseDomain}`)) {
    return normalizedHost.slice(0, -(baseDomain.length + 1));
  }

  if (normalizedHost.includes(".")) {
    throw new Error(`Domain must stay under ${baseDomain}.`);
  }

  return normalizedHost;
}

function truncateOutput(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.slice(-12000);
}

function normalizeDeploymentErrorMessage(message: string) {
  const trimmed = message.trim();

  if (/please add your mongo uri to \.env/i.test(trimmed)) {
    return [
      "Build failed: the app requires a Mongo URI during next build.",
      "Set the required database environment variable in that repository's Docker build flow (for example via Dockerfile ARG/ENV or compose build args), then redeploy.",
      "Tip: avoid throwing on missing env at module import time; validate inside the request handler so the build can complete.",
    ].join(" ");
  }

  if (/failed to collect page data/i.test(trimmed) && /\.env/i.test(trimmed)) {
    return [
      "Build failed while collecting Next.js route data because required environment variables were missing during build.",
      "Provide build-time env values in the app repository's Docker setup and redeploy.",
    ].join(" ");
  }

  return trimmed;
}

function buildGitCloneUrl(repositoryUrl: string, token: string | null) {
  if (!token) {
    return repositoryUrl;
  }

  const parsed = new URL(repositoryUrl);
  parsed.username = "x-access-token";
  parsed.password = token;
  return parsed.toString();
}

async function resolveDeploymentGitToken(deploymentId: string) {
  const storedToken = await readDeploymentSecretToken(deploymentId);

  if (storedToken) {
    return storedToken;
  }

  return getAppConfig().security.githubToken;
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

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function getLockPath() {
  return path.join(getAppConfig().paths.locksDir, "deployment-engine.lock");
}

async function withDeploymentLock<T>(task: () => Promise<T>) {
  const lockPath = getLockPath();
  let handle: FileHandle | undefined;

  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(
      `${process.pid}\n${new Date().toISOString()}\n`,
      "utf8",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Another deployment operation is already running.");
    }

    throw error;
  }

  try {
    return await task();
  } finally {
    await handle?.close();
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

async function ensureProxyNetwork() {
  const network = getAppConfig().proxy.network;

  try {
    await runCommand("docker", ["network", "inspect", network]);
  } catch {
    await runCommand("docker", ["network", "create", network]);
  }
}

async function removeWorkspace(workspacePath: string) {
  const resolvedWorkspace = path.resolve(workspacePath);
  const appsRoot = path.resolve(getAppConfig().paths.appsDir);

  if (!resolvedWorkspace.startsWith(appsRoot)) {
    throw new Error(
      "Refusing to remove a workspace outside the Vercelab apps directory.",
    );
  }

  await fs.rm(resolvedWorkspace, { recursive: true, force: true });
}

function getDefaultDomain(subdomain: string) {
  return `${subdomain}.${getAppConfig().baseDomain}`;
}

async function cloneRepository(deployment: StoredDeployment) {
  await removeWorkspace(deployment.workspacePath);
  await fs.mkdir(deployment.workspacePath, { recursive: true });

  const cloneUrl = buildGitCloneUrl(
    deployment.repositoryUrl,
    await resolveDeploymentGitToken(deployment.id),
  );

  const args = ["clone", "--depth", "1"];

  if (deployment.branch) {
    args.push("--branch", deployment.branch);
  }

  args.push(cloneUrl, deployment.workspacePath);

  return await runCommand("git", args);
}

async function deployWorkspace(
  deployment: StoredDeployment,
  syncWithGit: boolean,
) {
  await ensureProxyNetwork();

  const shouldClone =
    syncWithGit || !(await pathExists(deployment.workspacePath));
  const cloneOutput = shouldClone ? await cloneRepository(deployment) : "";
  const runtimeFiles = await detectRuntimeFiles(deployment);

  await updateDeploymentRecord(deployment.id, {
    composeMode: runtimeFiles.composeMode,
    composeFile: runtimeFiles.composeFile,
    serviceName: runtimeFiles.serviceName,
  });

  let composeOutput = "";

  try {
    composeOutput = await runComposeCommand(deployment, runtimeFiles, [
      "up",
      "-d",
      "--build",
    ]);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(normalizeDeploymentErrorMessage(error.message));
    }

    throw error;
  }

  return (
    truncateOutput([cloneOutput, composeOutput].filter(Boolean).join("\n\n")) ??
    ""
  );
}

async function detectRuntimeFiles(
  deployment: StoredDeployment,
): Promise<RuntimeFiles> {
  const deploymentEnvironment = parseDeploymentEnvVariables(
    deployment.envVariables,
  );
  const hasEnvironmentValues = Object.keys(deploymentEnvironment).length > 0;
  const composeCandidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];

  for (const candidate of composeCandidates) {
    const composePath = path.join(deployment.workspacePath, candidate);

    if (await pathExists(composePath)) {
      const { parse } = await import("yaml");
      const source = await fs.readFile(composePath, "utf8");
      const parsed = parse(source) as {
        services?: Record<string, unknown>;
      } | null;
      const serviceNames = Object.keys(parsed?.services ?? {});

      if (serviceNames.length === 0) {
        throw new Error("Compose file does not define any services.");
      }

      const selectedService =
        deployment.serviceName ??
        (serviceNames.length === 1 ? serviceNames[0] : null);

      if (!selectedService) {
        throw new Error(
          "This compose repository has multiple services. Enter the service name to expose through Traefik.",
        );
      }

      if (!serviceNames.includes(selectedService)) {
        throw new Error(
          `Compose service "${selectedService}" was not found in ${candidate}.`,
        );
      }

      const selectedServiceConfig = parsed?.services?.[selectedService];
      const selectedServiceHasBuild =
        selectedServiceConfig &&
        typeof selectedServiceConfig === "object" &&
        Object.hasOwn(selectedServiceConfig, "build");
      const networks = Array.from(
        new Set([
          ...extractComposeNetworks(selectedServiceConfig),
          getAppConfig().proxy.network,
        ]),
      );

      const routerName = `${deployment.projectName}-${selectedService}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const overridePath = path.join(
        deployment.workspacePath,
        ".vercelab.override.compose.yml",
      );

      const proxyEnvironment: Record<string, string> = {
        HOSTNAME: "0.0.0.0",
        ...deploymentEnvironment,
      };

      const serviceOverride: Record<string, unknown> = {
        networks,
        environment: proxyEnvironment,
        labels: {
          "traefik.enable": "true",
          "traefik.docker.network": getAppConfig().proxy.network,
          [`traefik.http.routers.${routerName}.rule`]: `Host(\`${getDefaultDomain(
            deployment.subdomain,
          )}\`)`,
          [`traefik.http.routers.${routerName}.entrypoints`]:
            getAppConfig().proxy.entrypoint,
          [`traefik.http.routers.${routerName}.tls`]: "true",
          [`traefik.http.services.${routerName}.loadbalancer.server.port`]:
            String(deployment.port),
        },
      };

      if (hasEnvironmentValues && selectedServiceHasBuild) {
        serviceOverride.build = {
          args: deploymentEnvironment,
        };
      }

      const override = {
        services: {
          [selectedService]: serviceOverride,
        },
        networks: {
          [getAppConfig().proxy.network]: {
            external: true,
            name: getAppConfig().proxy.network,
          },
        },
      };

      await fs.writeFile(overridePath, stringify(override), "utf8");

      // Write a cleaned base compose that strips host `ports` bindings from all
      // services so they can't conflict with other deployments on the same host.
      // Docker Compose merges port lists additively, so the only reliable way to
      // suppress them is to rewrite the base file without them.
      const basePath = path.join(
        deployment.workspacePath,
        ".vercelab.base.compose.yml",
      );
      const cleanedParsed = parsed as {
        services?: Record<string, Record<string, unknown>>;
        [key: string]: unknown;
      };
      if (cleanedParsed?.services) {
        for (const svc of Object.values(cleanedParsed.services)) {
          if (svc && typeof svc === "object") {
            delete svc.ports;
          }
        }
      }
      await fs.writeFile(basePath, stringify(cleanedParsed), "utf8");

      return {
        composeMode: "compose",
        composeFile: candidate,
        serviceName: selectedService,
        fileArgs: ["-f", basePath, "-f", overridePath],
      };
    }
  }

  const dockerfilePath = path.join(deployment.workspacePath, "Dockerfile");

  if (!(await pathExists(dockerfilePath))) {
    throw new Error(
      "Supported runtime files were not found. Add a root Dockerfile or docker-compose.yml.",
    );
  }

  const routerName = `${deployment.projectName}-app`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const generatedComposePath = path.join(
    deployment.workspacePath,
    ".vercelab.generated.compose.yml",
  );
  const proxyEnvironment: Record<string, string> = {
    HOSTNAME: "0.0.0.0",
    ...deploymentEnvironment,
  };

  const generatedCompose = {
    services: {
      app: {
        build: {
          context: ".",
          ...(hasEnvironmentValues
            ? {
                args: deploymentEnvironment,
              }
            : {}),
        },
        environment: proxyEnvironment,
        restart: "unless-stopped",
        networks: [getAppConfig().proxy.network],
        labels: {
          "traefik.enable": "true",
          "traefik.docker.network": getAppConfig().proxy.network,
          [`traefik.http.routers.${routerName}.rule`]: `Host(\`${getDefaultDomain(
            deployment.subdomain,
          )}\`)`,
          [`traefik.http.routers.${routerName}.entrypoints`]:
            getAppConfig().proxy.entrypoint,
          [`traefik.http.routers.${routerName}.tls`]: "true",
          [`traefik.http.services.${routerName}.loadbalancer.server.port`]:
            String(deployment.port),
        },
      },
    },
    networks: {
      [getAppConfig().proxy.network]: {
        external: true,
        name: getAppConfig().proxy.network,
      },
    },
  };

  await fs.writeFile(generatedComposePath, stringify(generatedCompose), "utf8");

  return {
    composeMode: "dockerfile",
    composeFile: path.basename(generatedComposePath),
    serviceName: "app",
    fileArgs: ["-f", generatedComposePath],
  };
}

async function runComposeCommand(
  deployment: StoredDeployment,
  runtimeFiles: RuntimeFiles,
  args: string[],
) {
  return await runCommand(
    "docker",
    [
      "compose",
      "-p",
      deployment.projectName,
      ...runtimeFiles.fileArgs,
      ...args,
    ],
    {
      cwd: deployment.workspacePath,
      env: {
        DOCKER_BUILDKIT: "1",
        COMPOSE_DOCKER_CLI_BUILD: "1",
      },
    },
  );
}

async function readComposeLogs(
  deployment: StoredDeployment,
  runtimeFiles: RuntimeFiles,
  options: ReadComposeLogsOptions = {},
) {
  const serviceName = options.includeAllServices
    ? null
    : runtimeFiles.serviceName ?? deployment.serviceName;

  return await runComposeCommand(deployment, runtimeFiles, [
    "logs",
    ...(options.timestamps ? ["--timestamps"] : []),
    "--tail",
    String(options.tail ?? 200),
    "--no-color",
    ...(serviceName ? [serviceName] : []),
  ]);
}

async function executeLifecycleOperation(
  deploymentId: string,
  operationType: OperationType,
  task: (deployment: StoredDeployment, operationId: string) => Promise<string>,
  statusOnSuccess: StoredDeployment["status"],
) {
  return await withDeploymentLock(async () => {
    const deployment = await getStoredDeploymentById(deploymentId);
    const operationId = await createOperation(
      deploymentId,
      operationType,
      `${operationType} started for ${deployment.appName}`,
    );

    await updateDeploymentRecord(deploymentId, {
      status:
        operationType === "remove"
          ? "removing"
          : operationType === "stop"
            ? "stopped"
            : "deploying",
    });

    try {
      const output = await task(deployment, operationId);
      const summary =
        operationType === "stop"
          ? `Stopped ${deployment.appName}.`
          : operationType === "remove"
            ? `Removed ${deployment.appName}.`
            : `Deployment is live at https://${getDefaultDomain(deployment.subdomain)}.`;

      await completeOperation(operationId, "success", summary, output);

      if (operationType !== "remove") {
        await updateDeploymentRecord(deploymentId, {
          status: statusOnSuccess,
          lastOutput: output,
          deployedAt:
            operationType === "stop"
              ? deployment.deployedAt
              : new Date().toISOString(),
        });
      }

      return {
        appName: deployment.appName,
        domain: getDefaultDomain(deployment.subdomain),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected deployment failure.";

      await completeOperation(operationId, "failed", message, message);
      await updateDeploymentRecord(deploymentId, {
        status: operationType === "stop" ? "failed" : "failed",
        lastOutput: message,
      });
      throw error;
    }
  });
}

export async function createAndDeployFromForm(input: {
  repositoryUrl: string;
  githubToken: FormDataEntryValue | string | null;
  branch: FormDataEntryValue | string | null;
  serviceName: FormDataEntryValue | string | null;
  appName: string;
  subdomain: string;
  port: string;
  envVariables: FormDataEntryValue | string | null;
}) {
  const parsed = createDeploymentSchema.parse({
    repositoryUrl: input.repositoryUrl,
    githubToken: normalizeStringInput(input.githubToken),
    branch: normalizeStringInput(input.branch),
    serviceName: normalizeStringInput(input.serviceName),
    appName: input.appName,
    subdomain: normalizeDomainInput(input.subdomain),
    port: input.port,
    envVariables: normalizeStringInput(input.envVariables),
  });

  const { deploymentId, domain } = await createDeploymentRecord(parsed);
  await fetchDeploymentFromGitById(deploymentId, "deploy");

  return {
    deploymentId,
    domain,
  };
}

export async function redeployDeploymentById(deploymentId: string) {
  return await executeLifecycleOperation(
    deploymentId,
    "redeploy",
    async (deployment) => {
      return await deployWorkspace(deployment, false);
    },
    "running",
  );
}

export async function fetchDeploymentFromGitById(
  deploymentId: string,
  operationType: "deploy" | "redeploy" = "redeploy",
) {
  return await executeLifecycleOperation(
    deploymentId,
    operationType,
    async (deployment) => await deployWorkspace(deployment, true),
    "running",
  );
}

export async function updateDeploymentSettingsById(input: {
  deploymentId: string;
  appName: string;
  subdomain: string;
  port: string;
  envVariables: FormDataEntryValue | string | null;
}) {
  const parsed = updateDeploymentSettingsSchema.parse({
    deploymentId: input.deploymentId,
    appName: input.appName,
    subdomain: normalizeDomainInput(input.subdomain),
    port: input.port,
    envVariables: normalizeStringInput(input.envVariables),
  });

  try {
    await updateDeploymentRecord(parsed.deploymentId, {
      appName: parsed.appName,
      subdomain: parsed.subdomain,
      port: parsed.port,
      envVariables: parsed.envVariables ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error(
        "That subdomain is already reserved by another deployment.",
      );
    }

    throw error;
  }

  const result = await redeployDeploymentById(parsed.deploymentId);

  return {
    appName: parsed.appName,
    domain: result.domain,
  };
}

export async function stopDeploymentById(deploymentId: string) {
  return await executeLifecycleOperation(
    deploymentId,
    "stop",
    async (deployment) => {
      if (!(await pathExists(deployment.workspacePath))) {
        return "Workspace already removed.";
      }

      const runtimeFiles = await detectRuntimeFiles(deployment);
      const output = await runComposeCommand(deployment, runtimeFiles, [
        "down",
        "--remove-orphans",
      ]);

      await updateDeploymentRecord(deployment.id, {
        status: "stopped",
        lastOutput: output,
      });

      return truncateOutput(output) ?? "Stopped without logs.";
    },
    "stopped",
  );
}

export async function removeDeploymentById(deploymentId: string) {
  return await withDeploymentLock(async () => {
    const deployment = await getStoredDeploymentById(deploymentId);
    const operationId = await createOperation(
      deploymentId,
      "remove",
      `remove started for ${deployment.appName}`,
    );

    await updateDeploymentRecord(deploymentId, {
      status: "removing",
    });

    try {
      let output = "";

      if (await pathExists(deployment.workspacePath)) {
        try {
          const runtimeFiles = await detectRuntimeFiles(deployment);
          output = await runComposeCommand(deployment, runtimeFiles, [
            "down",
            "--remove-orphans",
          ]);
        } catch (error) {
          output =
            error instanceof Error
              ? error.message
              : "Failed during compose shutdown.";
        }
      }

      await removeWorkspace(deployment.workspacePath);
      await completeOperation(
        operationId,
        "success",
        `Removed ${deployment.appName}.`,
        truncateOutput(output),
      );
      await deleteDeploymentRecord(deploymentId);

      return {
        appName: deployment.appName,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected removal failure.";
      await completeOperation(operationId, "failed", message, message);
      await updateDeploymentRecord(deploymentId, {
        status: "failed",
        lastOutput: message,
      });
      throw error;
    }
  });
}

export async function readDeploymentBuildLog(deploymentId: string) {
  const deployment = await getStoredDeploymentById(deploymentId);
  const operation = await getLatestDeploymentOperation(deploymentId);

  return {
    type: "build" as const,
    deploymentId,
    appName: deployment.appName,
    summary:
      operation?.summary ??
      deployment.lastOutput ??
      "No build log captured yet.",
    output:
      operation?.output ??
      deployment.lastOutput ??
      "No build log captured yet.",
    status: operation?.status ?? "success",
    updatedAt: operation?.updatedAt ?? deployment.updatedAt,
  };
}

export async function readDeploymentContainerLog(deploymentId: string) {
  const output = await readDeploymentContainerLogTail(deploymentId);
  const deployment = await getStoredDeploymentById(deploymentId);

  return {
    type: "container" as const,
    deploymentId,
    appName: deployment.appName,
    summary: `Container output for ${deployment.appName}`,
    output: truncateOutput(output) ?? "Container log is empty.",
    status: deployment.status,
    updatedAt: deployment.updatedAt,
  };
}

export async function readDeploymentContainerLogTail(
  deploymentId: string,
  options: ReadComposeLogsOptions = {},
) {
  const deployment = await getStoredDeploymentById(deploymentId);

  if (!(await pathExists(deployment.workspacePath))) {
    return "Workspace is missing, so container logs are unavailable.";
  }

  try {
    const runtimeFiles = await detectRuntimeFiles(deployment);
    return await readComposeLogs(deployment, runtimeFiles, options);
  } catch (error) {
    return error instanceof Error ? error.message : "Unable to read container logs.";
  }
}
