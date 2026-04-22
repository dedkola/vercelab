import { getMetricsSnapshot } from "@/lib/system-metrics";
import {
  type ContainerAction,
  isSystemContainer,
  runContainerAction,
} from "@/lib/container-runtime";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to run container action.";
}

function isContainerAction(value: unknown): value is ContainerAction {
  return ["remove", "restart", "start", "stop"].includes(String(value));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ containerId: string }> },
) {
  const { containerId } = await params;

  try {
    const body = (await request.json()) as {
      action?: unknown;
    };

    if (!isContainerAction(body.action)) {
      throw new Error("Unsupported container action.");
    }

    const snapshot = await getMetricsSnapshot();
    const runtime =
      snapshot.containers.all.find((container) => container.id === containerId) ??
      null;

    if (!runtime) {
      throw new Error("Container is not present in the current runtime snapshot.");
    }

    if (isSystemContainer(runtime) && body.action !== "restart") {
      throw new Error(
        "Protected system containers only allow restart from this page.",
      );
    }

    const payload = await runContainerAction(containerId, body.action);
    return Response.json(payload);
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
      },
      {
        status: 400,
      },
    );
  }
}