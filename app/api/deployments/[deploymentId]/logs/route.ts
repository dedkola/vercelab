import type { NextRequest } from "next/server";

import {
  readDeploymentBuildLog,
  readDeploymentContainerLog,
} from "@/lib/deployment-engine";

export const dynamic = "force-dynamic";

function getLogType(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("type");

  return value === "container" ? "container" : "build";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to load deployment logs.";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  const { deploymentId } = await params;

  try {
    const logType = getLogType(request);
    const payload =
      logType === "container"
        ? await readDeploymentContainerLog(deploymentId)
        : await readDeploymentBuildLog(deploymentId);

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
