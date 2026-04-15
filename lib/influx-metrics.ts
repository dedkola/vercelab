import { getAppConfig } from "@/lib/app-config";

export type MetricsHistoryPoint = {
  timestamp: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  networkTotal: number;
  containersCpu: number;
  containersMemory: number;
};

type InfluxV1Series = {
  columns?: string[];
  values?: Array<Array<string | number | null>>;
};

type InfluxV1Result = {
  series?: InfluxV1Series[];
  error?: string;
};

type InfluxV1Response = {
  results?: InfluxV1Result[];
  error?: string;
};

type QueryOptions = {
  hostIp: string;
  windowMinutes: number;
  bucketSeconds: number;
};

type PartialPoint = {
  timestamp: string;
  cpu?: number;
  memory?: number;
  networkIn?: number;
  networkOut?: number;
  containersCpu?: number;
  containersMemory?: number;
};

function escapeInfluxString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function asFiniteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function runInfluxV1Query(query: string) {
  const config = getAppConfig();

  if (!config.metrics.influxUrl || !config.metrics.influxDatabase) {
    return [] as InfluxV1Series[];
  }

  const queryUrl = new URL("/query", config.metrics.influxUrl);
  queryUrl.searchParams.set("db", config.metrics.influxDatabase);
  queryUrl.searchParams.set("epoch", "ms");
  queryUrl.searchParams.set("q", query);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (config.metrics.influxToken) {
    headers.Authorization = `Bearer ${config.metrics.influxToken}`;
  }

  const response = await fetch(queryUrl, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`InfluxDB query failed with ${response.status}.`);
  }

  const payload = (await response.json()) as InfluxV1Response;

  if (payload.error) {
    throw new Error(`InfluxDB query error: ${payload.error}`);
  }

  const result = payload.results?.[0];

  if (result?.error) {
    throw new Error(`InfluxDB query error: ${result.error}`);
  }

  return result?.series ?? [];
}

function parseSeries(
  series: InfluxV1Series | undefined,
  mapper: (point: PartialPoint, rowByColumn: Record<string, unknown>) => void,
) {
  if (!series?.columns || !series.values) {
    return [] as PartialPoint[];
  }

  return series.values
    .map((row) => {
      const rowByColumn = series.columns!.reduce<Record<string, unknown>>(
        (accumulator, column, index) => {
          accumulator[column] = row[index];
          return accumulator;
        },
        {},
      );

      const epochMs = asFiniteNumber(rowByColumn.time);

      if (!epochMs) {
        return null;
      }

      const point: PartialPoint = {
        timestamp: new Date(epochMs).toISOString(),
      };

      mapper(point, rowByColumn);
      return point;
    })
    .filter((entry): entry is PartialPoint => Boolean(entry));
}

function buildHostQuery({
  hostIp,
  windowMinutes,
  bucketSeconds,
}: QueryOptions) {
  const hostFilter =
    hostIp && hostIp !== "unknown"
      ? ` AND host='${escapeInfluxString(hostIp)}'`
      : "";

  return `SELECT mean(cpu_percent) AS cpu_percent, mean(memory_percent) AS memory_percent, mean(network_rx_bps) AS network_in, mean(network_tx_bps) AS network_out FROM host_metrics WHERE time > now() - ${windowMinutes}m${hostFilter} GROUP BY time(${bucketSeconds}s) fill(none)`;
}

function buildContainerQuery({
  hostIp,
  windowMinutes,
  bucketSeconds,
}: QueryOptions) {
  const hostFilter =
    hostIp && hostIp !== "unknown"
      ? ` AND host='${escapeInfluxString(hostIp)}'`
      : "";

  return `SELECT mean(cpu_percent) AS containers_cpu, mean(memory_percent) AS containers_memory FROM container_metrics WHERE scope='aggregate' AND time > now() - ${windowMinutes}m${hostFilter} GROUP BY time(${bucketSeconds}s) fill(none)`;
}

export async function getMetricsHistoryFromInflux(options?: {
  hostIp?: string;
  limit?: number;
  bucketSeconds?: number;
}) {
  const limit = Math.max(1, Math.min(options?.limit ?? 48, 240));
  const bucketSeconds = Math.max(
    1,
    Math.min(options?.bucketSeconds ?? 5, 86_400),
  );
  const hostIp = options?.hostIp ?? "unknown";
  const windowMinutes = Math.max(1, Math.ceil((limit * bucketSeconds) / 60));

  const [hostSeries, containerSeries] = await Promise.all([
    runInfluxV1Query(buildHostQuery({ hostIp, windowMinutes, bucketSeconds })),
    runInfluxV1Query(
      buildContainerQuery({ hostIp, windowMinutes, bucketSeconds }),
    ),
  ]);

  const merged = new Map<string, PartialPoint>();

  for (const point of parseSeries(hostSeries[0], (entry, row) => {
    entry.cpu = asFiniteNumber(row.cpu_percent) ?? 0;
    entry.memory = asFiniteNumber(row.memory_percent) ?? 0;
    entry.networkIn = asFiniteNumber(row.network_in) ?? 0;
    entry.networkOut = asFiniteNumber(row.network_out) ?? 0;
  })) {
    merged.set(point.timestamp, {
      ...merged.get(point.timestamp),
      ...point,
    });
  }

  for (const point of parseSeries(containerSeries[0], (entry, row) => {
    entry.containersCpu = asFiniteNumber(row.containers_cpu) ?? 0;
    entry.containersMemory = asFiniteNumber(row.containers_memory) ?? 0;
  })) {
    merged.set(point.timestamp, {
      ...merged.get(point.timestamp),
      ...point,
    });
  }

  return Array.from(merged.values())
    .filter((entry): entry is PartialPoint & { timestamp: string } =>
      Boolean(entry.timestamp),
    )
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-limit)
    .map((entry) => {
      const networkIn = entry.networkIn ?? 0;
      const networkOut = entry.networkOut ?? 0;

      return {
        timestamp: entry.timestamp,
        cpu: entry.cpu ?? 0,
        memory: entry.memory ?? 0,
        networkIn,
        networkOut,
        networkTotal: networkIn + networkOut,
        containersCpu: entry.containersCpu ?? 0,
        containersMemory: entry.containersMemory ?? 0,
      } satisfies MetricsHistoryPoint;
    });
}
