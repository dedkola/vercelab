import { jsonDevError } from '@/lib/dev-api';
import {
  deleteDevDeploymentById,
  restartDevDeploymentById,
  retryDevDeploymentById,
  startDevDeploymentById,
  stopDevDeploymentById,
} from '@/lib/dev-engine';
import { devDeploymentActionSchema } from '@/lib/dev-validation';

export const dynamic = 'force-dynamic';

type DevDeploymentActionContext = {
  params: Promise<{
    deploymentId: string;
  }>;
};

export async function POST(request: Request, { params }: DevDeploymentActionContext) {
  const { deploymentId } = await params;

  try {
    const { action } = devDeploymentActionSchema.parse(await request.json());

    switch (action) {
      case 'start':
        return Response.json({
          action,
          deployment: await startDevDeploymentById(deploymentId),
        });
      case 'stop':
        return Response.json({
          action,
          deployment: await stopDevDeploymentById(deploymentId),
        });
      case 'restart':
        return Response.json({
          action,
          deployment: await restartDevDeploymentById(deploymentId),
        });
      case 'retry':
        return Response.json({
          action,
          deployment: await retryDevDeploymentById(deploymentId),
        });
      case 'delete':
        return Response.json(await deleteDevDeploymentById(deploymentId));
    }
  } catch (error) {
    return jsonDevError(error, 'Unable to run preview action.');
  }
}
