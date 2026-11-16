const DEFAULT_HTTPS_PORT = 443;

/**
 * Public HTTPS port for links that leave the dashboard.
 *
 * The macOS `--lan` install publishes Traefik on an unprivileged host port
 * (Docker Desktop on macOS resets non-loopback clients on ports below 1024),
 * so generated URLs have to carry that port. Empty means the standard 443 and
 * keeps URLs clean. The NEXT_PUBLIC_ prefix lets client components read the
 * same value, which Next inlines at build time.
 */
export function publicHttpsPort(): string {
  const raw = (process.env.NEXT_PUBLIC_VERCELAB_PUBLIC_HTTPS_PORT ?? '').trim();

  if (!/^\d{1,5}$/.test(raw)) {
    return '';
  }

  const port = Number(raw);

  if (port < 1 || port > 65535 || port === DEFAULT_HTTPS_PORT) {
    return '';
  }

  return String(port);
}

/** Builds an `https://` URL for a host, adding the public port when one is set. */
export function publicHttpsUrl(host: string): string {
  const normalizedHost = host
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  const port = publicHttpsPort();

  return port ? `https://${normalizedHost}:${port}` : `https://${normalizedHost}`;
}
