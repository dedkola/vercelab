import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function WorkspaceNotice({
  children,
  className,
  tone = 'error',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'error' | 'warning' | 'info' | 'success';
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-[7px] border px-3 py-2.5 text-[11px] leading-5 [overflow-wrap:anywhere]',
        tone === 'error' && 'border-[var(--red)]/20 bg-[var(--red-soft)] text-[var(--red)]',
        tone === 'warning' &&
          'border-[var(--orange)]/25 bg-[var(--orange-soft)] text-[var(--warning-ink)]',
        tone === 'info' &&
          'border-[var(--hairline)] bg-[var(--surface-subtle)] text-[var(--muted-ink)]',
        tone === 'success' && 'border-[var(--green)]/20 bg-[var(--green-soft)] text-[var(--green)]',
        className
      )}
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
