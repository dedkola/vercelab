import {
  OFFICIAL_WORKLOAD_LOGOS,
  type OfficialWorkloadLogoSlug,
} from '@/lib/official-workload-logos';

const OFFICIAL_LOGO_ALIASES: Record<OfficialWorkloadLogoSlug, readonly string[]> = {
  alpinelinux: ['alpine'],
  apachekafka: ['kafka', 'apachekafka'],
  caddy: ['caddy'],
  clickhouse: ['clickhouse'],
  cockroachlabs: ['cockroach', 'cockroachdb', 'cockroachlabs'],
  docker: ['docker', 'docker-in-docker'],
  elasticsearch: ['elastic', 'elasticsearch'],
  github: ['github'],
  grafana: ['grafana'],
  influxdb: ['influxdb', 'influxdb3', 'influxdb3-core', 'influxdb3-explorer', 'influxdb-explorer'],
  keycloak: ['keycloak'],
  mariadb: ['mariadb'],
  minio: ['minio'],
  mongodb: ['mongo', 'mongodb'],
  mysql: ['mysql', 'percona', 'percona-server'],
  nextdotjs: ['next', 'nextjs'],
  nginx: ['nginx'],
  nodedotjs: ['node', 'nodejs'],
  opensearch: ['opensearch'],
  portainer: ['portainer'],
  postgresql: ['pgbouncer', 'pgvector', 'postgis', 'postgres', 'postgresql', 'timescaledb'],
  prometheus: ['node-exporter', 'prometheus', 'prometheus-node-exporter'],
  rabbitmq: ['rabbitmq'],
  redis: ['redis', 'redis-stack', 'valkey'],
  traefikproxy: ['traefik'],
};

type AliasEntry = {
  alias: string;
  slug: OfficialWorkloadLogoSlug;
};

const ALIAS_INDEX: readonly AliasEntry[] = Object.entries(OFFICIAL_LOGO_ALIASES)
  .flatMap(([slug, aliases]) =>
    aliases.map((alias) => ({ alias, slug: slug as OfficialWorkloadLogoSlug }))
  )
  .sort(
    (left, right) => right.alias.length - left.alias.length || left.alias.localeCompare(right.alias)
  );

const NAME_SEPARATOR_PATTERN = /[^a-z0-9]/;

export function normalizeImageReference(reference: string): string {
  const value = (reference.trim().toLowerCase().split('@')[0] ?? '').trim();
  const lastSlashIndex = value.lastIndexOf('/');
  const lastColonIndex = value.lastIndexOf(':');
  const withoutTag = lastColonIndex > lastSlashIndex ? value.slice(0, lastColonIndex) : value;
  const segments = withoutTag.split('/').filter(Boolean);

  return segments.at(-1) ?? '';
}

function matchesAlias(name: string, alias: string) {
  let index = name.indexOf(alias);

  while (index !== -1) {
    const before = name[index - 1];
    const after = name[index + alias.length];
    const startsOnBoundary = before === undefined || NAME_SEPARATOR_PATTERN.test(before);
    const endsOnBoundary = after === undefined || NAME_SEPARATOR_PATTERN.test(after);

    if (startsOnBoundary && endsOnBoundary) {
      return true;
    }

    index = name.indexOf(alias, index + 1);
  }

  return false;
}

function matchName(name: string): OfficialWorkloadLogoSlug | null {
  for (const entry of ALIAS_INDEX) {
    if (matchesAlias(name, entry.alias)) {
      return entry.slug;
    }
  }

  return null;
}

export function matchOfficialWorkloadLogo(
  candidates: ReadonlyArray<string | null | undefined>
): OfficialWorkloadLogoSlug | null {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeImageReference(candidate);
    const match = normalized ? matchName(normalized) : null;

    if (match) {
      return match;
    }
  }

  return null;
}

export function getOfficialWorkloadLogoTitle(slug: OfficialWorkloadLogoSlug) {
  return OFFICIAL_WORKLOAD_LOGOS[slug].title;
}
