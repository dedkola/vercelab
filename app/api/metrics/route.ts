import { getMetricsSnapshot } from "@/lib/system-metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getMetricsSnapshot());
}
