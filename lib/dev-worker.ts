import 'server-only';

import { getAppConfig } from '@/lib/app-config';
import {
  buildAndDeployDevDeployment,
  reconcileDevDeploymentContainerStates,
} from '@/lib/dev-engine';
import {
  claimNextQueuedDevDeployment,
  getDevProjectById,
  listDevProjects,
  recoverInterruptedDevDeployments,
  updateDevDeploymentRecord,
  updateDevProjectPollState,
} from '@/lib/dev-persistence';
import { syncDevProject } from '@/lib/dev-projects';

const WORKER_STATE_KEY = Symbol.for('vercelab.dev-worker');
const QUEUE_TICK_MS = 3000;
const RECONCILE_TICK_MS = 60000;
const MAX_POLL_BACKOFF_MS = 15 * 60 * 1000;

type ProjectBackoff = {
  delayMs: number;
  nextAt: number;
};

type DevWorkerState = {
  backoff: Map<string, ProjectBackoff>;
  pollInFlight: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;
  queueInFlight: boolean;
  queueTimer: ReturnType<typeof setInterval> | null;
  reconcileTimer: ReturnType<typeof setInterval> | null;
  started: boolean;
};

type DevWorkerGlobal = typeof globalThis & {
  [WORKER_STATE_KEY]?: DevWorkerState;
};

function getWorkerState(): DevWorkerState {
  const globalState = globalThis as DevWorkerGlobal;

  globalState[WORKER_STATE_KEY] ??= {
    backoff: new Map(),
    pollInFlight: false,
    pollTimer: null,
    queueInFlight: false,
    queueTimer: null,
    reconcileTimer: null,
    started: false,
  };

  return globalState[WORKER_STATE_KEY];
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AggregateError) {
    const message = error.errors
      .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
      .filter(Boolean)
      .join('; ');

    if (message.trim().length > 0) {
      return message;
    }
  }

  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

async function processDevQueue() {
  const state = getWorkerState();

  if (state.queueInFlight) {
    return;
  }

  state.queueInFlight = true;

  try {
    while (true) {
      const deployment = await claimNextQueuedDevDeployment();

      if (!deployment) {
        return;
      }

      try {
        const project = await getDevProjectById(deployment.projectId);
        await buildAndDeployDevDeployment(project, deployment);
      } catch (error) {
        const message = getErrorMessage(error, 'Preview build failed.');
        console.error(`[dev] Build ${deployment.shortSha} failed: ${message}`);
        await updateDevDeploymentRecord(deployment.id, {
          buildFinishedAt: new Date().toISOString(),
          lastOutput: message,
          status: 'failed',
        }).catch(() => undefined);
      }
    }
  } catch (error) {
    console.error(`[dev] Queue worker failed: ${getErrorMessage(error, 'Unknown queue error.')}`);
  } finally {
    state.queueInFlight = false;
  }
}

function setProjectBackoff(projectId: string, baseDelayMs: number) {
  const state = getWorkerState();
  const current = state.backoff.get(projectId);
  const delayMs = Math.min(
    Math.max(current?.delayMs ?? baseDelayMs, baseDelayMs) * (current ? 2 : 1),
    MAX_POLL_BACKOFF_MS
  );

  state.backoff.set(projectId, {
    delayMs,
    nextAt: Date.now() + delayMs,
  });
}

function clearProjectBackoff(projectId: string) {
  getWorkerState().backoff.delete(projectId);
}

async function pollAllDevProjects() {
  const state = getWorkerState();

  if (state.pollInFlight) {
    return;
  }

  const token = getAppConfig().security.githubToken;

  if (!token) {
    return;
  }

  state.pollInFlight = true;

  try {
    const projects = await listDevProjects();
    const now = Date.now();

    for (const project of projects) {
      if (!project.autoDeploy) {
        continue;
      }

      const backoff = state.backoff.get(project.id);

      if (backoff && backoff.nextAt > now) {
        continue;
      }

      try {
        const result = await syncDevProject(project);
        clearProjectBackoff(project.id);

        if (result.enqueued > 0) {
          console.info(`[dev] Queued ${result.enqueued} preview build(s) for ${project.appName}.`);
        }
      } catch (error) {
        const message = getErrorMessage(error, 'Unable to poll GitHub for new commits.');
        const polledAt = new Date().toISOString();

        await updateDevProjectPollState(project.id, {
          lastPollError: message,
          lastPolledAt: polledAt,
        }).catch(() => undefined);
        setProjectBackoff(project.id, getAppConfig().dev.pollIntervalMs);
        console.error(`[dev] Poll failed for ${project.appName}: ${message}`);
      }
    }
  } catch (error) {
    console.error(`[dev] Poll worker failed: ${getErrorMessage(error, 'Unknown poll error.')}`);
  } finally {
    state.pollInFlight = false;
  }
}

async function reconcileContainerStates() {
  try {
    await reconcileDevDeploymentContainerStates();
  } catch (error) {
    console.error(
      `[dev] Container reconciliation failed: ${getErrorMessage(error, 'Unknown reconciliation error.')}`
    );
  }
}

export function startDevWorker() {
  const state = getWorkerState();

  if (state.started) {
    return false;
  }

  state.started = true;
  console.info('[dev] Starting preview deployment worker.');

  void recoverInterruptedDevDeployments().catch((error) => {
    console.error(
      `[dev] Unable to recover interrupted builds: ${getErrorMessage(error, 'Unknown recovery error.')}`
    );
  });
  void processDevQueue();
  void pollAllDevProjects();
  void reconcileContainerStates();

  state.queueTimer = setInterval(() => void processDevQueue(), QUEUE_TICK_MS);
  state.pollTimer = setInterval(() => void pollAllDevProjects(), getAppConfig().dev.pollIntervalMs);
  state.reconcileTimer = setInterval(() => void reconcileContainerStates(), RECONCILE_TICK_MS);
  state.queueTimer.unref?.();
  state.pollTimer.unref?.();
  state.reconcileTimer.unref?.();

  return true;
}
