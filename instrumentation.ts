export async function register() {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NODE_ENV === 'test'
  ) {
    return;
  }

  const { startMetricsSampler } = await import('@/lib/metrics-sampler');
  startMetricsSampler();

  const { startDevWorker } = await import('@/lib/dev-worker');
  startDevWorker();
}
