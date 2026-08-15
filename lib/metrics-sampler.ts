import { getAppConfig } from '@/lib/app-config';
import { getMetricsSnapshot } from '@/lib/system-metrics';

const DEFAULT_SAMPLE_INTERVAL_MS = 10_000;
const MINIMUM_SAMPLE_INTERVAL_MS = 5_000;
const SAMPLER_STATE_KEY = Symbol.for('vercelab.metrics-sampler');

type MetricsSamplerState = {
  inFlight: boolean;
  timer: ReturnType<typeof setInterval> | null;
};

type MetricsSamplerGlobal = typeof globalThis & {
  [SAMPLER_STATE_KEY]?: MetricsSamplerState;
};

function getSamplerState() {
  const globalState = globalThis as MetricsSamplerGlobal;

  globalState[SAMPLER_STATE_KEY] ??= {
    inFlight: false,
    timer: null,
  };

  return globalState[SAMPLER_STATE_KEY];
}

function getSampleIntervalMs() {
  const configuredValue = Number.parseInt(
    process.env.VERCELAB_METRICS_SAMPLE_INTERVAL_MS ?? '',
    10
  );

  return Number.isFinite(configuredValue)
    ? Math.max(MINIMUM_SAMPLE_INTERVAL_MS, configuredValue)
    : DEFAULT_SAMPLE_INTERVAL_MS;
}

async function collectSample(state: MetricsSamplerState) {
  if (state.inFlight) {
    return;
  }

  state.inFlight = true;

  try {
    await getMetricsSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to collect metrics.';
    console.error(`[metrics] Background sample failed: ${message}`);
  } finally {
    state.inFlight = false;
  }
}

export function startMetricsSampler() {
  const config = getAppConfig();

  if (!config.metrics.influxUrl || !config.metrics.influxDatabase) {
    return false;
  }

  const state = getSamplerState();

  if (state.timer) {
    return false;
  }

  const intervalMs = getSampleIntervalMs();
  void collectSample(state);
  state.timer = setInterval(() => void collectSample(state), intervalMs);
  state.timer.unref?.();

  return true;
}

export function stopMetricsSampler() {
  const state = getSamplerState();

  if (!state.timer) {
    return false;
  }

  clearInterval(state.timer);
  state.timer = null;
  return true;
}
