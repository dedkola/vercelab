import { getMetricsSnapshot } from "@/lib/system-metrics";
import { inspectContainer } from "@/lib/container-inspect";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to inspect container.";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ containerId: string }> },
) {
  const { containerId } = await params;

  try {
    const snapshot = await getMetricsSnapshot();
    const runtime =
      snapshot.containers.all.find((c) => c.id === containerId) ?? null;

    if (!runtime) {
      return Response.json(
        { error: "Container is not present in the current runtime snapshot." },
        { status: 404 },
      );
    }

    const data = await inspectContainer(containerId);
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
