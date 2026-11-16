import { describe, expect, it } from 'vitest';

import {
  getOfficialWorkloadLogoTitle,
  matchOfficialWorkloadLogo,
  normalizeImageReference,
} from '@/lib/workload-logo';

describe('normalizeImageReference', () => {
  it('strips registries, namespaces, tags, and digests', () => {
    expect(normalizeImageReference('postgres:16-alpine')).toBe('postgres');
    expect(normalizeImageReference('influxdata/influxdb3-ui:1.9.0')).toBe('influxdb3-ui');
    expect(normalizeImageReference('ghcr.io/acme/app@sha256:abc123')).toBe('app');
    expect(normalizeImageReference('traefik:v3.7.12')).toBe('traefik');
  });

  it('keeps the repository name when the reference has no tag', () => {
    expect(normalizeImageReference('fnsys/dockhand')).toBe('dockhand');
    expect(normalizeImageReference('  Alpine  ')).toBe('alpine');
  });
});

describe('matchOfficialWorkloadLogo', () => {
  it('matches official images to their bundled brand marks', () => {
    expect(matchOfficialWorkloadLogo(['postgres:16-alpine'])).toBe('postgresql');
    expect(matchOfficialWorkloadLogo(['influxdata/influxdb3-ui:1.9.0'])).toBe('influxdb');
    expect(matchOfficialWorkloadLogo(['traefik:v3.7.12'])).toBe('traefikproxy');
    expect(matchOfficialWorkloadLogo(['alpine:3.24.1'])).toBe('alpinelinux');
    expect(matchOfficialWorkloadLogo(['redis:7'])).toBe('redis');
  });

  it('matches namespaced and suffixed image variants on word boundaries', () => {
    expect(matchOfficialWorkloadLogo(['bitnami/postgresql'])).toBe('postgresql');
    expect(matchOfficialWorkloadLogo(['library/redis-stack-server'])).toBe('redis');
    expect(matchOfficialWorkloadLogo(['prom/node-exporter'])).toBe('prometheus');
  });

  it('falls back to image titles and container names', () => {
    expect(matchOfficialWorkloadLogo([null, 'PostgreSQL'])).toBe('postgresql');
    expect(matchOfficialWorkloadLogo([undefined, '', 'vercelab-nginx-1'])).toBe('nginx');
  });

  it('does not guess a brand for custom workloads', () => {
    expect(matchOfficialWorkloadLogo(['vercelab-dev-bladevault:76ed005'])).toBeNull();
    expect(matchOfficialWorkloadLogo(['fnsys/dockhand:latest'])).toBeNull();
    expect(matchOfficialWorkloadLogo(['nextcloud:apache'])).toBeNull();
  });

  it('exposes human readable titles for the matched slug', () => {
    expect(getOfficialWorkloadLogoTitle('postgresql')).toBe('PostgreSQL');
  });
});
