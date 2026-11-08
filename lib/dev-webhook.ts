import { createHmac, timingSafeEqual } from 'node:crypto';

import type { GitHubCommit } from '@/lib/github';

type GitHubPushPayload = {
  after?: unknown;
  deleted?: unknown;
  head_commit?: {
    author?: {
      name?: unknown;
    } | null;
    id?: unknown;
    message?: unknown;
    timestamp?: unknown;
    url?: unknown;
  } | null;
  ref?: unknown;
  repository?: {
    full_name?: unknown;
  } | null;
};

export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null
) {
  if (!signatureHeader) {
    return false;
  }

  const [algorithm, providedDigest] = signatureHeader.split('=');

  if (algorithm !== 'sha256' || !providedDigest) {
    return false;
  }

  const expectedDigest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(providedDigest, 'hex'), Buffer.from(expectedDigest, 'hex'));
  } catch {
    return false;
  }
}

export function parseGitHubPushPayload(rawBody: string): GitHubPushPayload {
  const parsed = JSON.parse(rawBody) as unknown;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('GitHub webhook payload is invalid.');
  }

  return parsed as GitHubPushPayload;
}

export function getWebhookRepositoryFullName(payload: GitHubPushPayload) {
  return typeof payload.repository?.full_name === 'string' ? payload.repository.full_name : null;
}

export function getWebhookBranchRef(payload: GitHubPushPayload) {
  return typeof payload.ref === 'string' ? payload.ref : null;
}

export function getWebhookCommit(payload: GitHubPushPayload): GitHubCommit | null {
  if (payload.deleted === true) {
    return null;
  }

  const sha = typeof payload.after === 'string' ? payload.after.trim().toLowerCase() : '';

  if (!/^[0-9a-f]{40}$/.test(sha) || /^0+$/.test(sha)) {
    return null;
  }

  const headCommit = payload.head_commit ?? null;
  const message =
    typeof headCommit?.message === 'string'
      ? (headCommit.message.split('\n')[0] ?? 'Commit')
      : 'Commit';
  const authorName = typeof headCommit?.author?.name === 'string' ? headCommit.author.name : null;
  const committedAt = typeof headCommit?.timestamp === 'string' ? headCommit.timestamp : null;
  const url = typeof headCommit?.url === 'string' ? headCommit.url : null;

  return {
    authorName,
    committedAt,
    message,
    sha,
    url: url ?? '',
  };
}

export type { GitHubPushPayload };
