import { jsonDevError } from '@/lib/dev-api';
import { getDevProjectById } from '@/lib/dev-persistence';
import { syncDevProject } from '@/lib/dev-projects';

export const dynamic = 'force-dynamic';

type DevProjectSyncContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(_request: Request, { params }: DevProjectSyncContext) {
  const { projectId } = await params;

  try {
    const project = await getDevProjectById(projectId);
    const result = await syncDevProject(project);

    return Response.json(result);
  } catch (error) {
    return jsonDevError(error, 'Unable to sync previews from GitHub.');
  }
}
