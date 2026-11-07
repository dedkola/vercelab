import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  getWebhookBranchRef,
  getWebhookCommit,
  getWebhookRepositoryFullName,
  parseGitHubPushPayload,
  verifyGitHubWebhookSignature,
} from '@/lib/dev-webhook';

const SECRET = 'a'.repeat(64);
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function sign(body: string, secret = SECRET) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function createPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    after: SHA,
    head_commit: {
      author: {
        name: 'Dev User',
      },
      id: SHA,
      message: 'Fix preview routing\n\nLonger body',
      timestamp: '2026-11-07T10:00:00.000Z',
      url: `https://github.com/acme/app/commit/${SHA}`,
    },
    ref: 'refs/heads/main',
    repository: {
      full_name: 'acme/app',
    },
    ...overrides,
  });
}

describe('dev webhook helpers', () => {
  it('verifies valid GitHub webhook signatures and rejects invalid ones', () => {
    const body = createPayload();

    expect(verifyGitHubWebhookSignature(SECRET, body, sign(body))).toBe(true);
    expect(verifyGitHubWebhookSignature(SECRET, body, sign(body, 'b'.repeat(64)))).toBe(false);
    expect(verifyGitHubWebhookSignature(SECRET, body, 'sha1=deadbeef')).toBe(false);
    expect(verifyGitHubWebhookSignature(SECRET, body, null)).toBe(false);
  });

  it('maps push payload branch, repository, and commit metadata', () => {
    const payload = parseGitHubPushPayload(createPayload());

    expect(getWebhookRepositoryFullName(payload)).toBe('acme/app');
    expect(getWebhookBranchRef(payload)).toBe('refs/heads/main');
    expect(getWebhookCommit(payload)).toEqual({
      authorName: 'Dev User',
      committedAt: '2026-11-07T10:00:00.000Z',
      message: 'Fix preview routing',
      sha: SHA,
      url: `https://github.com/acme/app/commit/${SHA}`,
    });
  });

  it('ignores deleted branches and all-zero shas', () => {
    expect(getWebhookCommit(parseGitHubPushPayload(createPayload({ deleted: true })))).toBeNull();
    expect(
      getWebhookCommit(parseGitHubPushPayload(createPayload({ after: '0'.repeat(40) })))
    ).toBeNull();
  });

  it('supports pushes without a head_commit payload', () => {
    const commit = getWebhookCommit(parseGitHubPushPayload(createPayload({ head_commit: null })));

    expect(commit).toEqual({
      authorName: null,
      committedAt: null,
      message: 'Commit',
      sha: SHA,
      url: '',
    });
  });
});
