import { z } from 'zod';

const repositoryUrlPattern = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(?:\.git)?$/;
const branchPattern = /^[A-Za-z0-9._/-]+$/;
const appSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const fullCommitShaPattern = /^[0-9a-f]{40}$/i;

function normalizeRelativePath(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim().replace(/\\/g, '/');
}

function isSafeRelativePath(value: string) {
  if (!value || value.startsWith('/') || /^[A-Za-z]:/.test(value)) {
    return false;
  }

  return !value.split('/').some((segment) => segment === '..');
}

const relativePathSchema = (label: string, fallback: string) =>
  z.preprocess(
    (value) => {
      const normalized = normalizeRelativePath(value);
      return normalized === '' || normalized === undefined ? fallback : normalized;
    },
    z
      .string()
      .min(1, `${label} is required.`)
      .max(200, `${label} is too long.`)
      .refine(isSafeRelativePath, `${label} must stay inside the repository.`)
  );

const optionalMultilineSchema = (label: string, maxLength: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    },
    z.string().max(maxLength, `${label} payload is too large.`).optional()
  );

const nullableMultilineSchema = (label: string, maxLength: number) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) {
        return value;
      }

      if (typeof value !== 'string') {
        return value;
      }

      const normalized = value.trim();
      return normalized.length > 0 ? normalized : null;
    },
    z.string().max(maxLength, `${label} payload is too large.`).nullable().optional()
  );

const branchSchema = z
  .string()
  .trim()
  .min(1, 'Branch is required.')
  .max(120, 'Branch name is too long.')
  .regex(branchPattern, 'Branch contains unsupported characters.')
  .refine(
    (value) => !value.startsWith('-') && !value.includes('..') && !value.endsWith('/'),
    'Branch name is invalid.'
  );

export const createDevProjectSchema = z.object({
  repositoryUrl: z
    .string()
    .trim()
    .regex(repositoryUrlPattern, 'Use an HTTPS GitHub repository URL.'),
  branch: branchSchema,
  appName: z.string().trim().min(2, 'App name is too short.').max(60, 'App name is too long.'),
  appSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(appSlugPattern, 'Preview prefix must be lowercase letters, numbers, or dashes.'),
  dockerfilePath: relativePathSchema('Dockerfile path', 'Dockerfile'),
  buildContext: relativePathSchema('Build context', '.'),
  port: z.coerce
    .number()
    .int()
    .min(1, 'Port must be between 1 and 65535.')
    .max(65535, 'Port must be between 1 and 65535.'),
  envVariables: optionalMultilineSchema('Environment variables', 12000),
  buildArgs: optionalMultilineSchema('Build arguments', 12000),
  autoDeploy: z.boolean().default(true),
  retentionLimit: z.coerce
    .number()
    .int()
    .min(0, 'Retention must be zero or greater.')
    .max(1000, 'Retention must be 1000 or less.')
    .default(0),
  deployLatest: z.boolean().default(true),
});

export type CreateDevProjectInput = z.infer<typeof createDevProjectSchema>;

export const updateDevProjectSchema = z.object({
  branch: branchSchema.optional(),
  appName: z
    .string()
    .trim()
    .min(2, 'App name is too short.')
    .max(60, 'App name is too long.')
    .optional(),
  appSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(appSlugPattern, 'Preview prefix must be lowercase letters, numbers, or dashes.')
    .optional(),
  dockerfilePath: relativePathSchema('Dockerfile path', 'Dockerfile').optional(),
  buildContext: relativePathSchema('Build context', '.').optional(),
  port: z.coerce
    .number()
    .int()
    .min(1, 'Port must be between 1 and 65535.')
    .max(65535, 'Port must be between 1 and 65535.')
    .optional(),
  envVariables: nullableMultilineSchema('Environment variables', 12000),
  buildArgs: nullableMultilineSchema('Build arguments', 12000),
  autoDeploy: z.boolean().optional(),
  retentionLimit: z.coerce
    .number()
    .int()
    .min(0, 'Retention must be zero or greater.')
    .max(1000, 'Retention must be 1000 or less.')
    .optional(),
  rotateWebhookSecret: z.boolean().optional(),
});

export type UpdateDevProjectInput = z.infer<typeof updateDevProjectSchema>;

export const deployDevCommitSchema = z.object({
  commitSha: z
    .string()
    .trim()
    .regex(fullCommitShaPattern, 'Commit SHA must be a full 40-character SHA.')
    .optional(),
});

const DEV_DEPLOYMENT_ACTIONS = ['start', 'stop', 'restart', 'retry', 'delete'] as const;

export type DevDeploymentAction = (typeof DEV_DEPLOYMENT_ACTIONS)[number];

export const devDeploymentActionSchema = z.object({
  action: z.enum(DEV_DEPLOYMENT_ACTIONS),
});
