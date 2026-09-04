'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function WorkspaceDialog({
  children,
  className,
  onCloseAction,
  title,
  variant = 'review',
}: {
  children: ReactNode;
  className?: string;
  onCloseAction: () => void;
  title: string;
  variant?: 'drawer' | 'review';
}) {
  const [returnFocusTarget] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)
  );

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCloseAction()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[rgb(26_26_29_/_0.2)]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 flex min-h-0 flex-col overflow-hidden border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink)] outline-none',
            variant === 'drawer'
              ? 'inset-y-0 right-0 h-dvh w-[min(560px,calc(100vw-24px))] border-y-0 border-r-0 shadow-[-20px_0_60px_rgb(16_24_40_/_0.12)] max-[640px]:w-full max-[640px]:border-l-0'
              : 'left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[680px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] shadow-[0_24px_90px_rgb(16_24_40_/_0.18)]',
            className
          )}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTarget?.focus();
          }}
        >
          <Dialog.Title asChild>
            <span className="sr-only">{title}</span>
          </Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
