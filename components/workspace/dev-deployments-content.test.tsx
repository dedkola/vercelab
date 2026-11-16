import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DevDeploymentsContent } from '@/components/workspace/dev-deployments-content';
import type { DevDeployment, DevProject } from '@/lib/dev-types';

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

function createDeployment(overrides: Partial<DevDeployment>): DevDeployment {
  return {
    branch: 'main',
    buildArgs: null,
    buildContext: '.',
    buildFinishedAt: null,
    buildLogPath: '/tmp/build.log',
    buildStartedAt: null,
    commitAuthor: 'Ada',
    commitMessage: 'Update landing page',
    commitSha: 'a'.repeat(40),
    commitUrl: null,
    committedAt: '2026-01-01T00:00:00.000Z',
    containerId: null,
    containerName: 'website-preview',
    createdAt: '2026-01-01T00:00:00.000Z',
    deployedAt: null,
    dockerfilePath: 'Dockerfile',
    envVariables: null,
    id: 'deployment-1',
    imageTag: 'website:aaaaaaa',
    lastOutput: null,
    port: 3000,
    projectId: project.id,
    pullRequestNumber: null,
    pullRequestTitle: null,
    shortSha: 'aaaaaaa',
    status: 'running',
    subdomain: 'aaaaaaa.website',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const runningDeployment = createDeployment({});
const stoppedDeployment = createDeployment({
  id: 'deployment-2',
  shortSha: 'bbbbbbb',
  status: 'stopped',
});
const buildingDeployment = createDeployment({
  id: 'deployment-3',
  shortSha: 'ccccccc',
  status: 'building',
});
const deployments = [runningDeployment, stoppedDeployment, buildingDeployment];

function renderContent(
  overrides: Partial<React.ComponentProps<typeof DevDeploymentsContent>> = {}
) {
  const props = {
    baseDomain: 'preview.test',
    containerStates: {},
    deployments,
    isBulkActionPending: false,
    isDeletingDeployment: false,
    onActionAction: vi.fn(),
    onClearSelectionAction: vi.fn(),
    onDeleteOldAction: vi.fn(),
    onDeleteSelectedAction: vi.fn(),
    onDeployLatestAction: vi.fn(),
    onOpenCommitsAction: vi.fn(),
    onOpenSettingsAction: vi.fn(),
    onRedeploySelectedAction: vi.fn(),
    onSelectDeploymentAction: vi.fn(),
    onSyncAction: vi.fn(),
    onToggleAllSelectionAction: vi.fn(),
    onToggleDeploymentSelectionAction: vi.fn(),
    pendingActionKey: null,
    previewProtocol: 'https' as const,
    project,
    selectedDeploymentIds: new Set<string>(),
    ...overrides,
  };

  return { props, view: render(<DevDeploymentsContent {...props} />) };
}

describe('DevDeploymentsContent selection', () => {
  it('renders a checkbox for every preview and a select-all checkbox', () => {
    renderContent();

    expect(screen.getAllByRole('checkbox')).toHaveLength(deployments.length + 1);
    expect(screen.getByRole('checkbox', { name: 'Select all previews' })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: `Select preview ${runningDeployment.shortSha}` })
    ).toBeInTheDocument();
  });

  it('calls the toggle handler with the preview id', async () => {
    const user = userEvent.setup();
    const { props } = renderContent();

    await user.click(
      screen.getByRole('checkbox', { name: `Select preview ${stoppedDeployment.shortSha}` })
    );

    expect(props.onToggleDeploymentSelectionAction).toHaveBeenCalledWith(stoppedDeployment.id);
  });

  it('select-all calls the toggle-all handler and shows an indeterminate state', async () => {
    const user = userEvent.setup();
    const { props } = renderContent({
      selectedDeploymentIds: new Set([runningDeployment.id]),
    });
    const selectAll = screen.getByRole('checkbox', { name: 'Select all previews' });

    expect(selectAll).toHaveProperty('indeterminate', true);

    await user.click(selectAll);

    expect(props.onToggleAllSelectionAction).toHaveBeenCalledTimes(1);
  });

  it('shows the bulk toolbar for the selection and triggers bulk actions', async () => {
    const user = userEvent.setup();
    const { props } = renderContent({
      selectedDeploymentIds: new Set([runningDeployment.id, stoppedDeployment.id]),
    });

    expect(screen.getByText('2 previews selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Redeploy' }));
    expect(props.onRedeploySelectedAction).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onDeleteSelectedAction).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(props.onClearSelectionAction).toHaveBeenCalledTimes(1);
  });

  it('notes how many selected previews are still building', () => {
    renderContent({ selectedDeploymentIds: new Set([buildingDeployment.id]) });

    expect(screen.getByText(/1 still building will be skipped/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redeploy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('offers delete old when older previews exist next to the latest release', async () => {
    const user = userEvent.setup();
    const { props } = renderContent();

    await user.click(screen.getByRole('button', { name: 'Delete old' }));

    expect(props.onDeleteOldAction).toHaveBeenCalledTimes(1);
  });

  it('disables delete old when only the latest release remains', () => {
    renderContent({ deployments: [runningDeployment] });

    expect(screen.getByRole('button', { name: 'Delete old' })).toBeDisabled();
  });
});
