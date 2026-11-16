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

describe('tryAcquireAdvisoryLock', () => {
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

  function mockPoolLock(locked: boolean) {
    const acquiredClients: ReturnType<typeof createClient>[] = [];

    poolConnectMock.mockImplementation(async () => {
      const client = createClient();
      client.query.mockImplementation(async (statement: string) =>
        statement.includes('pg_try_advisory_lock') ? { rows: [{ locked }] } : { rows: [] }
      );
      acquiredClients.push(client);
      return client;
    });

    return () => acquiredClients[acquiredClients.length - 1]!;
  }

  it('returns null and hands the connection back when the lock is already held', async () => {
    const getLastClient = mockPoolLock(false);
    const { tryAcquireAdvisoryLock } = await import('@/lib/persistence');

    await expect(tryAcquireAdvisoryLock(4242)).resolves.toBeNull();

    const client = getLastClient();
    expect(client.query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      [4242]
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('unlocks and returns the connection to the pool on release', async () => {
    const getLastClient = mockPoolLock(true);
    const { tryAcquireAdvisoryLock } = await import('@/lib/persistence');

    const lock = await tryAcquireAdvisoryLock(4242);
    const client = getLastClient();

    expect(lock).not.toBeNull();
    expect(client.release).not.toHaveBeenCalled();

    await lock?.release();

    expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1::bigint)', [4242]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
