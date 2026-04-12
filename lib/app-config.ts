import { mkdirSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCLAB_DATABASE_PROVIDER: z.enum(["sqlite", "postgres"]).default("sqlite"),
  VERCLAB_DATABASE_PATH: z.string().optional(),
  VERCLAB_POSTGRES_URL: z.string().optional(),
  VERCLAB_HOST_ROOT: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || path.isAbsolute(value), {
      message: "VERCLAB_HOST_ROOT must be an absolute path.",
    }),
  VERCLAB_APPS_DIR: z.string().optional(),
  VERCLAB_LOGS_DIR: z.string().optional(),
  VERCLAB_LOCKS_DIR: z.string().optional(),
  VERCLAB_DOCKER_SOCKET_PATH: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || path.isAbsolute(value), {
      message: "VERCLAB_DOCKER_SOCKET_PATH must be an absolute path.",
    }),
  VERCLAB_BASE_DOMAIN: z
    .string()
    .trim()
    .min(3)
    .default("myhomelan.com"),
  VERCLAB_PROXY_NETWORK: z
    .string()
    .trim()
    .min(3)
    .default("verclab_proxy"),
  VERCLAB_PROXY_ENTRYPOINT: z
    .string()
    .trim()
    .min(2)
    .default("websecure"),
  VERCLAB_ENCRYPTION_SECRET: z
    .string()
    .min(16)
    .default("change-this-verclab-secret"),
});

export type AppConfig = ReturnType<typeof buildConfig>;

let cachedConfig: AppConfig | undefined;

function buildConfig() {
  const parsed = envSchema.parse(process.env);
  const projectRoot = /* turbopackIgnore: true */ process.cwd();
  const hostRoot = parsed.VERCLAB_HOST_ROOT;
  const dataDir = path.join(projectRoot, "data");
  const appsDir = parsed.VERCLAB_APPS_DIR ?? path.join(dataDir, "apps");
  const logsDir = parsed.VERCLAB_LOGS_DIR ?? path.join(dataDir, "logs");
  const locksDir = parsed.VERCLAB_LOCKS_DIR ?? path.join(dataDir, "locks");
  const sqlitePath =
    parsed.VERCLAB_DATABASE_PATH ?? path.join(dataDir, "verclab.sqlite");

  mkdirSync(appsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(locksDir, { recursive: true });
  mkdirSync(path.dirname(sqlitePath), { recursive: true });

  return {
    env: parsed.NODE_ENV,
    baseDomain: parsed.VERCLAB_BASE_DOMAIN,
    proxy: {
      network: parsed.VERCLAB_PROXY_NETWORK,
      entrypoint: parsed.VERCLAB_PROXY_ENTRYPOINT,
    },
    runtime: {
      dockerSocketPath: parsed.VERCLAB_DOCKER_SOCKET_PATH ?? "/var/run/docker.sock",
    },
    database: {
      provider: parsed.VERCLAB_DATABASE_PROVIDER,
      sqlitePath,
      postgresUrl: parsed.VERCLAB_POSTGRES_URL,
    },
    security: {
      encryptionSecret: parsed.VERCLAB_ENCRYPTION_SECRET,
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
