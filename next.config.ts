import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg'],
  allowedDevOrigins: ['10.10.0.86'],
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
      'uninstall.sh',
      'index.html',
      'components.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'vitest.config.ts',
      'eslint.config.mjs',
      'postcss.config.mjs',
      'public/screenshots/**/*',
      'public/file.svg',
      'public/globe.svg',
      'public/next.svg',
      'public/vercel.svg',
      'public/window.svg',
    ],
  },
};

export default nextConfig;
