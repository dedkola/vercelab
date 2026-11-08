import { jsonDevError } from '@/lib/dev-api';
import { listDevProjectCommits } from '@/lib/dev-projects';

export const dynamic = 'force-dynamic';

type DevProjectCommitsContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(_request: Request, { params }: DevProjectCommitsContext) {
  const { projectId } = await params;

  try {
    return Response.json(await listDevProjectCommits(projectId));
  } catch (error) {
    return jsonDevError(error, 'Unable to load repository commits.');
  }
}
