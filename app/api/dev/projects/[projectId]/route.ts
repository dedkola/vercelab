import { jsonDevError } from '@/lib/dev-api';
import { deleteDevProjectById } from '@/lib/dev-engine';
import { getDevProjectDetail, updateDevProject } from '@/lib/dev-projects';
import { updateDevProjectSchema } from '@/lib/dev-validation';

export const dynamic = 'force-dynamic';

type DevProjectRouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(_request: Request, { params }: DevProjectRouteContext) {
  const { projectId } = await params;

  try {
    return Response.json(await getDevProjectDetail(projectId));
  } catch (error) {
    return jsonDevError(error, 'Unable to load Dev project.', 404);
  }
}

export async function PATCH(request: Request, { params }: DevProjectRouteContext) {
  const { projectId } = await params;

  try {
    const input = updateDevProjectSchema.parse(await request.json());
    const project = await updateDevProject(projectId, input);

    return Response.json(project);
  } catch (error) {
    return jsonDevError(error, 'Unable to update Dev project.');
  }
}

export async function DELETE(_request: Request, { params }: DevProjectRouteContext) {
  const { projectId } = await params;

  try {
    return Response.json(await deleteDevProjectById(projectId));
  } catch (error) {
    return jsonDevError(error, 'Unable to delete Dev project.');
  }
}
