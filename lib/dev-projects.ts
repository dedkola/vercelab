import 'server-only';

import { randomBytes } from 'node:crypto';

import { getAppConfig } from '@/lib/app-config';
import { applyDevRetention, enqueueDevDeployment, retryDevDeploymentById } from '@/lib/dev-engine';
import {
  createDevProjectRecord,
  getDevProjectByRepositoryAndBranch,
  getDevProjectById,
  getDevProjectDetailById,
  listDevDeployments,
  updateDevProjectPollState,
  updateDevProjectRecord,
} from '@/lib/dev-persistence';
import { getNewCommits } from '@/lib/dev-preview';
import type {
  DevDeployment,
  DevProject,
  DevProjectCommits,
  DevProjectDetail,
} from '@/lib/dev-types';
import type { CreateDevProjectInput, UpdateDevProjectInput } from '@/lib/dev-validation';
import { encryptSecret } from '@/lib/crypto';
import {
  getGitHubCommit,
  listGitHubCommits,
  parseGitHubRepositoryReference,
  type GitHubCommit,
} from '@/lib/github';

type DevRepositoryReference = {
  name: string;
  owner: string;
  url: string;
};

function getRepositoryReference(repositoryUrl: string): DevRepositoryReference {
  const repository = parseGitHubRepositoryReference(repositoryUrl);

  if (!repository) {
    throw new Error('Only GitHub repositories are supported for preview deployments.');
  }

  return {
    name: repository.name,
    owner: repository.owner,
    url: repository.webUrl,
  };
}

function getGitHubToken() {
  const token = getAppConfig().security.githubToken;

  if (!token) {
    throw new Error(
      'Configure a GitHub token in Vercelab settings before connecting a repository.'
    );
  }

  return token;
}

function createWebhookSecret() {
  return randomBytes(32).toString('hex');
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

function getUniqueViolationConstraint(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'constraint' in error &&
    typeof (error as { constraint?: unknown }).constraint === 'string'
  ) {
    return (error as { constraint: string }).constraint;
  }

  return null;
}

async function getLatestGitHubCommit(
  repository: DevRepositoryReference,
  branch: string,
  token: string
): Promise<GitHubCommit> {
  const commits = await listGitHubCommits(token, repository.owner, repository.name, branch);

  if (commits.length === 0) {
    throw new Error(`No commits were found on branch "${branch}".`);
  }

  return commits[0]!;
}

export async function createDevProject(input: CreateDevProjectInput) {
  const repository = getRepositoryReference(input.repositoryUrl);
  const token = getGitHubToken();
  const existing = await getDevProjectByRepositoryAndBranch(input.repositoryUrl, input.branch);

  if (existing) {
    throw new Error('That repository and branch are already connected to a Dev project.');
  }

  const headCommit = await getLatestGitHubCommit(repository, input.branch, token);
  const webhookSecret = createWebhookSecret();

  let project: DevProject;

  try {
    project = await createDevProjectRecord({
      appName: input.appName,
      appSlug: input.appSlug,
      autoDeploy: input.autoDeploy,
      branch: input.branch,
      buildArgs: input.buildArgs ?? null,
      buildContext: input.buildContext,
      dockerfilePath: input.dockerfilePath,
      encryptedWebhookSecret: encryptSecret(webhookSecret),
      envVariables: input.envVariables ?? null,
      lastSeenSha: headCommit.sha,
      port: input.port,
      repositoryName: repository.name,
      repositoryOwner: repository.owner,
      repositoryUrl: input.repositoryUrl,
      retentionLimit: input.retentionLimit,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const constraint = getUniqueViolationConstraint(error);

      if (constraint?.includes('repository_url')) {
        throw new Error('That repository and branch are already connected to a Dev project.');
      }

      throw new Error('That preview prefix is already used by another Dev project.');
    }

    throw error;
  }

  let initialDeployment: DevDeployment | null = null;
  let initialDeploymentError: string | null = null;

  if (input.deployLatest) {
    try {
      const result = await enqueueDevDeployment(project, headCommit);
      initialDeployment = result.deployment;
    } catch (error) {
      initialDeploymentError = getErrorMessage(error, 'Unable to queue the current commit.');
    }
  }

  return {
    initialDeployment,
    initialDeploymentError,
    project,
    webhookSecret,
  };
}

export async function updateDevProject(projectId: string, input: UpdateDevProjectInput) {
  const current = await getDevProjectById(projectId);
  const branchChanged = Boolean(input.branch && input.branch !== current.branch);

  try {
    await updateDevProjectRecord(projectId, {
      ...(input.appName !== undefined ? { appName: input.appName } : {}),
      ...(input.appSlug !== undefined ? { appSlug: input.appSlug } : {}),
      ...(input.autoDeploy !== undefined ? { autoDeploy: input.autoDeploy } : {}),
      ...(input.branch !== undefined ? { branch: input.branch } : {}),
      ...(input.buildArgs !== undefined ? { buildArgs: input.buildArgs } : {}),
      ...(input.buildContext !== undefined ? { buildContext: input.buildContext } : {}),
      ...(input.dockerfilePath !== undefined ? { dockerfilePath: input.dockerfilePath } : {}),
      ...(input.envVariables !== undefined ? { envVariables: input.envVariables } : {}),
      ...(input.port !== undefined ? { port: input.port } : {}),
      ...(input.retentionLimit !== undefined ? { retentionLimit: input.retentionLimit } : {}),
      ...(branchChanged ? { lastSeenSha: null, lastPollError: null } : {}),
      ...(input.rotateWebhookSecret
        ? { encryptedWebhookSecret: encryptSecret(createWebhookSecret()) }
        : {}),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const constraint = getUniqueViolationConstraint(error);

      if (constraint?.includes('repository_url')) {
        throw new Error('That repository and branch are already connected to another Dev project.');
      }

      throw new Error('That preview prefix is already used by another Dev project.');
    }

    throw error;
  }

  if (input.retentionLimit !== undefined) {
    await applyDevRetention(await getDevProjectById(projectId)).catch(() => undefined);
  }

  return await getDevProjectDetailById(projectId);
}

export async function getDevProjectDetail(projectId: string): Promise<DevProjectDetail> {
  return await getDevProjectDetailById(projectId);
}

export async function listDevProjectCommits(projectId: string): Promise<DevProjectCommits> {
  const project = await getDevProjectById(projectId);
  const repository = getRepositoryReference(project.repositoryUrl);
  const token = getGitHubToken();
  const commits = await listGitHubCommits(token, repository.owner, repository.name, project.branch);
  const deployments = await listDevDeployments(projectId);
  const deployedShas = new Set(deployments.map((deployment) => deployment.commitSha));

  return {
    branches: [project.branch],
    commits: commits.map((commit) => ({
      authorName: commit.authorName,
      committedAt: commit.committedAt,
      deployed: deployedShas.has(commit.sha),
      message: commit.message,
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      url: commit.url,
    })),
    deployedShas: Array.from(deployedShas),
  };
}

export async function deployDevProjectCommit(projectId: string, commitSha?: string) {
  const project = await getDevProjectById(projectId);
  const repository = getRepositoryReference(project.repositoryUrl);
  const token = getGitHubToken();
  const commit = commitSha
    ? await getGitHubCommit(token, repository.owner, repository.name, commitSha)
    : await getLatestGitHubCommit(repository, project.branch, token);
  const result = await enqueueDevDeployment(project, commit);
  let deployment = result.deployment;
  let created = result.created;

  if (!created && deployment.status === 'failed') {
    deployment = await retryDevDeploymentById(deployment.id);
    created = true;
  }

  if (!commitSha) {
    await updateDevProjectRecord(projectId, {
      lastSeenSha: commit.sha,
    });
  }

  return {
    commit,
    created,
    deployment,
  };
}

export async function syncDevProject(project: DevProject) {
  const repository = getRepositoryReference(project.repositoryUrl);
  const token = getGitHubToken();
  const commits = await listGitHubCommits(token, repository.owner, repository.name, project.branch);
  const polledAt = new Date().toISOString();

  if (commits.length === 0) {
    await updateDevProjectPollState(project.id, {
      lastPollError: null,
      lastPolledAt: polledAt,
    });

    return {
      enqueued: 0,
      headSha: null,
      newCommits: [],
    };
  }

  if (!project.lastSeenSha) {
    await updateDevProjectPollState(project.id, {
      lastPollError: null,
      lastPolledAt: polledAt,
      lastSeenSha: commits[0]!.sha,
    });

    return {
      enqueued: 0,
      headSha: commits[0]!.sha,
      newCommits: [],
    };
  }

  const { commits: newCommits, nextLastSeenSha } = getNewCommits(
    commits,
    project.lastSeenSha,
    getAppConfig().dev.maxCatchUpCommits
  );
  const enqueued: DevDeployment[] = [];

  for (const commit of newCommits) {
    const result = await enqueueDevDeployment(project, commit);

    if (result.created) {
      enqueued.push(result.deployment);
    }
  }

  await updateDevProjectPollState(project.id, {
    lastPollError: null,
    lastPolledAt: polledAt,
    lastSeenSha: nextLastSeenSha,
  });

  return {
    enqueued: enqueued.length,
    headSha: nextLastSeenSha,
    newCommits: enqueued.map((deployment) => ({
      commitSha: deployment.commitSha,
      deploymentId: deployment.id,
      shortSha: deployment.shortSha,
    })),
  };
}
