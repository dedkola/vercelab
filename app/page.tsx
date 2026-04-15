import MetricsDashboard from "@/components/metrics-dashboard";
import { getAppConfig } from "@/lib/app-config";
import { listDashboardData } from "@/lib/persistence";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    message?: string | string[];
    section?: string | string[];
    status?: string | string[];
  }>;
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const dashboardData = await listDashboardData();
  const activeSection =
    getSearchParamValue(params.section) === "git" ? "git" : "overview";
  const status = getSearchParamValue(params.status);
  const message = getSearchParamValue(params.message);

  return (
    <MetricsDashboard
      baseDomain={getAppConfig().baseDomain}
      dashboardData={dashboardData}
      flashMessage={
        status === "success" || status === "error"
          ? {
              status,
              message: message ?? "",
            }
          : null
      }
      initialSection={activeSection}
    />
  );
}
