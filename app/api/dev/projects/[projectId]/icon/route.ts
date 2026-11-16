import { resolveDevProjectIcon } from '@/lib/workload-logo-resolver';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const icon = await resolveDevProjectIcon(projectId);

    if (!icon) {
      return new Response(null, { status: 404 });
    }

    return new Response(icon.body, {
      headers: {
        'Cache-Control': 'private, max-age=600',
        'Content-Length': String(icon.body.byteLength),
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Content-Type': icon.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
