import { getMetricsSnapshot } from "@/lib/system-metrics";
import { isSystemContainer } from "@/lib/container-inventory";
import { recreateContainer, type RecreateChanges } from "@/lib/container-recreate";
import type { ExposureMode } from "@/lib/validation";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to recreate container.";
}

function isExposureMode(value: unknown): value is ExposureMode {
  return ["http", "tcp", "host", "internal"].includes(String(value));
}

export async function POST(
  request: Request,
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

    if (isSystemContainer(runtime)) {
      return Response.json(
        { error: "System containers cannot be recreated from this page." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      envVars?: unknown;
      exposureMode?: unknown;
      image?: unknown;
      name?: unknown;
      port?: unknown;
    };

    const changes: RecreateChanges = {
      envVars: Array.isArray(body.envVars)
        ? (body.envVars as Array<{ key: string; value: string }>)
        : undefined,
      exposureMode: isExposureMode(body.exposureMode)
        ? body.exposureMode
        : undefined,
      image: typeof body.image === "string" ? body.image : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      port:
        typeof body.port === "number" && body.port > 0
          ? body.port
          : undefined,
    };

    const result = await recreateContainer(containerId, changes);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 400 },
    );
  }
}
