import { getMetricsSnapshot } from "@/lib/system-metrics";
import { getMetricsHistoryFromInflux } from "@/lib/influx-metrics";

export const dynamic = "force-dynamic";

const RANGE_TO_SECONDS = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
  "90d": 90 * 24 * 60 * 60,
} as const;

type MetricsRange = keyof typeof RANGE_TO_SECONDS;

function normalizeRange(value: string | null): MetricsRange {
  if (!value) {
    return "15m";
  }

  return value in RANGE_TO_SECONDS ? (value as MetricsRange) : "15m";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = normalizeRange(url.searchParams.get("range"));
  const rangeSeconds = RANGE_TO_SECONDS[range];
  const maxPoints = 240;
  const bucketSeconds = Math.max(
    5,
    Math.ceil(rangeSeconds / maxPoints / 5) * 5,
  );
  const limit = Math.max(
    12,
    Math.min(maxPoints, Math.ceil(rangeSeconds / bucketSeconds)),
  );

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
