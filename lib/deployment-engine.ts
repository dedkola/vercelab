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
  env?: NodeJS.ProcessEnv;
};

type RuntimeFiles = {
  composeMode: "dockerfile" | "compose";
  composeFile: string;
  serviceName: string | null;
  fileArgs: string[];
};

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

function buildGitCloneUrl(repositoryUrl: string, token: string | null) {
  if (!token) {
    return repositoryUrl;
  }

  const parsed = new URL(repositoryUrl);
  parsed.username = "x-access-token";
  parsed.password = token;
  return parsed.toString();
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
    readDeploymentSecretToken(deployment.id),
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

  updateDeploymentRecord(deployment.id, {
    composeMode: runtimeFiles.composeMode,
    composeFile: runtimeFiles.composeFile,
    serviceName: runtimeFiles.serviceName,
  });

  const composeOutput = await runComposeCommand(deployment, runtimeFiles, [
    "up",
    "-d",
    "--build",
  ]);

  return (
    truncateOutput([cloneOutput, composeOutput].filter(Boolean).join("\n\n")) ??
    ""
  );
}

async function detectRuntimeFiles(
  deployment: StoredDeployment,
): Promise<RuntimeFiles> {
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

      const override = {
        services: {
          [selectedService]: {
            networks,
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

      await fs.writeFile(overridePath, stringify(override), "utf8");

      return {
        composeMode: "compose",
        composeFile: candidate,
        serviceName: selectedService,
        fileArgs: ["-f", composePath, "-f", overridePath],
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
  const generatedCompose = {
    services: {
      app: {
        build: {
          context: ".",
        },
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
    },
  );
}

async function executeLifecycleOperation(
  deploymentId: string,
  operationType: OperationType,
  task: (deployment: StoredDeployment, operationId: string) => Promise<string>,
  statusOnSuccess: StoredDeployment["status"],
) {
  return await withDeploymentLock(async () => {
    const deployment = getStoredDeploymentById(deploymentId);
    const operationId = createOperation(
      deploymentId,
      operationType,
      `${operationType} started for ${deployment.appName}`,
    );

    updateDeploymentRecord(deploymentId, {
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

      completeOperation(operationId, "success", summary, output);

      if (operationType !== "remove") {
        updateDeploymentRecord(deploymentId, {
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

      completeOperation(operationId, "failed", message, message);
      updateDeploymentRecord(deploymentId, {
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
}) {
  const parsed = createDeploymentSchema.parse({
    repositoryUrl: input.repositoryUrl,
    githubToken: normalizeStringInput(input.githubToken),
    branch: normalizeStringInput(input.branch),
    serviceName: normalizeStringInput(input.serviceName),
    appName: input.appName,
    subdomain: normalizeDomainInput(input.subdomain),
    port: input.port,
  });

  const { deploymentId, domain } = createDeploymentRecord(parsed);
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
}) {
  const parsed = updateDeploymentSettingsSchema.parse({
    deploymentId: input.deploymentId,
    appName: input.appName,
    subdomain: normalizeDomainInput(input.subdomain),
    port: input.port,
  });

  try {
    updateDeploymentRecord(parsed.deploymentId, {
      appName: parsed.appName,
      subdomain: parsed.subdomain,
      port: parsed.port,
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

      updateDeploymentRecord(deployment.id, {
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
    const deployment = getStoredDeploymentById(deploymentId);
    const operationId = createOperation(
      deploymentId,
      "remove",
      `remove started for ${deployment.appName}`,
    );

    updateDeploymentRecord(deploymentId, {
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
      completeOperation(
        operationId,
        "success",
        `Removed ${deployment.appName}.`,
        truncateOutput(output),
      );
      deleteDeploymentRecord(deploymentId);

      return {
        appName: deployment.appName,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected removal failure.";
      completeOperation(operationId, "failed", message, message);
      updateDeploymentRecord(deploymentId, {
        status: "failed",
        lastOutput: message,
      });
      throw error;
    }
  });
}
