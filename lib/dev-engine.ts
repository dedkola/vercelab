import 'server-only';

import { spawn } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import type { WriteStream } from 'node:fs';
import path from 'node:path';

import { getAppConfig } from '@/lib/app-config';
import {
  buildDefaultHostedDomain,
  buildTraefikLabels,
  buildTraefikRouterName,
  getProxyProtocol,
} from '@/lib/container-routing';
import {
  createDevDeploymentRecord,
  deleteDevDeploymentRecord,
  deleteDevProjectRecord,
  getDevDeploymentById,
  getDevDeploymentByCommit,
  getDevProjectById,
  isDevSubdomainReserved,
  listDevDeployments,
  resetDevDeploymentForRetry,
  updateDevDeploymentRecord,
} from '@/lib/dev-persistence';
import {
  buildDevContainerName,
  buildDevImageTag,
  buildPreviewShortSha,
  buildPreviewSubdomain,
  getCommitMessageTitle,
  getDevDeploymentPreviewUrl,
  isFullGitSha,
  parseDevContainerStatus,
  parseDevKeyValueLines,
  selectRetentionCandidates,
  toDevKeyValueMap,
} from '@/lib/dev-preview';
import type {
  DevContainerState,
  DevDeployment,
  DevDeploymentLogPayload,
  DevProject,
} from '@/lib/dev-types';
import type { GitHubCommit } from '@/lib/github';

const MAX_LOG_BYTES = 8 * 1024 * 1024;
const CLONE_TIMEOUT_MS = 5 * 60 * 1000;
const GIT_TIMEOUT_MS = 5 * 60 * 1000;

type StreamingCommandOptions = {
  cwd?: string;
  env?: Partial<NodeJS.ProcessEnv>;
  onChunk?: (chunk: string) => void;
  timeoutMs?: number;
};

class BuildLogWriter {
  private bytesWritten = 0;
  private stream: WriteStream | null = null;
  private truncated = false;

  constructor(private readonly filePath: string) {}

  async open() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, '', 'utf8');
    this.stream = createWriteStream(this.filePath, { flags: 'a' });
    this.stream.on('error', () => undefined);
  }

  write(chunk: string) {
    if (!chunk || !this.stream) {
      return;
    }

    if (this.bytesWritten >= MAX_LOG_BYTES) {
      if (!this.truncated) {
        this.truncated = true;
        this.stream.write('\n[vercelab] Build log truncated at 8 MB.\n');
      }

      return;
    }

    this.bytesWritten += Buffer.byteLength(chunk);
    this.stream.write(chunk);
  }

  writeLine(message: string) {
    this.write(`[vercelab] ${message}\n`);
  }

  async close() {
    const stream = this.stream;
    this.stream = null;

    if (!stream) {
      return;
    }

    await new Promise<void>((resolve) => {
      stream.end(resolve);
    });
  }
}

function resolveRuntimeRoot(runtimePath: string) {
  return path.resolve(/*turbopackIgnore: true*/ runtimePath);
}

function assertWithinRoot(rootPath: string, candidatePath: string, label: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  const isWithin =
    relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));

  if (!isWithin) {
    throw new Error(`Refusing to access ${label} outside its Vercelab directory.`);
  }
}

function getDevWorkspacePath(deploymentId: string) {
  const root = resolveRuntimeRoot(getAppConfig().paths.appsDir);
  const workspacePath = path.join(/*turbopackIgnore: true*/ root, 'dev', deploymentId);

  assertWithinRoot(root, workspacePath, 'preview workspace');
  return workspacePath;
}

function getDevLogPath(projectId: string, commitSha: string) {
  const root = resolveRuntimeRoot(getAppConfig().paths.logsDir);
  const logPath = path.join(
    /*turbopackIgnore: true*/ root,
    'dev',
    projectId,
    `${commitSha.toLowerCase()}.log`
  );

  assertWithinRoot(root, logPath, 'preview build log');
  return logPath;
}

function resolveWorkspaceRelativePath(workspacePath: string, relativePath: string, label: string) {
  const resolvedPath = path.resolve(workspacePath, relativePath);
  const relative = path.relative(workspacePath, resolvedPath);
  const isWithin = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));

  if (!isWithin) {
    throw new Error(`${label} must stay inside the repository.`);
  }

  return resolvedPath;
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(/*turbopackIgnore: true*/ targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runBufferedCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Partial<NodeJS.ProcessEnv> } = {}
) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');

      if (code === 0) {
        resolve(output);
        return;
      }

      reject(
        new Error(
          [output, `${command} ${args[0] ?? ''} exited with status ${code}.`]
            .filter(Boolean)
            .join('\n')
        )
      );
    });
  });
}

async function runStreamingCommand(
  command: string,
  args: string[],
  options: StreamingCommandOptions = {}
) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let settled = false;
    let timedOut = false;

    const append = (chunk: Buffer | string) => {
      const text = chunk.toString();
      output = `${output}${text}`.slice(-12000);
      options.onChunk?.(text);
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');

      setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000).unref?.();
    }, options.timeoutMs ?? getAppConfig().dev.buildTimeoutMs);

    timeoutId.unref?.();

    child.stdout.on('data', append);
    child.stderr.on('data', append);

    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      if (code === 0) {
        resolve(output);
        return;
      }

      reject(
        new Error(
          [
            output,
            timedOut
              ? `${command} timed out after ${Math.round((options.timeoutMs ?? getAppConfig().dev.buildTimeoutMs) / 1000)} seconds.`
              : `${command} exited with status ${code}.`,
          ]
            .filter(Boolean)
            .join('\n')
        )
      );
    });
  });
}

function buildGitAuthEnv(token: string | null) {
  const env: Partial<NodeJS.ProcessEnv> = {
    GIT_TERMINAL_PROMPT: '0',
  };

  if (!token) {
    return env;
  }

  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');

  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
  env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${auth}`;

  return env;
}

async function ensureProxyNetwork() {
  const network = getAppConfig().proxy.network;

  try {
    await runBufferedCommand('docker', ['network', 'inspect', network]);
  } catch {
    await runBufferedCommand('docker', ['network', 'create', network]);
  }
}

async function removeContainer(containerRef: string) {
  try {
    await runBufferedCommand('docker', ['rm', '-f', '-v', containerRef]);
  } catch {
    // The container may already be gone; the following run will surface a real error.
  }
}

function getDeploymentContainerRefs(
  deployment: Pick<DevDeployment, 'containerId' | 'containerName'>
) {
  return Array.from(
    new Set(
      [deployment.containerId, deployment.containerName].filter((value): value is string =>
        Boolean(value)
      )
    )
  );
}

async function runContainerLifecycleCommand(
  command: 'start' | 'stop' | 'restart',
  deployment: DevDeployment
) {
  let lastError: unknown = null;

  for (const containerRef of getDeploymentContainerRefs(deployment)) {
    try {
      return await runBufferedCommand('docker', [command, containerRef]);
    } catch (error) {
      lastError = error;

      if (!isMissingContainerError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error('Preview container is not available.');
}

async function removeImage(imageTag: string) {
  try {
    await runBufferedCommand('docker', ['image', 'rm', imageTag]);
  } catch {
    // Best effort. Build cache and image cleanup are not critical to deployment state.
  }
}

async function removeWorkspace(workspacePath: string) {
  const appsRoot = resolveRuntimeRoot(getAppConfig().paths.appsDir);
  const resolvedWorkspace = path.resolve(/*turbopackIgnore: true*/ workspacePath);

  assertWithinRoot(appsRoot, resolvedWorkspace, 'preview workspace');
  await fs.rm(resolvedWorkspace, { recursive: true, force: true });
}

async function removeBuildLog(logPath: string) {
  const logsRoot = resolveRuntimeRoot(getAppConfig().paths.logsDir);
  const resolvedLog = path.resolve(/*turbopackIgnore: true*/ logPath);

  assertWithinRoot(logsRoot, resolvedLog, 'preview build log');
  await fs.rm(resolvedLog, { force: true });
}

async function cloneRepositoryAtCommit(
  project: DevProject,
  deployment: DevDeployment,
  workspacePath: string,
  logger: BuildLogWriter,
  token: string | null,
  onChunk: (chunk: string) => void
) {
  logger.writeLine(`Cloning ${project.repositoryUrl} (${deployment.branch})`);
  await runStreamingCommand(
    'git',
    [
      'clone',
      '--depth',
      '1',
      '--single-branch',
      '--branch',
      deployment.branch,
      '--no-checkout',
      project.repositoryUrl,
      workspacePath,
    ],
    {
      env: buildGitAuthEnv(token),
      onChunk,
      timeoutMs: CLONE_TIMEOUT_MS,
    }
  );

  logger.writeLine(`Checking out commit ${deployment.commitSha}`);
  await runStreamingCommand('git', ['fetch', '--depth', '1', 'origin', deployment.commitSha], {
    cwd: workspacePath,
    env: buildGitAuthEnv(token),
    onChunk,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  await runStreamingCommand('git', ['checkout', '--detach', deployment.commitSha], {
    cwd: workspacePath,
    onChunk,
    timeoutMs: GIT_TIMEOUT_MS,
  });
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export async function enqueueDevDeployment(
  project: DevProject,
  commit: GitHubCommit
): Promise<{ created: boolean; deployment: DevDeployment }> {
  const commitSha = commit.sha.trim().toLowerCase();

  if (!isFullGitSha(commitSha)) {
    throw new Error('Commit SHA must be a full 40-character SHA.');
  }

  const existing = await getDevDeploymentByCommit(project.id, commitSha);

  if (existing) {
    return {
      created: false,
      deployment: existing,
    };
  }

  const logPath = getDevLogPath(project.id, commitSha);

  for (let shortLength = 7; shortLength <= 12; shortLength += 1) {
    const subdomain = buildPreviewSubdomain(project.appSlug, commitSha, shortLength);

    if (await isDevSubdomainReserved(subdomain)) {
      continue;
    }

    const shortSha = buildPreviewShortSha(commitSha, shortLength);
    const containerName = buildDevContainerName(project.appSlug, shortSha);
    const imageTag = buildDevImageTag(project.appSlug, commitSha);

    try {
      return await createDevDeploymentRecord({
        branch: project.branch,
        buildArgs: project.buildArgs,
        buildContext: project.buildContext,
        buildLogPath: logPath,
        commitAuthor: commit.authorName,
        commitMessage: getCommitMessageTitle(commit.message),
        commitSha,
        commitUrl: commit.url,
        committedAt: commit.committedAt,
        containerName,
        dockerfilePath: project.dockerfilePath,
        envVariables: project.envVariables,
        imageTag,
        port: project.port,
        projectId: project.id,
        shortSha,
        subdomain,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const racedDeployment = await getDevDeploymentByCommit(project.id, commitSha);

        if (racedDeployment) {
          return {
            created: false,
            deployment: racedDeployment,
          };
        }

        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Unable to allocate a unique preview URL for ${project.appSlug}. Choose a different preview prefix.`
  );
}

export async function buildAndDeployDevDeployment(project: DevProject, deployment: DevDeployment) {
  const logPath = deployment.buildLogPath || getDevLogPath(project.id, deployment.commitSha);
  const workspacePath = getDevWorkspacePath(deployment.id);
  const logger = new BuildLogWriter(logPath);
  let output = '';
  let succeeded = false;

  const onChunk = (chunk: string) => {
    output = `${output}${chunk}`.slice(-12000);
    logger.write(chunk);
  };

  await logger.open();
  await updateDevDeploymentRecord(deployment.id, {
    buildStartedAt: new Date().toISOString(),
    lastOutput: null,
    status: 'building',
  });

  logger.writeLine(`Preview build for ${project.appName} (${deployment.commitSha})`);
  logger.writeLine(`Repository: ${project.repositoryUrl}`);
  logger.writeLine(`Branch: ${deployment.branch}`);
  logger.writeLine(
    `Dockerfile: ${deployment.dockerfilePath} | Context: ${deployment.buildContext} | Port: ${deployment.port}`
  );

  try {
    await ensureProxyNetwork();
    await removeWorkspace(workspacePath);
    await fs.mkdir(workspacePath, { recursive: true });

    await cloneRepositoryAtCommit(
      project,
      deployment,
      workspacePath,
      logger,
      getAppConfig().security.githubToken,
      onChunk
    );

    const dockerfilePath = resolveWorkspaceRelativePath(
      workspacePath,
      deployment.dockerfilePath,
      'Dockerfile path'
    );
    const buildContextPath = resolveWorkspaceRelativePath(
      workspacePath,
      deployment.buildContext,
      'Build context'
    );

    if (!(await pathExists(dockerfilePath))) {
      throw new Error(`Dockerfile not found at "${deployment.dockerfilePath}".`);
    }

    if (!(await pathExists(buildContextPath))) {
      throw new Error(`Build context not found at "${deployment.buildContext}".`);
    }

    const envEntries = parseDevKeyValueLines(deployment.envVariables);
    const buildArgEntries = parseDevKeyValueLines(deployment.buildArgs);
    const runtimeEnv = {
      HOSTNAME: '0.0.0.0',
      ...toDevKeyValueMap(envEntries),
    };

    logger.writeLine(`Building image ${deployment.imageTag}`);
    const buildArgs = [
      'build',
      '--progress=plain',
      '-f',
      dockerfilePath,
      '-t',
      deployment.imageTag,
      ...buildArgEntries.flatMap(({ key, value }) => ['--build-arg', `${key}=${value}`]),
      '--label',
      `vercelab.dev.project-id=${project.id}`,
      '--label',
      `vercelab.dev.deployment-id=${deployment.id}`,
      '--label',
      `vercelab.dev.commit-sha=${deployment.commitSha}`,
      '--label',
      `org.opencontainers.image.revision=${deployment.commitSha}`,
      '--label',
      `org.opencontainers.image.source=${project.repositoryUrl}`,
      buildContextPath,
    ];

    await runStreamingCommand('docker', buildArgs, {
      env: {
        DOCKER_BUILDKIT: '1',
      },
      onChunk,
      timeoutMs: getAppConfig().dev.buildTimeoutMs,
    });

    const config = getAppConfig();
    const protocol = getProxyProtocol(config.proxy.entrypoint);
    const host = buildDefaultHostedDomain(deployment.subdomain, config.baseDomain);
    const routerName = buildTraefikRouterName(deployment.containerName);
    const labels = {
      ...buildTraefikLabels({
        entrypoint: config.proxy.entrypoint,
        host,
        network: config.proxy.network,
        port: deployment.port,
        routerName,
        tls: protocol === 'https',
      }),
      'vercelab.dev.preview': 'true',
      'vercelab.dev.project-id': project.id,
      'vercelab.dev.deployment-id': deployment.id,
      'vercelab.dev.commit-sha': deployment.commitSha,
    };

    logger.writeLine(`Replacing stale preview container ${deployment.containerName}`);
    await removeContainer(deployment.containerName);

    logger.writeLine(`Starting container ${deployment.containerName}`);
    const runOutput = await runStreamingCommand(
      'docker',
      [
        'run',
        '-d',
        '--name',
        deployment.containerName,
        '--restart',
        'unless-stopped',
        '--network',
        config.proxy.network,
        ...Object.entries(labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]),
        ...Object.entries(runtimeEnv).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
        deployment.imageTag,
      ],
      {
        onChunk,
        timeoutMs: 120000,
      }
    );

    const containerId =
      runOutput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1) ?? '';

    if (!containerId) {
      throw new Error('Docker did not return a preview container id.');
    }

    const deployedAt = new Date().toISOString();
    await updateDevDeploymentRecord(deployment.id, {
      buildFinishedAt: deployedAt,
      containerId,
      deployedAt,
      lastOutput: output || 'Preview deployment completed.',
      status: 'running',
    });

    logger.writeLine(
      `Preview is live at ${getDevDeploymentPreviewUrl(deployment, config.baseDomain, protocol)}`
    );
    succeeded = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview build failed.';
    const failedAt = new Date().toISOString();

    logger.writeLine(`FAILED: ${message}`);
    await removeContainer(deployment.containerName);
    await updateDevDeploymentRecord(deployment.id, {
      buildFinishedAt: failedAt,
      lastOutput: message,
      status: 'failed',
    });
    await removeImage(deployment.imageTag);

    throw error;
  } finally {
    await logger.close();
    await removeWorkspace(workspacePath).catch(() => undefined);
  }

  if (succeeded) {
    await applyDevRetention(project).catch((error) => {
      const message = error instanceof Error ? error.message : 'Retention cleanup failed.';
      console.error(`[dev] ${message}`);
    });
  }
}

export async function applyDevRetention(project: DevProject) {
  if (project.retentionLimit <= 0) {
    return 0;
  }

  const deployments = await listDevDeployments(project.id);
  const candidates = selectRetentionCandidates(deployments, project.retentionLimit);

  for (const deployment of candidates) {
    try {
      await cleanupDevDeploymentResources(deployment);
      await deleteDevDeploymentRecord(deployment.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove old preview.';
      console.error(`[dev] ${message}`);
    }
  }

  return candidates.length;
}

async function cleanupDevDeploymentResources(deployment: DevDeployment) {
  for (const containerRef of getDeploymentContainerRefs(deployment)) {
    await removeContainer(containerRef);
  }

  await removeImage(deployment.imageTag);
  await removeBuildLog(deployment.buildLogPath);
  await removeWorkspace(getDevWorkspacePath(deployment.id)).catch(() => undefined);
}

function assertDeploymentSettled(deployment: DevDeployment) {
  if (deployment.status === 'queued' || deployment.status === 'building') {
    throw new Error('Wait for the current preview build to finish before changing it.');
  }
}

function isMissingContainerError(error: unknown) {
  const message = error instanceof Error ? error.message : '';

  return /no such container|not found/i.test(message);
}

export async function stopDevDeploymentById(deploymentId: string) {
  const deployment = await getDevDeploymentById(deploymentId);
  assertDeploymentSettled(deployment);

  try {
    await runContainerLifecycleCommand('stop', deployment);
  } catch (error) {
    if (!isMissingContainerError(error)) {
      throw error;
    }
  }

  await updateDevDeploymentRecord(deployment.id, {
    lastOutput: `Stopped preview at ${new Date().toISOString()}.`,
    status: 'stopped',
  });

  return await getDevDeploymentById(deployment.id);
}

export async function startDevDeploymentById(deploymentId: string) {
  const deployment = await getDevDeploymentById(deploymentId);
  assertDeploymentSettled(deployment);

  try {
    await runContainerLifecycleCommand('start', deployment);
  } catch (error) {
    if (isMissingContainerError(error)) {
      throw new Error('Preview container no longer exists. Retry the build instead.');
    }

    throw error;
  }

  await updateDevDeploymentRecord(deployment.id, {
    lastOutput: `Started preview at ${new Date().toISOString()}.`,
    status: 'running',
  });

  return await getDevDeploymentById(deployment.id);
}

export async function restartDevDeploymentById(deploymentId: string) {
  const deployment = await getDevDeploymentById(deploymentId);
  assertDeploymentSettled(deployment);

  try {
    await runContainerLifecycleCommand('restart', deployment);
  } catch (error) {
    if (isMissingContainerError(error)) {
      throw new Error('Preview container no longer exists. Retry the build instead.');
    }

    throw error;
  }

  await updateDevDeploymentRecord(deployment.id, {
    lastOutput: `Restarted preview at ${new Date().toISOString()}.`,
    status: 'running',
  });

  return await getDevDeploymentById(deployment.id);
}

export async function retryDevDeploymentById(deploymentId: string) {
  const deployment = await getDevDeploymentById(deploymentId);
  assertDeploymentSettled(deployment);

  await removeContainer(deployment.containerId || deployment.containerName);
  await removeBuildLog(deployment.buildLogPath).catch(() => undefined);
  await resetDevDeploymentForRetry(deployment.id);

  return await getDevDeploymentById(deployment.id);
}

export async function deleteDevDeploymentById(deploymentId: string) {
  const deployment = await getDevDeploymentById(deploymentId);
  assertDeploymentSettled(deployment);

  await cleanupDevDeploymentResources(deployment);
  await deleteDevDeploymentRecord(deployment.id);

  return {
    deploymentId,
    removed: true,
  };
}

export async function deleteDevProjectById(projectId: string) {
  await getDevProjectById(projectId);
  const deployments = await listDevDeployments(projectId);

  if (
    deployments.some(
      (deployment) => deployment.status === 'queued' || deployment.status === 'building'
    )
  ) {
    throw new Error('Wait for active preview builds to finish before deleting this project.');
  }

  const warnings: string[] = [];

  for (const deployment of deployments) {
    try {
      await cleanupDevDeploymentResources(deployment);
      await deleteDevDeploymentRecord(deployment.id);
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : `Unable to clean up ${deployment.commitSha}.`
      );
    }
  }

  await deleteDevProjectRecord(projectId);

  return {
    projectId,
    removed: true,
    warnings,
  };
}

export async function readDevDeploymentBuildLog(
  deploymentId: string,
  tailBytes = 65536
): Promise<DevDeploymentLogPayload> {
  const deployment = await getDevDeploymentById(deploymentId);
  let output = '';

  try {
    const source = await fs.readFile(/*turbopackIgnore: true*/ deployment.buildLogPath, 'utf8');
    output = source.slice(-Math.max(1024, tailBytes));
  } catch {
    output = deployment.lastOutput ?? 'No build log captured yet.';
  }

  return {
    type: 'build',
    deploymentId,
    commitSha: deployment.commitSha,
    appName: deployment.shortSha,
    summary: `Build log for ${deployment.shortSha}`,
    output: output || 'Waiting for the build worker…',
    status: deployment.status,
    updatedAt: deployment.updatedAt,
  };
}

export async function readDevDeploymentContainerLog(
  deploymentId: string,
  tail = 200
): Promise<DevDeploymentLogPayload> {
  const deployment = await getDevDeploymentById(deploymentId);
  let output = '';

  try {
    let lastError: unknown = null;

    for (const containerRef of getDeploymentContainerRefs(deployment)) {
      try {
        output = await runBufferedCommand('docker', [
          'logs',
          `--tail=${Math.max(1, Math.min(tail, 500))}`,
          '--timestamps',
          containerRef,
        ]);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;

        if (!isMissingContainerError(error)) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
  } catch (error) {
    output = error instanceof Error ? error.message : 'Unable to read container logs.';
  }

  return {
    type: 'container',
    deploymentId,
    commitSha: deployment.commitSha,
    appName: deployment.shortSha,
    summary: `Container log for ${deployment.shortSha}`,
    output: output || 'Container log is empty.',
    status: deployment.status,
    updatedAt: deployment.updatedAt,
  };
}

export async function readDevContainerStates(): Promise<Record<string, DevContainerState>> {
  const output = await runBufferedCommand('docker', [
    'ps',
    '-a',
    '--filter',
    'label=vercelab.dev.preview=true',
    '--format',
    '{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Label "vercelab.dev.deployment-id"}}',
  ]);

  const states: Record<string, DevContainerState> = {};
  const updatedAt = new Date().toISOString();

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const [containerId = '', containerName = '', statusText = '', deploymentId = ''] =
      line.split('\t');

    if (!deploymentId) {
      continue;
    }

    states[deploymentId] = {
      containerId: containerId || null,
      containerName: containerName || null,
      status: parseDevContainerStatus(statusText),
      statusText: statusText || null,
      updatedAt,
    };
  }

  return states;
}

export async function reconcileDevDeploymentContainerStates() {
  let states: Record<string, DevContainerState>;

  try {
    states = await readDevContainerStates();
  } catch {
    return;
  }

  const deployments = await listDevDeployments();

  for (const deployment of deployments) {
    if (deployment.status !== 'running' && deployment.status !== 'stopped') {
      continue;
    }

    const state = states[deployment.id] ?? null;

    if (deployment.status === 'running' && !state) {
      await updateDevDeploymentRecord(deployment.id, {
        status: 'stopped',
      });
      continue;
    }

    if (
      deployment.status === 'running' &&
      state?.status !== 'running' &&
      state?.status !== 'restarting'
    ) {
      await updateDevDeploymentRecord(deployment.id, {
        status: 'stopped',
      });
      continue;
    }

    if (deployment.status === 'stopped' && state?.status === 'running') {
      await updateDevDeploymentRecord(deployment.id, {
        status: 'running',
      });
    }
  }
}
