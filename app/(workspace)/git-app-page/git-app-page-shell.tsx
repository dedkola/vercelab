'use client';

import dynamic from 'next/dynamic';

import type { GitAppPageShellProps } from '@/components/git-app-page-shell';

export const GitAppPageShell = dynamic<GitAppPageShellProps>(
  () => import('@/components/git-app-page-shell').then((m) => m.GitAppPageShell),
  { ssr: false }
);
