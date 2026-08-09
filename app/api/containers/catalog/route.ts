import type { NextRequest } from 'next/server';

import { searchContainerCatalog } from '@/lib/container-create';

const CACHE_CONTROL_HEADER = 'public, max-age=300, stale-while-revalidate=300';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to search container catalog.';
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query') ?? '';

  try {
    const results = await searchContainerCatalog(query);
    return Response.json({ results }, { headers: { 'Cache-Control': CACHE_CONTROL_HEADER } });
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
      },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
