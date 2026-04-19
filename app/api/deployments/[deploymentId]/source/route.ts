import type { NextRequest } from "next/server";

import { readDeploymentSourceState } from "@/lib/deployment-engine";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to load deployment source details.";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> },
) {
  const { deploymentId } = await params;

  try {
    const payload = await readDeploymentSourceState({
      branch: request.nextUrl.searchParams.get("branch"),
      deploymentId,
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
