import { resolveWorkloadLogo } from '@/lib/workload-logo-resolver';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ containerId: string }> }
) {
  const { containerId } = await params;
  const logo = await resolveWorkloadLogo(containerId);

  if (!logo) {
    return new Response(null, { status: 404 });
  }

  return new Response(logo.body, {
    headers: {
      'Cache-Control': 'private, max-age=600',
      'Content-Length': String(logo.body.byteLength),
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'Content-Type': logo.contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Vercelab-Logo-Source': logo.source,
    },
  });
}
