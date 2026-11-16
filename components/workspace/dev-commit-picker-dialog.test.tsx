import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevCommitPickerDialog } from '@/components/workspace/dev-commit-picker-dialog';
import type { DevProject, DevProjectCommits } from '@/lib/dev-types';

const project: DevProject = {
  appName: 'Website',
  appSlug: 'website',
  autoDeploy: true,
  autoDeployPullRequests: false,
  branch: 'main',
  buildArgs: null,
  buildContext: '.',
  createdAt: '2026-01-01T00:00:00.000Z',
  dockerfilePath: 'Dockerfile',
  envVariables: null,
  id: 'project-1',
  lastPollError: null,
  lastPolledAt: '2026-01-01T00:00:00.000Z',
  lastSeenSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  port: 3000,
  repositoryName: 'website',
  repositoryOwner: 'acme',
  repositoryUrl: 'https://github.com/acme/website',
  retentionLimit: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const payload: DevProjectCommits = {
  branches: ['main'],
  commits: [
    {
      authorName: 'Ada',
      committedAt: '2026-01-03T00:00:00.000Z',
      deployed: true,
      message: 'Search bar in the commit picker (#546)',
      sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
      shortSha: 'aaaaaa1',
      url: null,
    },
    {
      authorName: 'Grace',
      committedAt: '2026-01-02T00:00:00.000Z',
      deployed: false,
      message: 'Fix arrow key navigation',
      sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
      shortSha: 'bbbbbb2',
      url: null,
    },
    {
      authorName: 'Ada',
      committedAt: '2026-01-01T00:00:00.000Z',
      deployed: false,
      message: 'Retire stale containers',
      sha: 'ccccccccccccccccccccccccccccccccccccccc3',
      shortSha: 'cccccc3',
      url: null,
    },
  ],
  deployedShas: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1'],
};

function renderDialog() {
  return render(
    <DevCommitPickerDialog onCloseAction={vi.fn()} onDeployAction={vi.fn()} project={project} />
  );
}

describe('DevCommitPickerDialog search', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(payload))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters commits by message, author, or sha and restores the full list on clear', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Search bar in the commit picker (#546)');
    const search = screen.getByRole('textbox', { name: 'Search commits' });

    await user.type(search, 'grace');
    expect(screen.getByText('Fix arrow key navigation')).toBeInTheDocument();
    expect(screen.queryByText('Retire stale containers')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'cccccc3');
    expect(screen.getByText('Retire stale containers')).toBeInTheDocument();
    expect(screen.queryByText('Fix arrow key navigation')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear commit search' }));
    expect(screen.getByText('Search bar in the commit picker (#546)')).toBeInTheDocument();
    expect(screen.getByText('Fix arrow key navigation')).toBeInTheDocument();
    expect(screen.getByText('Retire stale containers')).toBeInTheDocument();
  });

  it('explains when no commits match the search', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Fix arrow key navigation');
    await user.type(screen.getByRole('textbox', { name: 'Search commits' }), 'nothing here');

    expect(screen.getByText(/No commits match/)).toBeInTheDocument();
    expect(screen.getByText('0 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Fix arrow key navigation')).toBeInTheDocument();
  });
});
