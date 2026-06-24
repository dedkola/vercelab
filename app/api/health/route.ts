import { getAppConfig } from "@/lib/app-config";
import { getPlatformHealth } from "@/lib/platform-health";
import { getDatabaseHealth } from "@/lib/persistence";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getAppConfig();
  const database = await getDatabaseHealth();
  const platform = await getPlatformHealth();

  return Response.json(
    {
      ok: platform.ok,
      database,
      baseDomain: config.baseDomain,
      proxyNetwork: config.proxy.network,
      provider: config.database.provider,
      platform,
    },
    {
      status: platform.ok ? 200 : 503,
    },
  );
}
