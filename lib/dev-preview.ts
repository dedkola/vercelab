import { getProxyProtocol, toContainerSlug } from '@/lib/container-routing';
import type { GitHubCommit } from '@/lib/github';
import type { DevContainerStatus, DevDeployment } from '@/lib/dev-types';

export type DevKeyValueEntry = {
  key: string;
  value: string;
};

const SHORT_SHA_LENGTH = 7;
const MAX_SHORT_SHA_LENGTH = 12;
const MAX_APP_SLUG_LENGTH = 40;

export { getProxyProtocol };

export function normalizeDevAppSlug(value: string) {
  return toContainerSlug(value).slice(0, MAX_APP_SLUG_LENGTH).replace(/-+$/g, '');
}

function normalizeDevCommitSha(value: string) {
  return value.trim().toLowerCase();
}

export function isFullGitSha(value: string) {
  return /^[0-9a-f]{40}$/i.test(value.trim());
}

export function buildPreviewShortSha(commitSha: string, shortLength = SHORT_SHA_LENGTH) {
  const normalized = normalizeDevCommitSha(commitSha);
  const length = Math.min(Math.max(shortLength, SHORT_SHA_LENGTH), MAX_SHORT_SHA_LENGTH);
  return normalized.slice(0, length);
}

export function buildPreviewSubdomain(
  appSlug: string,
  commitSha: string,
  shortLength = SHORT_SHA_LENGTH
) {
  const slug = normalizeDevAppSlug(appSlug);

  if (!slug) {
    throw new Error('Preview prefix is invalid.');
  }

  return `${slug}-${buildPreviewShortSha(commitSha, shortLength)}`;
}

export function buildPreviewUrl({
  baseDomain,
  protocol,
  subdomain,
}: {
  baseDomain: string;
  protocol: 'http' | 'https';
  subdomain: string;
}) {
  return `${protocol}://${subdomain}.${baseDomain}`;
}

export function buildDevContainerName(appSlug: string, shortSha: string) {
  const slug = normalizeDevAppSlug(appSlug);
  const normalizedSha = shortSha.trim().toLowerCase();

  if (!slug || !/^[0-9a-f]{7,12}$/.test(normalizedSha)) {
    throw new Error('Unable to build a preview container name.');
  }

  const prefix = 'vercelab-dev-';
  const maxSlugLength = 63 - prefix.length - 1 - normalizedSha.length;
  const safeSlug = slug.slice(0, Math.max(1, maxSlugLength)).replace(/-+$/g, '');

  return `${prefix}${safeSlug}-${normalizedSha}`;
}

export function buildDevImageTag(appSlug: string, commitSha: string) {
  const slug = normalizeDevAppSlug(appSlug);
  const normalizedSha = normalizeDevCommitSha(commitSha);

  if (!slug || !isFullGitSha(normalizedSha)) {
    throw new Error('Unable to build a preview image tag.');
  }

  return `vercelab-dev-${slug}:${normalizedSha}`;
}

export function getNewCommits(
  commits: GitHubCommit[],
  lastSeenSha: string | null,
  maxCatchUp = 5
): {
  commits: GitHubCommit[];
  nextLastSeenSha: string | null;
} {
  if (commits.length === 0) {
    return {
      commits: [],
      nextLastSeenSha: lastSeenSha,
    };
  }

  const head = commits[0]!;

  if (!lastSeenSha) {
    return {
      commits: [],
      nextLastSeenSha: head.sha,
    };
  }

  if (head.sha === lastSeenSha) {
    return {
      commits: [],
      nextLastSeenSha: lastSeenSha,
    };
  }

  const boundaryIndex = commits.findIndex((commit) => commit.sha === lastSeenSha);

  if (boundaryIndex === -1) {
    // Force-push or a gap larger than the API window. Build the new head only.
    return {
      commits: [head],
      nextLastSeenSha: head.sha,
    };
  }

  const unseen = commits.slice(0, boundaryIndex);
  const bounded = unseen.length > maxCatchUp ? [head] : unseen;

  return {
    commits: [...bounded].reverse(),
    nextLastSeenSha: head.sha,
  };
}

export function selectRetentionCandidates(deployments: DevDeployment[], retentionLimit: number) {
  if (retentionLimit <= 0 || deployments.length <= retentionLimit) {
    return [] as DevDeployment[];
  }

  const settled = deployments
    .filter((deployment) => deployment.status !== 'queued' && deployment.status !== 'building')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const removable = settled.filter(
    (deployment) => !(deployment.pullRequestNumber && deployment.status === 'running')
  );
  const excess = deployments.length - retentionLimit - (settled.length - removable.length);

  return removable.slice(0, Math.max(0, excess));
}

export function parseDevKeyValueLines(rawValue: string | null | undefined): DevKeyValueEntry[] {
  if (!rawValue) {
    return [];
  }

  const parsed: DevKeyValueEntry[] = [];
  const seen = new Set<string>();

  for (const line of rawValue.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex < 1) {
      throw new Error(`Invalid KEY=VALUE line "${trimmed}".`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1);

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(
        `Invalid key "${key}". Use letters, numbers, and underscores only, starting with a letter or underscore.`
      );
    }

    if (seen.has(key)) {
      throw new Error(`Duplicate key "${key}". Remove the duplicate line.`);
    }

    seen.add(key);
    parsed.push({ key, value });
  }

  return parsed;
}

export function toDevKeyValueMap(entries: DevKeyValueEntry[]) {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}

export function parseDevContainerStatus(statusText: string | null | undefined): DevContainerStatus {
  const normalized = statusText?.trim().toLowerCase() ?? '';

  if (!normalized) {
    return 'missing';
  }

  if (normalized.startsWith('up')) {
    return 'running';
  }

  if (normalized.startsWith('exited')) {
    return 'exited';
  }

  if (normalized.startsWith('created')) {
    return 'created';
  }

  if (normalized.startsWith('restarting')) {
    return 'restarting';
  }

  if (normalized.startsWith('paused')) {
    return 'paused';
  }

  if (normalized.startsWith('dead')) {
    return 'dead';
  }

  return 'unknown';
}

export function getCommitMessageTitle(message: string | null | undefined) {
  const title = (message ?? '').split('\n')[0]?.trim() ?? '';
  return title || 'Commit';
}

export function getDevDeploymentPreviewUrl(
  deployment: Pick<DevDeployment, 'subdomain'>,
  baseDomain: string,
  protocol: 'http' | 'https'
) {
  return buildPreviewUrl({
    baseDomain,
    protocol,
    subdomain: deployment.subdomain,
  });
}
