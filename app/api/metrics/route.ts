import { getMetricsSnapshot } from '@/lib/system-metrics';
import {
  type AllContainersMetricsHistorySeries,
  type ContainerMetricsHistoryPoint,
  type MetricsHistoryPoint,
  getAllContainersMetricsHistoryFromInflux,
  getContainerMetricsHistoryFromInflux,
  getMetricsHistoryFromInflux,
} from '@/lib/influx-metrics';
import { getDashboardHistorySettings, normalizeDashboardRange } from '@/lib/metrics-range';

export const dynamic = 'force-dynamic';

type MetricsApiResponse = {
  snapshot: Awaited<ReturnType<typeof getMetricsSnapshot>>;
  history?: MetricsHistoryPoint[];
  containerHistory?: ContainerMetricsHistoryPoint[];
  allContainerHistory?: AllContainersMetricsHistorySeries[];
};

type CacheEntry = {
  expiresAt: number;
  inFlight: Promise<MetricsApiResponse> | null;
  payload: MetricsApiResponse | null;
};

const CACHE_TTL_MS = 2000;
const responseCache = new Map<string, CacheEntry>();
const isTestEnv = process.env.NODE_ENV === "test";

function cleanupExpiredCacheEntries(now: number) {
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now && !entry.inFlight) {
      responseCache.delete(key);
    }
  }
}

function buildCacheKey(url: URL) {
  return `${url.pathname}${url.search}`;
}

async function buildMetricsPayload(request: Request): Promise<MetricsApiResponse> {
  const url = new URL(request.url);
  const allContainers = url.searchParams.get('allContainers') === 'true';
  const includeHistory = url.searchParams.get('includeHistory') !== 'false';
  const includeContainerHistory = url.searchParams.get('includeContainerHistory') === 'true';
  const includeAllContainerHistory = url.searchParams.get('includeAllContainerHistory') === 'true';
  const mode = url.searchParams.get('mode');
  const containerId = url.searchParams.get('containerId')?.trim() ?? '';
  const containerName = url.searchParams.get('containerName')?.trim() ?? '';
  const isCurrentMode = mode === 'current';

  const maxPoints = 240;
  const currentModeLimit = 48;
  const currentModeBucketSeconds = 5;

  const range = normalizeDashboardRange(url.searchParams.get('range'));
  const { bucketSeconds: rangeBucketSeconds, limit: rangeLimit } = getDashboardHistorySettings(
    range,
    maxPoints
  );

  const historyLimit = isCurrentMode ? currentModeLimit : rangeLimit;
  const historyBucketSeconds = isCurrentMode ? currentModeBucketSeconds : rangeBucketSeconds;

  const snapshot = await getMetricsSnapshot();
  const networkInterfaceName = snapshot.network.interfaces[0]?.name;
  const [history, containerHistory, allContainerHistory] = await Promise.all([
    includeHistory
      ? getMetricsHistoryFromInflux({
          hostIp: snapshot.hostIp,
          limit: historyLimit,
          bucketSeconds: historyBucketSeconds,
          ...(networkInterfaceName ? { networkInterfaceName } : {}),
        }).catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to read metrics history from InfluxDB.';

          console.error(`[metrics] ${message}`);
          return [] as MetricsHistoryPoint[];
        })
      : Promise.resolve(undefined),
    includeContainerHistory || containerId || containerName
      ? getContainerMetricsHistoryFromInflux({
          hostIp: snapshot.hostIp,
          containerId: containerId || undefined,
          containerName: containerName || undefined,
          limit: historyLimit,
          bucketSeconds: historyBucketSeconds,
        }).catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to read container history from InfluxDB.';

          console.error(`[metrics] ${message}`);
          return [] as ContainerMetricsHistoryPoint[];
        })
      : Promise.resolve(undefined),
    includeAllContainerHistory || allContainers
      ? getAllContainersMetricsHistoryFromInflux({
          hostIp: snapshot.hostIp,
          limit: historyLimit,
          bucketSeconds: historyBucketSeconds,
        }).catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : 'Unable to read grouped container history from InfluxDB.';

          console.error(`[metrics] ${message}`);
          return [] as AllContainersMetricsHistorySeries[];
        })
      : Promise.resolve(undefined),
  ]);

  const payload: MetricsApiResponse = {
    snapshot,
  };

  if (history) {
    payload.history = history;
  }

  if (containerHistory) {
    payload.containerHistory = containerHistory;
  }

  if (allContainerHistory) {
    payload.allContainerHistory = allContainerHistory;
  }

  return payload;
}

export async function GET(request: Request) {
  if (isTestEnv) {
    return Response.json(await buildMetricsPayload(request));
  }

  const url = new URL(request.url);
  const key = buildCacheKey(url);
  const now = Date.now();

  cleanupExpiredCacheEntries(now);

  const cached = responseCache.get(key);

  if (cached && cached.expiresAt > now && cached.payload) {
    return Response.json(cached.payload);
  }

  if (cached?.inFlight) {
    const payload = await cached.inFlight;
    return Response.json(payload);
  }

  const inFlight = buildMetricsPayload(request);

  responseCache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    inFlight,
    payload: null,
  });

  try {
    const payload = await inFlight;

    responseCache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      inFlight: null,
      payload,
    });

    return Response.json(payload);
  } catch (error) {
    responseCache.delete(key);
    throw error;
  }
}
