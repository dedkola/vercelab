import { jsonDevError } from '@/lib/dev-api';
import { deployDevProjectCommit } from '@/lib/dev-projects';
import { deployDevCommitSchema } from '@/lib/dev-validation';

export const dynamic = 'force-dynamic';

type DevProjectDeployContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: Request, { params }: DevProjectDeployContext) {
  const { projectId } = await params;

  try {
    const input = deployDevCommitSchema.parse(await request.json().catch(() => ({})));
    const result = await deployDevProjectCommit(projectId, input.commitSha);

    return Response.json(result, { status: result.created ? 202 : 200 });
  } catch (error) {
    return jsonDevError(error, 'Unable to deploy preview.');
  }
}
