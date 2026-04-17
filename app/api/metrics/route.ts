import { getMetricsSnapshot } from "@/lib/system-metrics";
import { getMetricsHistoryFromInflux } from "@/lib/influx-metrics";
import {
  getDashboardRangeSeconds,
  normalizeDashboardRange,
} from "@/lib/metrics-range";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");

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
  const history = await getMetricsHistoryFromInflux({
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
  });

  return Response.json({
    snapshot,
    history,
  });
}
