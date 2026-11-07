import { describe, expect, it } from 'vitest';

import {
  buildDevContainerName,
  buildDevImageTag,
  buildPreviewShortSha,
  buildPreviewSubdomain,
  buildPreviewUrl,
  getNewCommits,
  getProxyProtocol,
  normalizeDevAppSlug,
  parseDevContainerStatus,
  parseDevKeyValueLines,
  selectRetentionCandidates,
  toDevKeyValueMap,
} from '@/lib/dev-preview';
import type { DevDeployment } from '@/lib/dev-types';
import type { GitHubCommit } from '@/lib/github';

const SHA_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA_B = 'b1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function createCommit(sha: string, message = 'Commit'): GitHubCommit {
  return {
    authorName: 'Dev',
    committedAt: '2026-11-07T10:00:00.000Z',
    message,
    sha,
    url: `https://github.com/acme/app/commit/${sha}`,
  };
}

function createDeployment(overrides: Partial<DevDeployment>): DevDeployment {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    projectId: 'project-1',
    commitSha: SHA_A,
    shortSha: SHA_A.slice(0, 7),
    commitMessage: 'Commit',
    commitAuthor: 'Dev',
    committedAt: '2026-11-07T10:00:00.000Z',
    commitUrl: null,
    branch: 'main',
    status: 'running',
    containerId: 'container-1',
    containerName: 'vercelab-dev-app-a1b2c3d',
    imageTag: 'vercelab-dev-app:latest',
    subdomain: 'app-a1b2c3d',
    dockerfilePath: 'Dockerfile',
    buildContext: '.',
    port: 3000,
    envVariables: null,
    buildArgs: null,
    buildLogPath: '/tmp/build.log',
    lastOutput: null,
    createdAt: '2026-11-07T10:00:00.000Z',
    updatedAt: '2026-11-07T10:00:00.000Z',
    buildStartedAt: null,
    buildFinishedAt: null,
    deployedAt: null,
    ...overrides,
  };
}

describe('dev preview helpers', () => {
  it('normalizes app slugs to safe preview prefixes', () => {
    expect(normalizeDevAppSlug('BladeVault')).toBe('bladevault');
    expect(normalizeDevAppSlug('  My App!! ')).toBe('my-app');
    expect(normalizeDevAppSlug('a'.repeat(60))).toHaveLength(40);
  });

  it('builds a short sha and preview subdomain', () => {
    expect(buildPreviewShortSha(SHA_A)).toBe('a1b2c3d');
    expect(buildPreviewShortSha(SHA_A, 9)).toBe('a1b2c3d4e');
    expect(buildPreviewSubdomain('blade', SHA_A)).toBe('blade-a1b2c3d');
    expect(buildPreviewSubdomain('Blade Vault', SHA_A, 8)).toBe('blade-vault-a1b2c3d4');
  });

  it('builds preview URLs and container names', () => {
    expect(getProxyProtocol('web')).toBe('http');
    expect(getProxyProtocol('websecure')).toBe('https');

    expect(
      buildPreviewUrl({
        baseDomain: 'home.com',
        protocol: 'https',
        subdomain: 'blade-a1b2c3d',
      })
    ).toBe('https://blade-a1b2c3d.home.com');

    expect(buildDevContainerName('blade', 'a1b2c3d')).toBe('vercelab-dev-blade-a1b2c3d');
    expect(buildDevContainerName('a'.repeat(40), 'a1b2c3d4e5f6')).toBe(
      `vercelab-dev-${'a'.repeat(37)}-a1b2c3d4e5f6`
    );
    expect(buildDevImageTag('blade', SHA_A)).toBe(`vercelab-dev-blade:${SHA_A}`);
  });

  it('detects only new commits and keeps chronological order for the queue', () => {
    const commits = [
      createCommit('c'.repeat(40)),
      createCommit(SHA_B),
      createCommit(SHA_A),
      createCommit('d'.repeat(40)),
    ];

    const result = getNewCommits(commits, SHA_A);

    expect(result.nextLastSeenSha).toBe('c'.repeat(40));
    expect(result.commits.map((commit) => commit.sha)).toEqual([SHA_B, 'c'.repeat(40)]);
  });

  it('baselines a project without a previous sha and avoids duplicate head builds', () => {
    const commits = [createCommit(SHA_A), createCommit(SHA_B)];

    expect(getNewCommits(commits, null)).toEqual({
      commits: [],
      nextLastSeenSha: SHA_A,
    });
    expect(getNewCommits(commits, SHA_A)).toEqual({
      commits: [],
      nextLastSeenSha: SHA_A,
    });
  });

  it('falls back to the head when the previous sha is outside the API window', () => {
    const commits = [createCommit(SHA_A), createCommit(SHA_B)];

    expect(getNewCommits(commits, 'f'.repeat(40))).toEqual({
      commits: [commits[0]],
      nextLastSeenSha: SHA_A,
    });
  });

  it('bounds large catch-up windows to the head commit only', () => {
    const commits = Array.from({ length: 10 }, (_, index) =>
      createCommit((index + 1).toString(16).padStart(40, '0'))
    );

    const result = getNewCommits(commits, commits[9]!.sha, 5);

    expect(result.commits).toEqual([commits[0]]);
  });

  it('selects oldest settled previews for retention without touching active builds', () => {
    const deployments = [
      createDeployment({ id: 'a', createdAt: '2026-11-07T10:00:00.000Z' }),
      createDeployment({ id: 'b', createdAt: '2026-11-07T11:00:00.000Z' }),
      createDeployment({ id: 'c', createdAt: '2026-11-07T12:00:00.000Z', status: 'building' }),
      createDeployment({ id: 'd', createdAt: '2026-11-07T13:00:00.000Z' }),
    ];

    expect(selectRetentionCandidates(deployments, 0)).toEqual([]);
    expect(selectRetentionCandidates(deployments, 3).map((deployment) => deployment.id)).toEqual([
      'a',
    ]);
  });

  it('parses KEY=VALUE blocks, preserves equals signs, and rejects duplicates', () => {
    const entries = parseDevKeyValueLines('A=1\n# comment\nB=hello=world\n\n');

    expect(entries).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'hello=world' },
    ]);
    expect(toDevKeyValueMap(entries)).toEqual({ A: '1', B: 'hello=world' });
    expect(() => parseDevKeyValueLines('A=1\nA=2')).toThrow(/Duplicate key/);
    expect(() => parseDevKeyValueLines('1A=value')).toThrow(/Invalid key/);
    expect(() => parseDevKeyValueLines('missing-separator')).toThrow(/KEY=VALUE/);
  });

  it('maps docker ps status text to container states', () => {
    expect(parseDevContainerStatus('Up 2 minutes (healthy)')).toBe('running');
    expect(parseDevContainerStatus('Exited (1) 3 minutes ago')).toBe('exited');
    expect(parseDevContainerStatus('Restarting (1) 2 seconds ago')).toBe('restarting');
    expect(parseDevContainerStatus('Created')).toBe('created');
    expect(parseDevContainerStatus(null)).toBe('missing');
  });
});
