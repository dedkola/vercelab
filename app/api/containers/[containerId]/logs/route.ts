import type { NextRequest } from "next/server";

import { readContainerRuntimeLog } from "@/lib/container-runtime";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to load container logs.";
}

function getTail(request: NextRequest) {
  const value = Number.parseInt(
    request.nextUrl.searchParams.get("tail") ?? "150",
    10,
  );

  if (!Number.isFinite(value)) {
    return 150;
  }

  return Math.max(1, Math.min(value, 500));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ containerId: string }> },
) {
  const { containerId } = await params;

  try {
    const payload = await readContainerRuntimeLog(containerId, {
      tail: getTail(request),
      timestamps: true,
    });

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