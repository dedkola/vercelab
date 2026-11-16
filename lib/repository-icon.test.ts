import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildRepositoryIconCandidates,
  fetchRepositoryIcon,
  parseRepositoryReference,
} from '@/lib/repository-icon';

function mockIconFetch(treePaths: readonly string[]) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void init;
      const url = String(input);

      if (url.includes('/git/trees/HEAD')) {
        return Response.json({
          tree: treePaths.map((path) => ({ path, type: 'blob' })),
        });
      }

      if (url.startsWith('https://raw.githubusercontent.com/')) {
        return new Response('<svg />', {
          headers: { 'Content-Type': 'image/svg+xml' },
          status: 200,
        });
      }

      return new Response(null, { status: 404 });
    }
  );

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRepositoryReference', () => {
  it('parses GitHub HTTPS, SCP, and bare URLs', () => {
    expect(parseRepositoryReference('https://github.com/dedkola/bladevault.git')).toMatchObject({
      owner: 'dedkola',
      path: 'dedkola/bladevault',
      provider: 'github',
      repository: 'bladevault',
    });
    expect(parseRepositoryReference('git@github.com:dedkola/bladevault.git')).toMatchObject({
      path: 'dedkola/bladevault',
      provider: 'github',
    });
    expect(parseRepositoryReference('github.com/dedkola/bladevault')).toMatchObject({
      path: 'dedkola/bladevault',
      provider: 'github',
    });
  });

  it('keeps GitLab subgroups in the project path', () => {
    expect(parseRepositoryReference('https://gitlab.com/group/sub/repo.git')).toEqual({
      path: 'group/sub/repo',
      provider: 'gitlab',
    });
  });

  it('rejects unknown hosts and incomplete repositories', () => {
    expect(parseRepositoryReference('https://example.com/dedkola/bladevault')).toBeNull();
    expect(parseRepositoryReference('https://github.com/dedkola')).toBeNull();
    expect(parseRepositoryReference('https://github.com/dedkola/blade vault')).toBeNull();
    expect(parseRepositoryReference('')).toBeNull();
  });
});

describe('buildRepositoryIconCandidates', () => {
  it('prefers the Next.js app icon folder', () => {
    const candidates = buildRepositoryIconCandidates();

    expect(candidates[0]).toBe('app/icon.svg');
    expect(candidates).toContain('static/logo.svg');
  });

  it('prefixes the build context before repository root candidates', () => {
    const candidates = buildRepositoryIconCandidates('apps/web');

    expect(candidates[0]).toBe('apps/web/app/icon.svg');
    expect(candidates.at(-1)).toBe('logo.png');
  });

  it('ignores traversal in the build context', () => {
    expect(buildRepositoryIconCandidates('../outside')).toEqual(buildRepositoryIconCandidates());
  });
});

describe('fetchRepositoryIcon', () => {
  it('serves the icon from the repository default branch', async () => {
    const fetchMock = mockIconFetch(['app/icon.svg']);

    const icon = await fetchRepositoryIcon('https://github.com/vercelab-test/with-icon.git');

    expect(icon).toMatchObject({ contentType: 'image/svg+xml', path: 'app/icon.svg' });
    expect(icon ? new TextDecoder().decode(icon.body) : null).toBe('<svg />');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/vercelab-test/with-icon/HEAD/app/icon.svg',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('picks the first candidate path the repository actually contains', async () => {
    mockIconFetch(['public/logo.png', 'static/logo.svg', 'app/icon.png']);

    await expect(
      fetchRepositoryIcon('https://github.com/vercelab-test/candidates.git')
    ).resolves.toMatchObject({ path: 'app/icon.png' });
  });

  it('sends the configured token and caches the result', async () => {
    const fetchMock = mockIconFetch(['app/icon.svg']);
    const repositoryUrl = 'https://github.com/vercelab-test/private-icon.git';

    await fetchRepositoryIcon(repositoryUrl, { token: 'ghp_test' });
    await fetchRepositoryIcon(repositoryUrl, { token: 'ghp_test' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer ghp_test' }),
    });
  });

  it('returns null for repositories without a recognizable icon', async () => {
    mockIconFetch(['README.md', 'src/index.ts']);

    await expect(
      fetchRepositoryIcon('https://github.com/vercelab-test/no-icon.git')
    ).resolves.toBeNull();
  });

  it('returns null when the repository cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    );

    await expect(
      fetchRepositoryIcon('https://github.com/vercelab-test/missing.git')
    ).resolves.toBeNull();
  });
});
