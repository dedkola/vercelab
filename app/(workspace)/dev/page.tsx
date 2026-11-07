import type { Metadata } from 'next';

import { DevShell } from './dev-shell';
import { loadDevState } from '@/lib/dev-state';

export const metadata: Metadata = {
  title: 'Dev | Vercelab',
  description: 'Commit-based Docker preview deployments for connected GitHub repositories.',
};

export const dynamic = 'force-dynamic';

export default async function DevPage() {
  const initialState = await loadDevState().catch(() => null);

  return <DevShell initialState={initialState} />;
}
