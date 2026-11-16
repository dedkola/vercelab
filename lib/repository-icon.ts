import {
  DEPLOYMENT_ICON_CANDIDATES,
  MAX_DEPLOYMENT_ICON_BYTES,
  getDeploymentIconContentType,
  pickLooseIconPath,
} from '@/lib/deployment-icon';

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const GITLAB_HOSTS = new Set(['gitlab.com', 'www.gitlab.com']);
const SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const POSITIVE_CACHE_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const GITLAB_PROBE_CONCURRENCY = 5;

const GITHUB_API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'vercelab',
  'X-GitHub-Api-Version': '2022-11-28',
};

export type RepositoryReference =
  | { owner: string; path: string; provider: 'github'; repository: string }
  | { path: string; provider: 'gitlab' };

export type RepositoryIcon = {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
  path: string;
};

type RepositoryIconOptions = {
  directory?: string | null;
  token?: string | null;
};

type CacheEntry = {
  expiresAt: number;
  value: RepositoryIcon | null;
};

const repositoryIconCache = new Map<string, CacheEntry>();

function sanitizeSegments(segments: readonly string[]) {
  const sanitized = segments
    .map((segment) => segment.replace(/\.git$/i, '').trim())
    .filter(Boolean);

  if (
    !sanitized.length ||
    sanitized.some(
      (segment) => !SEGMENT_PATTERN.test(segment) || segment === '.' || segment === '..'
    )
  ) {
    return null;
  }

  return sanitized;
}

export function parseRepositoryReference(repositoryUrl: string): RepositoryReference | null {
  const trimmed = repositoryUrl.trim();

  if (!trimmed) {
    return null;
  }

  let host: string;
  let urlPath: string;
  const scpLikeMatch = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(trimmed);

  if (!trimmed.includes('://') && scpLikeMatch) {
    host = scpLikeMatch[1] ?? '';
    urlPath = scpLikeMatch[2] ?? '';
  } else {
    try {
      const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      host = url.hostname;
      urlPath = url.pathname;
    } catch {
      return null;
    }
  }

  const normalizedHost = host.toLowerCase();
  const segments = sanitizeSegments(urlPath.split('/').filter(Boolean));

  if (!segments) {
    return null;
  }

  if (GITHUB_HOSTS.has(normalizedHost)) {
    const [owner, repository] = segments;

    if (!owner || !repository) {
      return null;
    }

    return { owner, path: `${owner}/${repository}`, provider: 'github', repository };
  }

  if (GITLAB_HOSTS.has(normalizedHost)) {
    if (segments.length < 2) {
      return null;
    }

    return { path: segments.join('/'), provider: 'gitlab' };
  }

  return null;
}

function normalizeDirectory(directory?: string | null): string | null {
  const normalizedDirectory = (directory ?? '')
    .trim()
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '');

  if (
    !normalizedDirectory ||
    normalizedDirectory === '.' ||
    !sanitizeSegments(normalizedDirectory.split('/'))
  ) {
    return null;
  }

  return normalizedDirectory;
}

export function buildRepositoryIconCandidates(directory?: string | null): string[] {
  const candidates = [...DEPLOYMENT_ICON_CANDIDATES];
  const normalizedDirectory = normalizeDirectory(directory);

  if (!normalizedDirectory) {
    return candidates;
  }

  return [...candidates.map((candidate) => `${normalizedDirectory}/${candidate}`), ...candidates];
}

function pickLooseRepositoryIconPath(blobPaths: readonly string[], directory?: string | null) {
  const prefix = normalizeDirectory(directory);

  if (prefix) {
    const nestedIconPath = pickLooseIconPath(
      blobPaths
        .filter((blobPath) => blobPath.startsWith(`${prefix}/`))
        .map((blobPath) => blobPath.slice(prefix.length + 1))
    );

    if (nestedIconPath) {
      return `${prefix}/${nestedIconPath}`;
    }
  }

  return pickLooseIconPath(blobPaths);
}

function encodePath(filePath: string) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

async function readIconResponse(
  filePath: string,
  response: Response
): Promise<RepositoryIcon | null> {
  if (!response.ok) {
    return null;
  }

  const contentType = getDeploymentIconContentType(filePath);

  if (!contentType) {
    return null;
  }

  const buffer = new Uint8Array(await response.arrayBuffer());

  if (!buffer.byteLength || buffer.byteLength > MAX_DEPLOYMENT_ICON_BYTES) {
    return null;
  }

  return { body: buffer, contentType, path: filePath };
}

async function fetchGitHubRepositoryIcon(
  reference: Extract<RepositoryReference, { provider: 'github' }>,
  options: RepositoryIconOptions,
  candidates: readonly string[]
): Promise<RepositoryIcon | null> {
  const requestHeaders = options.token
    ? { ...GITHUB_API_HEADERS, Authorization: `Bearer ${options.token}` }
    : GITHUB_API_HEADERS;
  const treeUrl = `https://api.github.com/repos/${encodePath(reference.path)}/git/trees/HEAD?recursive=1`;
  const treeResponse = await fetch(treeUrl, { cache: 'no-store', headers: requestHeaders });

  if (!treeResponse.ok) {
    return null;
  }

  const treePayload = (await treeResponse.json()) as {
    tree?: Array<{ path?: string; type?: string }>;
  };
  const blobsByLowercasePath = new Map<string, string>();

  for (const entry of treePayload.tree ?? []) {
    if (entry.type === 'blob' && entry.path) {
      blobsByLowercasePath.set(entry.path.toLowerCase(), entry.path);
    }
  }

  const iconPath =
    candidates
      .map((candidate) => blobsByLowercasePath.get(candidate.toLowerCase()))
      .find((candidate): candidate is string => Boolean(candidate)) ??
    pickLooseRepositoryIconPath([...blobsByLowercasePath.values()], options.directory);

  if (!iconPath) {
    return null;
  }

  const rawUrl = `https://raw.githubusercontent.com/${encodePath(reference.path)}/HEAD/${encodePath(iconPath)}`;
  const rawResponse = await fetch(rawUrl, { cache: 'no-store', headers: requestHeaders });
  const rawIcon = await readIconResponse(iconPath, rawResponse);

  if (rawIcon || !options.token) {
    return rawIcon;
  }

  const contentsUrl = `https://api.github.com/repos/${encodePath(reference.path)}/contents/${encodePath(iconPath)}`;

  return await readIconResponse(
    iconPath,
    await fetch(contentsUrl, {
      cache: 'no-store',
      headers: { ...requestHeaders, Accept: 'application/vnd.github.raw' },
    })
  );
}

async function fetchGitLabRepositoryIcon(
  reference: Extract<RepositoryReference, { provider: 'gitlab' }>,
  candidates: readonly string[]
): Promise<RepositoryIcon | null> {
  for (let index = 0; index < candidates.length; index += GITLAB_PROBE_CONCURRENCY) {
    const batch = candidates.slice(index, index + GITLAB_PROBE_CONCURRENCY);
    const batchIcons = await Promise.all(
      batch.map(async (candidate) => {
        const rawUrl = `https://gitlab.com/${encodePath(reference.path)}/-/raw/HEAD/${encodePath(candidate)}`;

        try {
          return await readIconResponse(candidate, await fetch(rawUrl, { cache: 'no-store' }));
        } catch {
          return null;
        }
      })
    );
    const icon = batchIcons.find((candidate): candidate is RepositoryIcon => candidate !== null);

    if (icon) {
      return icon;
    }
  }

  return null;
}

function readCache(key: string) {
  const entry = repositoryIconCache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    repositoryIconCache.delete(key);
    return null;
  }

  return entry;
}

function writeCache(key: string, value: RepositoryIcon | null) {
  if (repositoryIconCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = repositoryIconCache.keys().next().value;

    if (oldestKey !== undefined) {
      repositoryIconCache.delete(oldestKey);
    }
  }

  repositoryIconCache.set(key, {
    expiresAt: Date.now() + (value ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    value,
  });
}

export async function fetchRepositoryIcon(
  repositoryUrl: string,
  options: RepositoryIconOptions = {}
): Promise<RepositoryIcon | null> {
  const reference = parseRepositoryReference(repositoryUrl);

  if (!reference) {
    return null;
  }

  const cacheKey = `${reference.provider}:${reference.path}`;
  const cached = readCache(cacheKey);

  if (cached) {
    return cached.value;
  }

  const candidates = buildRepositoryIconCandidates(options.directory);

  try {
    const icon =
      reference.provider === 'github'
        ? await fetchGitHubRepositoryIcon(reference, options, candidates)
        : await fetchGitLabRepositoryIcon(reference, candidates);

    writeCache(cacheKey, icon);

    return icon;
  } catch {
    writeCache(cacheKey, null);

    return null;
  }
}
