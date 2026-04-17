import { getMetricsSnapshot } from "@/lib/system-metrics";
import {
  type ContainerMetricsHistoryPoint,
  getContainerMetricsHistoryFromInflux,
  getMetricsHistoryFromInflux,
} from "@/lib/influx-metrics";
import {
  getDashboardRangeSeconds,
  normalizeDashboardRange,
} from "@/lib/metrics-range";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const containerId = url.searchParams.get("containerId")?.trim() ?? "";
  const containerName = url.searchParams.get("containerName")?.trim() ?? "";

  const maxPoints = 240;
  const currentModeLimit = 48;
  const currentModeBucketSeconds = 5;

  const range = normalizeDashboardRange(url.searchParams.get("range"));
  const rangeSeconds = getDashboardRangeSeconds(range);
  const rangeBucketSeconds = Math.max(
    5,
    Math.ceil(rangeSeconds / maxPoints / 5) * 5,
  );
  const rangeLimit = Math.max(
    12,
    Math.min(maxPoints, Math.ceil(rangeSeconds / rangeBucketSeconds)),
  );

  const limit = mode === "current" ? currentModeLimit : rangeLimit;
  const bucketSeconds =
    mode === "current" ? currentModeBucketSeconds : rangeBucketSeconds;

  const snapshot = await getMetricsSnapshot();
  const [history, containerHistory] = await Promise.all([
    getMetricsHistoryFromInflux({
      hostIp: snapshot.hostIp,
      limit,
      bucketSeconds,
    }).catch((error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to read metrics history from InfluxDB.";

      console.error(`[metrics] ${message}`);
      return [];
    }),
    containerId || containerName
      ? getContainerMetricsHistoryFromInflux({
          hostIp: snapshot.hostIp,
          containerId: containerId || undefined,
          containerName: containerName || undefined,
          limit,
          bucketSeconds,
        }).catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to read container history from InfluxDB.";

          console.error(`[metrics] ${message}`);
          return [];
        })
      : Promise.resolve([] as ContainerMetricsHistoryPoint[]),
  ]);

  return Response.json({
    snapshot,
    history,
    containerHistory,
  });
}
