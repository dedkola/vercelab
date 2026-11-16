import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitAppPageShell } from '@/components/git-app-page-shell';
import { WorkspaceChromeShell } from '@/components/workspace/workspace-chrome-shell';
import type { DeploymentSummary } from '@/lib/persistence';
import type { MetricsSnapshot } from '@/lib/system-metrics';

const pushMock = vi.fn();
const prefetchMock = vi.fn();
const refreshMock = vi.fn();

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });
}

function getRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/git-app-page',
  useRouter: () => ({
    push: pushMock,
    prefetch: prefetchMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/actions', () => ({
  fetchDeploymentFromGitAction: vi.fn(),
  redeployDeploymentAction: vi.fn(),
  removeDeploymentAction: vi.fn(),
  stopDeploymentAction: vi.fn(),
  updateDeploymentAction: vi.fn(),
}));

const COMMIT = {
  authorName: 'Test User',
  committedAt: '2026-04-17T07:50:00.000Z',
  message: 'Redesign Git app management surface',
  sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  shortSha: 'a1b2c3d',
  url: 'https://github.com/dedkola/vercelab/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
};

const SNAPSHOT: MetricsSnapshot = {
  timestamp: '2026-04-17T08:00:00.000Z',
  warnings: [],
  hostIp: '192.168.1.10',
  system: {
    cpuPercent: 31,
    loadAverage: [0.48, 0.52, 0.56],
    memoryPercent: 68,
    memoryUsedBytes: 43.8 * 1024 ** 3,
    memoryTotalBytes: 64 * 1024 ** 3,
    diskReadBytesPerSecond: 0,
    diskWriteBytesPerSecond: 0,
  },
  network: {
    rxBytesPerSecond: 180_000,
    txBytesPerSecond: 96_000,
    interfaces: [{ name: 'eth0', rxBytesPerSecond: 180_000, txBytesPerSecond: 96_000 }],
  },
  containers: {
    running: 1,
    total: 1,
    cpuPercent: 18,
    memoryPercent: 0.9,
    memoryUsedBytes: 612 * 1024 ** 2,
    statusBreakdown: { healthy: 1, unhealthy: 0, stopped: 0 },
    top: [],
    all: [
      {
        id: 'runtime-control-plane',
        name: 'control-plane',
        cpuPercent: 18,
        memoryBytes: 612 * 1024 ** 2,
        memoryPercent: 0.9,
        networkRxBytesPerSecond: 48_000,
        networkTxBytesPerSecond: 14_000,
        networkTotalBytesPerSecond: 62_000,
        diskReadBytesPerSecond: 0,
        diskWriteBytesPerSecond: 24_000,
        diskTotalBytesPerSecond: 24_000,
        status: 'running',
        health: 'healthy',
        projectName: 'vercelab',
        serviceName: 'control-plane',
      },
    ],
  },
};

function createDeployment(overrides: Partial<DeploymentSummary>): DeploymentSummary {
  return {
    id: 'dep-1',
    repositoryName: 'dedkola/vercelab',
    repositoryUrl: 'https://github.com/dedkola/vercelab.git',
    branch: 'main',
    commitSha: null,
    appName: 'docs-app',
    subdomain: 'docs',
    port: 3000,
    exposureMode: 'http',
    hostPort: null,
    envVariables: null,
    serviceName: 'web',
    status: 'running',
    composeMode: 'dockerfile',
    projectName: 'docs-app',
    lastOutput: 'Deployment is healthy.',
    lastOperationSummary: 'Running.',
    updatedAt: '2026-04-17T08:00:00.000Z',
    deployedAt: '2026-04-17T07:55:00.000Z',
    tokenStored: true,
    ...overrides,
  } as DeploymentSummary;
}

function renderShell(
  props: { baseDomain?: string; initialDeployments?: DeploymentSummary[] } = {},
  snapshot: MetricsSnapshot | null = null
) {
  return render(
    <WorkspaceChromeShell influxExplorerUrl={null} initialHistory={[]} initialSnapshot={snapshot}>
      <GitAppPageShell {...props} />
    </WorkspaceChromeShell>
  );
}

describe('GitAppPageShell', () => {
  const fetchSpy = vi.spyOn(global, 'fetch');

  beforeEach(() => {
    pushMock.mockReset();
    prefetchMock.mockReset();
    refreshMock.mockReset();
    window.history.replaceState(null, '', '/git-app-page');
    window.localStorage.clear();

    fetchSpy.mockImplementation(async (input) => {
      const url = getRequestUrl(input);

      if (url.includes('/api/deployments/dep-1/source')) {
        return jsonResponse({
          branches: ['main', 'release', 'preview'],
          browserError: null,
          commits: [COMMIT],
          configuredBranch: 'main',
          configuredCommitSha: COMMIT.sha,
          currentBranch: 'main',
          currentCommit: COMMIT,
          repository: {
            fullName: 'dedkola/vercelab',
            name: 'vercelab',
            owner: 'dedkola',
            url: 'https://github.com/dedkola/vercelab',
          },
        });
      }

      if (url.includes('/api/deployments/dep-1/files')) {
        return jsonResponse({ files: [] });
      }

      if (url.includes('/api/github/repos/dedkola/vercelab/branches')) {
        return jsonResponse({ branches: ['main', 'release', 'preview'] });
      }

      if (url === '/api/github/repos') {
        return jsonResponse({
          repositories: [
            {
              id: 1,
              name: 'vercelab',
              fullName: 'dedkola/vercelab',
              owner: 'dedkola',
              cloneUrl: 'https://github.com/dedkola/vercelab.git',
              url: 'https://github.com/dedkola/vercelab.git',
              defaultBranch: 'main',
              visibility: 'private',
              description: 'Vercelab control plane',
              updatedAt: '2026-04-17T07:58:00.000Z',
            },
          ],
          tokenConfigured: true,
        });
      }

      if (url.startsWith('/api/metrics?')) {
        return jsonResponse({ history: [], snapshot: SNAPSHOT });
      }

      return jsonResponse({});
    });
  });

  afterEach(() => {
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  it('reflects aliased runtime names from the shared metrics snapshot', async () => {
    window.localStorage.setItem(
      'vercelab:containers-friendly-labels',
      JSON.stringify({ 'runtime-control-plane': 'Platform UI' })
    );

    renderShell(
      {
        baseDomain: 'example.com',
        initialDeployments: [
          createDeployment({
            appName: 'control-plane-app',
            subdomain: 'control-plane-app',
            serviceName: 'control-plane',
            projectName: 'vercelab',
          }),
        ],
      },
      SNAPSHOT
    );

    const appRow = await screen.findByRole('row', { name: /manage platform ui/i });

    expect(within(appRow).getByText('control-plane-app.example.com')).toBeVisible();
    expect(within(appRow).getByText(/^running$/i)).toBeVisible();
  });

  it('renders the git app page with editable deployment details', async () => {
    const user = userEvent.setup();

    renderShell({
      baseDomain: 'example.com',
      initialDeployments: [
        createDeployment({
          commitSha: COMMIT.sha,
          envVariables: 'NODE_ENV=production',
          lastOperationSummary: 'Redeployed from main successfully.',
        }),
      ],
    });

    expect(await screen.findByRole('heading', { name: /^apps$/i })).toBeVisible();
    const appRow = screen.getByRole('row', { name: /manage docs-app/i });

    expect(within(appRow).getByText('dedkola/vercelab')).toBeVisible();
    expect(within(appRow).getByText('docs.example.com')).toBeVisible();
    await user.click(within(appRow).getByRole('button', { name: /manage/i }));

    const appManager = await screen.findByRole('dialog', { name: /docs-app/i });

    expect(within(appManager).getByRole('heading', { name: /docs-app/i })).toBeVisible();
    expect(within(appManager).getByRole('tab', { name: /overview/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(within(appManager).getByRole('button', { name: /pull source/i })).toBeVisible();
    expect(within(appManager).getByRole('link', { name: /open route/i })).toHaveAttribute(
      'href',
      'https://docs.example.com'
    );

    await user.click(within(appManager).getByRole('tab', { name: /settings/i }));

    expect(screen.getByText(/application settings/i)).toBeVisible();
    expect(screen.getByText(/saved value.*next deployment value/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /save and recreate/i })).toBeVisible();
    expect(screen.getByDisplayValue('docs-app')).toBeVisible();
    expect(within(appManager).getAllByText(/a1b2c3d/i).length).toBeGreaterThan(0);

    await user.click(within(appManager).getByRole('tab', { name: /files/i }));

    expect(await screen.findByText(/upload configuration file/i)).toBeVisible();
    expect(screen.getByText(/retained across source pulls/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /upload and redeploy/i })).toBeDisabled();

    const upload = new File(['API_TOKEN=secret\n'], 'homelab.env', { type: 'text/plain' });
    await user.upload(screen.getByLabelText(/choose deployment file/i), upload);

    const workspaceFileName = screen.getByLabelText(/workspace filename/i);
    expect(workspaceFileName).toHaveValue('homelab.env');
    await user.clear(workspaceFileName);
    await user.type(workspaceFileName, '.env');
    expect(screen.getByRole('button', { name: /upload and redeploy/i })).toBeEnabled();
  });

  it('loads branches for the selected repository and lets the user choose one', async () => {
    const user = userEvent.setup();

    renderShell();

    const repositoryCombobox = await screen.findByRole('combobox', {
      name: /^repository$/i,
    });

    await waitFor(() => expect(repositoryCombobox).toBeEnabled());

    await user.click(repositoryCombobox);
    await user.click(await screen.findByText('dedkola/vercelab'));

    const branchCombobox = screen.getByRole('combobox', {
      name: /^branch$/i,
    });

    await waitFor(() => expect(branchCombobox).toHaveTextContent('main'));

    await user.click(branchCombobox);
    await user.click(await screen.findByText('release'));

    expect(branchCombobox).toHaveTextContent('release');

    await user.click(screen.getByRole('button', { name: /review deploy/i }));

    const reviewDialog = screen.getByRole('dialog', { name: /review new deployment/i });
    expect(
      within(reviewDialog).getByRole('combobox', { name: /deployment branch/i })
    ).toHaveTextContent('release');
    expect(within(reviewDialog).getByText(/3 branches available for selection\./i)).toBeVisible();
    expect(
      fetchSpy.mock.calls.some(([input]) =>
        getRequestUrl(input).includes('/api/github/repos/dedkola/vercelab/branches')
      )
    ).toBe(true);
  });
});
