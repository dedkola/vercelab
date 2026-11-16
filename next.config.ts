import type { NextConfig } from 'next';

// Allow `next dev` to be opened from another machine on the LAN. Next.js loads
// .env.local before this file, so the IP written by `pnpm run setup-env` applies.
const lanDevOrigin = process.env.VERCELAB_HOST_LAN_IP?.trim();

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg'],
  allowedDevOrigins: lanDevOrigin ? [lanDevOrigin] : [],
  outputFileTracingExcludes: {
    '*': [
      '**/*.test.ts',
      '**/*.test.tsx',
      'tests/**/*',
      'scripts/**/*',
      'README.md',
      'Dockerfile',
      'docker-compose*.yml',
      'install.sh',
      'install-macos.sh',
      'uninstall.sh',
      'index.html',
      'prototype/**/*',
      'components.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'vitest.config.ts',
      'eslint.config.mjs',
      'postcss.config.mjs',
      'public/screenshots/**/*',
    ],
  },
};

export default nextConfig;
