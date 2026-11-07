import type { NextRequest } from 'next/server';

import { jsonDevError } from '@/lib/dev-api';
import { readDevDeploymentBuildLog, readDevDeploymentContainerLog } from '@/lib/dev-engine';

export const dynamic = 'force-dynamic';

type DevDeploymentLogContext = {
  params: Promise<{
    deploymentId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: DevDeploymentLogContext) {
  const { deploymentId } = await params;

  try {
    const type = request.nextUrl.searchParams.get('type') === 'container' ? 'container' : 'build';
    const tail = Number.parseInt(request.nextUrl.searchParams.get('tail') ?? '', 10);
    const payload =
      type === 'container'
        ? await readDevDeploymentContainerLog(deploymentId, Number.isFinite(tail) ? tail : 200)
        : await readDevDeploymentBuildLog(deploymentId);

    return Response.json(payload, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonDevError(error, 'Unable to load preview logs.');
  }
}
