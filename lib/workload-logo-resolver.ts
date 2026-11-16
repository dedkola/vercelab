import fs from 'node:fs/promises';

import { getAppConfig } from '@/lib/app-config';
import { inspectContainer, type ContainerInspectData } from '@/lib/container-inspect';
import { decryptSecret } from '@/lib/crypto';
import { findDeploymentIcon } from '@/lib/deployment-icon';
import { getDevDeploymentById, getDevProjectById } from '@/lib/dev-persistence';
import { renderOfficialWorkloadLogoSvg } from '@/lib/official-workload-logos';
import { getStoredDeploymentById, listDeploymentSummaries } from '@/lib/persistence';
import { fetchRepositoryIcon } from '@/lib/repository-icon';
import { matchOfficialWorkloadLogo } from '@/lib/workload-logo';

const CONTAINER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const POSITIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

const workloadLogoCache = new Map<string, { expiresAt: number; value: WorkloadLogo | null }>();

type WorkloadLogoSource =
  'deployment' | 'dev-deployment' | 'local-workspace' | 'official' | 'repository';

export type WorkloadLogo = {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  source: WorkloadLogoSource;
};

function getConfiguredGitHubToken() {
  try {
    return getAppConfig().security.githubToken;
  } catch {
    return null;
  }
}

async function readWorkspaceIcon(
  workspacePath: string,
  source: WorkloadLogoSource
): Promise<WorkloadLogo | null> {
  const icon = await findDeploymentIcon(workspacePath);

  if (!icon) {
    return null;
  }

  try {
    const contents = await fs.readFile(/*turbopackIgnore: true*/ icon.path);

    return {
      body: new Uint8Array(contents),
      contentType: icon.contentType,
      source,
    };
  } catch {
    return null;
  }
}

async function readRepositoryIcon(
  repositoryUrl: string,
  directory: string | null,
  source: WorkloadLogoSource,
  token?: string | null
): Promise<WorkloadLogo | null> {
  const icon = await fetchRepositoryIcon(repositoryUrl, {
    directory,
    token: token ?? getConfiguredGitHubToken(),
  });

  if (!icon) {
    return null;
  }

  return { body: icon.body, contentType: icon.contentType, source };
}

async function resolveDevDeploymentIcon(deploymentId: string): Promise<WorkloadLogo | null> {
  const deployment = await getDevDeploymentById(deploymentId);
  const project = await getDevProjectById(deployment.projectId);

  return await readRepositoryIcon(project.repositoryUrl, project.buildContext, 'dev-deployment');
}

async function resolveDevProjectIcon(projectId: string): Promise<WorkloadLogo | null> {
  const project = await getDevProjectById(projectId);

  return await readRepositoryIcon(project.repositoryUrl, project.buildContext, 'dev-deployment');
}

async function resolveStoredDeploymentIcon(projectName: string): Promise<WorkloadLogo | null> {
  const summaries = await listDeploymentSummaries();
  const summary = summaries.find((candidate) => candidate.projectName === projectName);

  if (!summary) {
    return null;
  }

  const deployment = await getStoredDeploymentById(summary.id);
  const workspaceIcon = await readWorkspaceIcon(deployment.workspacePath, 'deployment');

  if (workspaceIcon) {
    return workspaceIcon;
  }

  let token: string | null = null;

  try {
    token = decryptSecret(deployment.encryptedToken);
  } catch {
    token = null;
  }

  return await readRepositoryIcon(deployment.repositoryUrl, null, 'deployment', token);
}

async function resolveManagedIcon(container: ContainerInspectData): Promise<WorkloadLogo | null> {
  const { labels } = container;
  const devDeploymentId = labels['vercelab.dev.deployment-id'];

  if (devDeploymentId) {
    try {
      const icon = await resolveDevDeploymentIcon(devDeploymentId);

      if (icon) {
        return icon;
      }
    } catch {
      // Fall through to the remaining resolution steps.
    }
  }

  const devProjectId = labels['vercelab.dev.project-id'];

  if (devProjectId) {
    try {
      const icon = await resolveDevProjectIcon(devProjectId);

      if (icon) {
        return icon;
      }
    } catch {
      // Fall through to the remaining resolution steps.
    }
  }

  const composeProject = labels['com.docker.compose.project'];

  if (composeProject) {
    try {
      const icon = await resolveStoredDeploymentIcon(composeProject);

      if (icon) {
        return icon;
      }
    } catch {
      // Fall through to the remaining resolution steps.
    }
  }

  return null;
}

function resolveOfficialIcon(container: ContainerInspectData): WorkloadLogo | null {
  const slug = matchOfficialWorkloadLogo([
    container.image,
    container.labels['org.opencontainers.image.title'],
    container.name,
  ]);

  if (!slug) {
    return null;
  }

  return {
    body: new TextEncoder().encode(renderOfficialWorkloadLogoSvg(slug)),
    contentType: 'image/svg+xml',
    source: 'official',
  };
}

async function resolveIcon(container: ContainerInspectData): Promise<WorkloadLogo | null> {
  const managedIcon = await resolveManagedIcon(container);

  if (managedIcon) {
    return managedIcon;
  }

  const officialIcon = resolveOfficialIcon(container);

  if (officialIcon) {
    return officialIcon;
  }

  // Every container of the local compose stack shares the same working directory, so this is
  // only checked after the image itself has been identified.
  const workingDirectory = container.labels['com.docker.compose.project.working_dir'];

  if (workingDirectory) {
    const workspaceIcon = await readWorkspaceIcon(workingDirectory, 'local-workspace');

    if (workspaceIcon) {
      return workspaceIcon;
    }
  }

  const sourceUrl = container.labels['org.opencontainers.image.source'];

  if (sourceUrl) {
    return await readRepositoryIcon(sourceUrl, null, 'repository');
  }

  return null;
}

function readCache(containerId: string) {
  const entry = workloadLogoCache.get(containerId);

  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    workloadLogoCache.delete(containerId);
    return undefined;
  }

  return entry.value;
}

function writeCache(containerId: string, value: WorkloadLogo | null) {
  if (workloadLogoCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = workloadLogoCache.keys().next().value;

    if (oldestKey !== undefined) {
      workloadLogoCache.delete(oldestKey);
    }
  }

  workloadLogoCache.set(containerId, {
    expiresAt: Date.now() + (value ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    value,
  });
}

export async function resolveWorkloadLogo(containerId: string): Promise<WorkloadLogo | null> {
  if (!CONTAINER_ID_PATTERN.test(containerId)) {
    return null;
  }

  const cached = readCache(containerId);

  if (cached !== undefined) {
    return cached;
  }

  try {
    const container = await inspectContainer(containerId);
    const icon = await resolveIcon(container);

    writeCache(containerId, icon);

    return icon;
  } catch {
    writeCache(containerId, null);

    return null;
  }
}
