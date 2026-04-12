import { getAppConfig } from "@/lib/app-config";
import { getDatabaseHealth } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getAppConfig();
  const database = getDatabaseHealth();

  return Response.json({
    ok: true,
    database,
    baseDomain: config.baseDomain,
    proxyNetwork: config.proxy.network,
    provider: config.database.provider,
  });
}
