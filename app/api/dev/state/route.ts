import { jsonDevError } from '@/lib/dev-api';
import { loadDevState } from '@/lib/dev-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await loadDevState(), {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonDevError(error, 'Unable to load Dev state.', 500);
  }
}
