import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAppConfigMock, poolConnectMock, poolQueryMock } = vi.hoisted(() => ({
  getAppConfigMock: vi.fn(),
  poolConnectMock: vi.fn(),
  poolQueryMock: vi.fn(),
}));

vi.mock('@/lib/app-config', () => ({
  getAppConfig: getAppConfigMock,
}));

vi.mock('pg', () => ({
  Pool: class {
    connect = poolConnectMock;
    query = poolQueryMock;
    on = vi.fn();
  },
}));

function createClient() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
}

describe('getDatabaseHealth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    getAppConfigMock.mockReturnValue({
      database: {
        provider: 'postgres',
        postgresUrl: 'postgres://vercelab:secret@db:5432/vercelab',
      },
    });
  });

  it('retries the schema bootstrap after a failed first connection', async () => {
    poolConnectMock.mockRejectedValueOnce(
      new Error('password authentication failed for user "vercelab"')
    );
    poolConnectMock.mockResolvedValue(createClient());
    poolQueryMock.mockResolvedValue({ rows: [{ version: 'PostgreSQL 16.15' }] });

    const { getDatabaseHealth } = await import('@/lib/persistence');

    await expect(getDatabaseHealth()).rejects.toThrow('password authentication failed');
    await expect(getDatabaseHealth()).resolves.toMatchObject({ version: 'PostgreSQL 16.15' });
    expect(poolConnectMock).toHaveBeenCalledTimes(2);
  });

  it('bootstraps the schema only once across successful calls', async () => {
    poolConnectMock.mockResolvedValue(createClient());
    poolQueryMock.mockResolvedValue({ rows: [{ version: 'PostgreSQL 16.15' }] });

    const { getDatabaseHealth } = await import('@/lib/persistence');

    await getDatabaseHealth();
    await getDatabaseHealth();

    expect(poolConnectMock).toHaveBeenCalledTimes(1);
  });
});
