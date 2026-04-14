import { getMetricsSnapshot } from "@/lib/system-metrics";
import { getMetricsHistoryFromInflux } from "@/lib/influx-metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getMetricsSnapshot();
  const history = await getMetricsHistoryFromInflux({
    hostIp: snapshot.hostIp,
    limit: 48,
    bucketSeconds: 5,
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
