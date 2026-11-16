import { afterEach, describe, expect, it } from 'vitest';

import { publicHttpsPort, publicHttpsUrl } from '@/lib/public-url';

const ENV_KEY = 'NEXT_PUBLIC_VERCELAB_PUBLIC_HTTPS_PORT';

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe('publicHttpsUrl', () => {
  it('omits the port when none is configured', () => {
    expect(publicHttpsUrl('dash.localhost')).toBe('https://dash.localhost');
    expect(publicHttpsPort()).toBe('');
  });

  it('appends the configured public port', () => {
    process.env[ENV_KEY] = '8443';

    expect(publicHttpsUrl('demo.192-168-0-155.sslip.io')).toBe(
      'https://demo.192-168-0-155.sslip.io:8443',
    );
  });

  it('treats the default HTTPS port as no port', () => {
    process.env[ENV_KEY] = '443';

    expect(publicHttpsUrl('influx.localhost')).toBe('https://influx.localhost');
  });

  it('ignores invalid values', () => {
    process.env[ENV_KEY] = 'not-a-port';

    expect(publicHttpsPort()).toBe('');
    expect(publicHttpsUrl('dash.localhost')).toBe('https://dash.localhost');
  });

  it('does not duplicate a port that is already part of the host', () => {
    process.env[ENV_KEY] = '8443';

    expect(publicHttpsUrl('http://demo.localhost:8443/path')).toBe(
      'https://demo.localhost:8443',
    );
  });
});
