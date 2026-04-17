import { getDashboardAnalytics } from "@/lib/dashboard-analytics";
import { normalizeDashboardRange } from "@/lib/metrics-range";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to load dashboard analytics.";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = normalizeDashboardRange(url.searchParams.get("range"));

  try {
    return Response.json(await getDashboardAnalytics(range));
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
      },
      {
        status: 500,
      },
    );
  }
}