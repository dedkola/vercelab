export function toContainerSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function buildDefaultHostedDomain(
  subdomain: string,
  baseDomain: string,
) {
  return `${subdomain}.${baseDomain}`;
}

export function buildTraefikRouterName(value: string) {
  return toContainerSlug(value) || "container-route";
}

export function buildTraefikLabels({
  entrypoint,
  host,
  network,
  port,
  routerName,
}: {
  entrypoint: string;
  host: string;
  network: string;
  port: number;
  routerName: string;
}) {
  return {
    "traefik.enable": "true",
    "traefik.docker.network": network,
    [`traefik.http.routers.${routerName}.rule`]: `Host(\`${host}\`)`,
    [`traefik.http.routers.${routerName}.entrypoints`]: entrypoint,
    [`traefik.http.routers.${routerName}.tls`]: "true",
    [`traefik.http.services.${routerName}.loadbalancer.server.port`]: String(
      port,
    ),
  } satisfies Record<string, string>;
}

export function extractTraefikHostFromLabels(labels: ReadonlyMap<string, string>) {
  for (const [key, value] of labels.entries()) {
    if (
      !key.startsWith("traefik.http.routers.") ||
      !key.endsWith(".rule")
    ) {
      continue;
    }

    const hostMatch =
      /Host\(`([^`]+)`\)/.exec(value) ??
      /Host\('([^']+)'\)/.exec(value) ??
      /Host\("([^"]+)"\)/.exec(value);

    if (hostMatch?.[1]) {
      return hostMatch[1].trim();
    }
  }

  return null;
}