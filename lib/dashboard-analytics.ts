import { readDeploymentContainerLogTail } from "@/lib/deployment-engine";
import { getMetricsHistoryFromInflux, type MetricsHistoryPoint } from "@/lib/influx-metrics";
import {
  getDashboardRangeSeconds,
  type DashboardRange,
} from "@/lib/metrics-range";
import {
  getLatestDeploymentOperation,
  listDashboardData,
  type DashboardActivity,
  type DashboardData,
} from "@/lib/persistence";
import {
  getMetricsSnapshot,
  type ContainerStats,
  type MetricsSnapshot,
} from "@/lib/system-metrics";

const ERROR_SIGNAL_RE =
  /\b(error|exception|fatal|panic|fail(?:ed|ure)?|timeout|denied|refused|unhealthy)\b/i;

export type ContainerTone = "running" | "stopped" | "unhealthy";

export type DashboardDeploymentMarker = {
  appName: string;
  label: string;
  operationType: DashboardActivity["operationType"];
  status: DashboardActivity["status"];
  timestamp: string;
};

export type DashboardHeatmapPayload = {
  containers: string[];
  deploymentMarkers: DashboardDeploymentMarker[];
  max: number;
  timestamps: string[];
  values: Array<[number, number, number]>;
};

export type DashboardAnalyticsPayload = {
  heatmap: DashboardHeatmapPayload;
  history: MetricsHistoryPoint[];
  snapshot: MetricsSnapshot;
  stats: DashboardData["stats"];
};

type HeatmapEvent = {
  intensity: number;
  label: string;
  timestamp: string;
};

type HeatmapModelInput = {
  events: HeatmapEvent[];
  markers: DashboardDeploymentMarker[];
  timestamps: string[];
};

function normalizeLogTimestamp(value: string) {
  return value.replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, "$1");
}

function toIsoTimestamp(value: string) {
  const normalized = normalizeLogTimestamp(value.trim());
  const timestamp = new Date(normalized);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

export function getContainerTone(
  container: Pick<ContainerStats, "health" | "status">,
): ContainerTone {
  if (container.health === "unhealthy") {
    return "unhealthy";
  }

  return container.status === "running" ? "running" : "stopped";
}

export function countErrorSignals(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((count, line) => count + (ERROR_SIGNAL_RE.test(line) ? 1 : 0), 0);
}

export function parseContainerLogEvents(output: string, fallbackLabel: string) {
  const events: HeatmapEvent[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const prefixedMatch = trimmed.match(
      /^([^|]+?)\s*\|\s*(\d{4}-\d{2}-\d{2}T\S+)\s*(.*)$/,
    );
    const bareMatch = prefixedMatch
      ? null
      : trimmed.match(/^((?:\d{4}-\d{2}-\d{2}T\S+))\s+(.*)$/);

    if (!prefixedMatch && !bareMatch) {
      continue;
    }

    const label = prefixedMatch?.[1]?.trim() || fallbackLabel;
    const rawTimestamp = prefixedMatch?.[2] ?? bareMatch?.[1] ?? "";
    const message = prefixedMatch?.[3] ?? bareMatch?.[2] ?? "";

    const timestamp = toIsoTimestamp(rawTimestamp);

    if (!timestamp) {
      continue;
    }

    const intensity = countErrorSignals(message);

    if (intensity === 0) {
      continue;
    }

    events.push({
      intensity,
      label,
      timestamp,
    });
  }

  return events;
}

export function buildHeatmapModel({
  events,
  markers,
  timestamps,
}: HeatmapModelInput): DashboardHeatmapPayload {
  const normalizedTimestamps = timestamps.length
    ? timestamps
    : [new Date().toISOString()];
  const bucketTimes = normalizedTimestamps.map((value) => new Date(value).getTime());
  const firstBucket = bucketTimes[0] ?? Date.now();
  const lastBucket = bucketTimes[bucketTimes.length - 1] ?? firstBucket;
  const bucketSpan =
    bucketTimes.length > 1
      ? Math.max(5_000, bucketTimes[1] - bucketTimes[0])
      : 60_000;
  const rowIndices = new Map<string, number>();
  const cellMap = new Map<string, number>();

  function findBucketIndex(timestamp: string) {
    const target = new Date(timestamp).getTime();

    if (Number.isNaN(target)) {
      return -1;
    }

    if (target < firstBucket - bucketSpan || target > lastBucket + bucketSpan) {
      return -1;
    }

    let closestIndex = 0;
    let closestDelta = Number.POSITIVE_INFINITY;

    for (let index = 0; index < bucketTimes.length; index += 1) {
      const delta = Math.abs(bucketTimes[index] - target);

      if (delta < closestDelta) {
        closestDelta = delta;
        closestIndex = index;
      }
    }

    return closestIndex;
  }

  for (const event of events) {
    if (event.intensity <= 0) {
      continue;
    }

    const xIndex = findBucketIndex(event.timestamp);

    if (xIndex === -1) {
      continue;
    }

    const label = event.label.trim() || "unknown";
    const yIndex = rowIndices.has(label) ? rowIndices.get(label)! : rowIndices.size;

    if (!rowIndices.has(label)) {
      rowIndices.set(label, yIndex);
    }

    const key = `${xIndex}:${yIndex}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + event.intensity);
  }

  const values = Array.from(cellMap.entries())
    .map(([key, value]) => {
      const [xIndex, yIndex] = key.split(":").map((entry) => Number.parseInt(entry, 10));
      return [xIndex, yIndex, value] as [number, number, number];
    })
    .sort((left, right) => left[1] - right[1] || left[0] - right[0]);

  const deploymentMarkers = markers
    .map((marker) => {
      const index = findBucketIndex(marker.timestamp);

      if (index === -1) {
        return null;
      }

      return {
        ...marker,
        timestamp: normalizedTimestamps[index],
      } satisfies DashboardDeploymentMarker;
    })
    .filter((entry): entry is DashboardDeploymentMarker => Boolean(entry));

  return {
    containers: Array.from(rowIndices.entries())
      .sort((left, right) => left[1] - right[1])
      .map(([label]) => label),
    deploymentMarkers,
    max: Math.max(1, ...values.map((entry) => entry[2])),
    timestamps: normalizedTimestamps,
    values,
  };
}

function getRangeQuery(range: DashboardRange) {
  const maxPoints = 240;
  const rangeSeconds = getDashboardRangeSeconds(range);
  const bucketSeconds = Math.max(
    5,
    Math.ceil(rangeSeconds / maxPoints / 5) * 5,
  );

  return {
    bucketSeconds,
    limit: Math.max(12, Math.min(maxPoints, Math.ceil(rangeSeconds / bucketSeconds))),
  };
}

async function getBuildHeatmapEvents(deploymentId: string, appName: string) {
  const operation = await getLatestDeploymentOperation(deploymentId);

  if (!operation) {
    return [] as HeatmapEvent[];
  }

  const intensity = Math.max(
    operation.status === "failed" ? 1 : 0,
    countErrorSignals(operation.output ?? operation.summary ?? ""),
  );

  if (intensity === 0) {
    return [] as HeatmapEvent[];
  }

  return [
    {
      intensity,
      label: `${appName} build`,
      timestamp: operation.updatedAt,
    },
  ] satisfies HeatmapEvent[];
}

async function getContainerHeatmapEvents(deploymentId: string, appName: string) {
  const output = await readDeploymentContainerLogTail(deploymentId, {
    includeAllServices: true,
    tail: 240,
    timestamps: true,
  });

  return parseContainerLogEvents(output, appName);
}

export async function getDashboardAnalytics(
  range: DashboardRange,
): Promise<DashboardAnalyticsPayload> {
  const { bucketSeconds, limit } = getRangeQuery(range);
  const [snapshot, dashboardData] = await Promise.all([
    getMetricsSnapshot(),
    listDashboardData(),
  ]);
  const history = await getMetricsHistoryFromInflux({
    bucketSeconds,
    hostIp: snapshot.hostIp,
    limit,
  }).catch(() => [] as MetricsHistoryPoint[]);

  const heatmapEventGroups = await Promise.all(
    dashboardData.deployments.map(async (deployment) => {
      const [buildEvents, containerEvents] = await Promise.all([
        getBuildHeatmapEvents(deployment.id, deployment.appName),
        getContainerHeatmapEvents(deployment.id, deployment.appName),
      ]);

      return [...buildEvents, ...containerEvents];
    }),
  );

  return {
    heatmap: buildHeatmapModel({
      events: heatmapEventGroups.flat(),
      markers: dashboardData.recentActivity.map((activity) => ({
        appName: activity.appName,
        label: `${activity.appName} ${activity.operationType}`,
        operationType: activity.operationType,
        status: activity.status,
        timestamp: activity.createdAt,
      })),
      timestamps: history.map((point) => point.timestamp),
    }),
    history,
    snapshot,
    stats: dashboardData.stats,
  };
}