import { render, screen, waitFor } from '@testing-library/react';
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

function renderDialog({
  onCloseAction = vi.fn(),
  onDeployAction = vi.fn(async () => undefined),
}: {
  onCloseAction?: () => void;
  onDeployAction?: (commitSha: string) => Promise<void>;
} = {}) {
  return render(
    <DevCommitPickerDialog
      onCloseAction={onCloseAction}
      onDeployAction={onDeployAction}
      project={project}
    />
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

describe('DevCommitPickerDialog multi-deploy', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(payload))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deploys selected commits one at a time, oldest first', async () => {
    const user = userEvent.setup();
    const onDeployAction = vi.fn(async () => undefined);
    const onCloseAction = vi.fn();
    renderDialog({ onCloseAction, onDeployAction });

    await screen.findByText('Search bar in the commit picker (#546)');
    await user.click(screen.getByRole('checkbox', { name: 'Select commit bbbbbb2' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select commit cccccc3' }));

    expect(screen.getByText('2 commits selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Deploy 2 commits/ }));

    await waitFor(() => expect(onDeployAction).toHaveBeenCalledTimes(2));
    expect(onDeployAction.mock.calls).toEqual([
      ['ccccccccccccccccccccccccccccccccccccccc3'],
      ['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2'],
    ]);
    await waitFor(() => expect(onCloseAction).toHaveBeenCalled());
  });

  it('select all skips commits that are already deployed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText('Search bar in the commit picker (#546)');
    expect(screen.getByRole('checkbox', { name: 'Select commit aaaaaa1' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select all commits' }));
    expect(screen.getByText('2 commits selected')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Select all commits' }));
    expect(screen.queryByText('2 commits selected')).not.toBeInTheDocument();
  });

  it('keeps the dialog open and the failed commits selected when a deploy fails', async () => {
    const user = userEvent.setup();
    const onDeployAction = vi
      .fn<(commitSha: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Build engine unavailable'))
      .mockResolvedValue(undefined);
    const onCloseAction = vi.fn();
    renderDialog({ onCloseAction, onDeployAction });

    await screen.findByText('Search bar in the commit picker (#546)');
    await user.click(screen.getByRole('checkbox', { name: 'Select commit bbbbbb2' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select commit cccccc3' }));
    await user.click(screen.getByRole('button', { name: /Deploy 2 commits/ }));

    await waitFor(() => expect(onDeployAction).toHaveBeenCalledTimes(2));
    expect(onCloseAction).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Select commit cccccc3' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select commit bbbbbb2' })).not.toBeChecked();
  });
});
