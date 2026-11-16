import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildMock,
  claimMock,
  getProjectMock,
  listProjectsMock,
  lockMock,
  recoverMock,
  releaseMock,
  syncMock,
  updateDeploymentMock,
} = vi.hoisted(() => ({
  buildMock: vi.fn(),
  claimMock: vi.fn(),
  getProjectMock: vi.fn(),
  listProjectsMock: vi.fn(async () => []),
  lockMock: vi.fn(),
  recoverMock: vi.fn(),
  releaseMock: vi.fn(async () => undefined),
  syncMock: vi.fn(),
  updateDeploymentMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/app-config', () => ({
  getAppConfig: () => ({
    dev: { pollIntervalMs: 60_000 },
    security: { githubToken: null },
  }),
}));

vi.mock('@/lib/dev-engine', () => ({
  buildAndDeployDevDeployment: buildMock,
  reconcileDevDeploymentContainerStates: vi.fn(async () => undefined),
}));

vi.mock('@/lib/dev-persistence', () => ({
  acquireDevBuildLock: lockMock,
  claimNextQueuedDevDeployment: claimMock,
  getDevProjectById: getProjectMock,
  listDevProjects: listProjectsMock,
  recoverInterruptedDevDeployments: recoverMock,
  updateDevDeploymentRecord: updateDeploymentMock,
  updateDevProjectPollState: vi.fn(async () => undefined),
}));

vi.mock('@/lib/dev-projects', () => ({
  syncDevProject: syncMock,
}));

function createDeployment(index: number) {
  return {
    commitSha: `sha-${index}`,
    id: `deployment-${index}`,
    projectId: 'project-1',
    shortSha: `sha-${index}`,
  };
}

async function loadWorker() {
  (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('vercelab.dev-worker')] = undefined;

  return import('@/lib/dev-worker');
}

describe('processDevQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockMock.mockResolvedValue({ release: releaseMock });
    getProjectMock.mockResolvedValue({ id: 'project-1' });
  });

  it('builds queued deployments one at a time in queue order', async () => {
    const inFlight: string[] = [];
    let maxConcurrent = 0;

    buildMock.mockImplementation(async (_project: unknown, deployment: { id: string }) => {
      inFlight.push(deployment.id);
      maxConcurrent = Math.max(maxConcurrent, inFlight.length);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight.pop();
    });

    claimMock
      .mockResolvedValueOnce(createDeployment(1))
      .mockResolvedValueOnce(createDeployment(2))
      .mockResolvedValueOnce(createDeployment(3))
      .mockResolvedValue(null);

    const { processDevQueue } = await loadWorker();
    await processDevQueue();

    expect(buildMock.mock.calls.map((call) => (call[1] as { id: string }).id)).toEqual([
      'deployment-1',
      'deployment-2',
      'deployment-3',
    ]);
    expect(maxConcurrent).toBe(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('does not claim anything while another worker holds the build lock', async () => {
    lockMock.mockResolvedValue(null);

    const { processDevQueue } = await loadWorker();
    await processDevQueue();

    expect(claimMock).not.toHaveBeenCalled();
    expect(buildMock).not.toHaveBeenCalled();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('ignores a second drain while the current one is still running', async () => {
    const buildGate: { finish?: () => void } = {};

    buildMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          buildGate.finish = resolve;
        })
    );
    claimMock.mockResolvedValueOnce(createDeployment(1)).mockResolvedValue(null);

    const { processDevQueue } = await loadWorker();
    const firstRun = processDevQueue();
    await vi.waitFor(() => expect(buildMock).toHaveBeenCalledTimes(1));

    await processDevQueue();

    expect(claimMock).toHaveBeenCalledTimes(1);
    expect(buildMock).toHaveBeenCalledTimes(1);

    buildGate.finish?.();
    await firstRun;

    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('releases the build lock when a build fails so the queue can continue', async () => {
    buildMock.mockRejectedValueOnce(new Error('docker build failed')).mockResolvedValue(undefined);
    claimMock
      .mockResolvedValueOnce(createDeployment(1))
      .mockResolvedValueOnce(createDeployment(2))
      .mockResolvedValue(null);

    const { processDevQueue } = await loadWorker();
    await processDevQueue();

    expect(updateDeploymentMock).toHaveBeenCalledWith(
      'deployment-1',
      expect.objectContaining({ status: 'failed' })
    );
    expect(buildMock).toHaveBeenCalledTimes(2);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
