import { jsonDevError } from '@/lib/dev-api';
import { createDevProject } from '@/lib/dev-projects';
import { listDevProjects } from '@/lib/dev-persistence';
import { createDevProjectSchema } from '@/lib/dev-validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({
      projects: await listDevProjects(),
    });
  } catch (error) {
    return jsonDevError(error, 'Unable to load Dev projects.', 500);
  }
}

export async function POST(request: Request) {
  try {
    const input = createDevProjectSchema.parse(await request.json());
    const result = await createDevProject(input);

    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonDevError(error, 'Unable to create Dev project.');
  }
}
