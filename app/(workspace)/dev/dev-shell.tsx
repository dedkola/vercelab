'use client';

import dynamic from 'next/dynamic';

import type { DevState } from '@/lib/dev-types';

export const DevShell = dynamic<{ initialState: DevState | null }>(
  () => import('@/components/dev-shell').then((module) => module.DevShell),
  { ssr: false }
);
