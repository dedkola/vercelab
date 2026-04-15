import { mkdirSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  VERCELAB_DATABASE_PROVIDER: z.enum(["postgres"]).default("postgres"),
  VERCELAB_POSTGRES_URL: z.string().trim().min(1),
  VERCELAB_POSTGRES_USER: z.string().trim().min(1).default("vercelab"),
  VERCELAB_POSTGRES_PASSWORD: z.string().trim().min(1).default("vercelab"),
  VERCELAB_POSTGRES_DB: z.string().trim().min(1).default("vercelab"),
  VERCELAB_INFLUXDB_URL: z
    .string()
    .trim()
    .min(1)
    .default("http://influxdb:8181"),
  VERCELAB_INFLUXDB_DATABASE: z
    .string()
    .trim()
    .min(1)
    .default("vercelab_metrics"),
  VERCELAB_INFLUXDB_TOKEN: z.string().trim().optional(),
  VERCELAB_INFLUXDB_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(90),
  VERCELAB_HOST_ROOT: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || path.isAbsolute(value), {
      message: "VERCELAB_HOST_ROOT must be an absolute path.",
    }),
  VERCELAB_APPS_DIR: z.string().optional(),
  VERCELAB_LOGS_DIR: z.string().optional(),
  VERCELAB_LOCKS_DIR: z.string().optional(),
  VERCELAB_DOCKER_SOCKET_PATH: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || path.isAbsolute(value), {
      message: "VERCELAB_DOCKER_SOCKET_PATH must be an absolute path.",
    }),
  VERCELAB_HOST_PROC_PATH: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || path.isAbsolute(value), {
      message: "VERCELAB_HOST_PROC_PATH must be an absolute path.",
    }),
  VERCELAB_BASE_DOMAIN: z.string().trim().min(3).default("myhomelan.com"),
  VERCELAB_PROXY_NETWORK: z.string().trim().min(3).default("vercelab_proxy"),
  VERCELAB_PROXY_ENTRYPOINT: z.string().trim().min(2).default("websecure"),
  VERCELAB_ENCRYPTION_SECRET: z
    .string()
    .min(16)
    .default("change-this-vercelab-secret"),
  VERCELAB_GITHUB_TOKEN: z.string().trim().optional(),
});

export type AppConfig = ReturnType<typeof buildConfig>;

let cachedConfig: AppConfig | undefined;

function buildConfig() {
  const parsed = envSchema.parse(process.env);
  const projectRoot = /* turbopackIgnore: true */ process.cwd();
  const hostRoot = parsed.VERCELAB_HOST_ROOT;
  const dataDir = path.join(projectRoot, "data");
  const appsDir = parsed.VERCELAB_APPS_DIR ?? path.join(dataDir, "apps");
  const logsDir = parsed.VERCELAB_LOGS_DIR ?? path.join(dataDir, "logs");
  const locksDir = parsed.VERCELAB_LOCKS_DIR ?? path.join(dataDir, "locks");
  mkdirSync(appsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(locksDir, { recursive: true });

  return {
    env: parsed.NODE_ENV,
    baseDomain: parsed.VERCELAB_BASE_DOMAIN,
    proxy: {
      network: parsed.VERCELAB_PROXY_NETWORK,
      entrypoint: parsed.VERCELAB_PROXY_ENTRYPOINT,
    },
    runtime: {
      dockerSocketPath:
        parsed.VERCELAB_DOCKER_SOCKET_PATH ?? "/var/run/docker.sock",
      hostProcPath: parsed.VERCELAB_HOST_PROC_PATH ?? "/host/proc",
    },
    database: {
      provider: parsed.VERCELAB_DATABASE_PROVIDER,
      postgresUrl: parsed.VERCELAB_POSTGRES_URL,
      postgresUser: parsed.VERCELAB_POSTGRES_USER,
      postgresPassword: parsed.VERCELAB_POSTGRES_PASSWORD,
      postgresDatabase: parsed.VERCELAB_POSTGRES_DB,
    },
    metrics: {
      influxUrl: parsed.VERCELAB_INFLUXDB_URL,
      influxDatabase: parsed.VERCELAB_INFLUXDB_DATABASE,
      influxToken: parsed.VERCELAB_INFLUXDB_TOKEN ?? null,
      retentionDays: parsed.VERCELAB_INFLUXDB_RETENTION_DAYS,
    },
    security: {
      encryptionSecret: parsed.VERCELAB_ENCRYPTION_SECRET,
      githubToken: parsed.VERCELAB_GITHUB_TOKEN ?? null,
    },
    paths: {
      rootDir: projectRoot,
      hostRoot,
      appsDir,
      logsDir,
      locksDir,
    },
  };
}

export function getAppConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = buildConfig();
  }

  return cachedConfig;
}

export function invalidateAppConfig() {
  cachedConfig = undefined;
}

export function updateProcessEnvValue(
  name: keyof NodeJS.ProcessEnv,
  value: string,
) {
  process.env[name] = value;
  invalidateAppConfig();
}
