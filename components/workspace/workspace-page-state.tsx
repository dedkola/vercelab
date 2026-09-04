import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export function WorkspacePageState({
  children,
  code,
  description,
  standalone = false,
  title,
}: {
  children?: ReactNode;
  code: string;
  description: string;
  standalone?: boolean;
  title: string;
}) {
  const content = (
    <main className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto p-6 max-[760px]:p-3">
      <section className="w-full max-w-lg rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
        <p className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[var(--quiet)] uppercase">
          {code}
        </p>
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.035em]">{title}</h1>
        <p className="mt-2 text-[12px] leading-5 text-[var(--muted-ink)]">{description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {children}
          <Button asChild variant="secondary">
            <Link href="/">Back to overview</Link>
          </Button>
        </div>
      </section>
    </main>
  );

  if (!standalone) return content;

  return (
    <div className="flex h-dvh flex-col bg-[var(--canvas)]">
      <header className="flex min-h-11 shrink-0 items-center border-b border-[var(--hairline)] bg-[var(--surface)] px-6 max-[760px]:px-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.08em]"
        >
          <span className="vercelab-brand-mark" aria-hidden="true" />
          VERCELAB / LOCAL
        </Link>
      </header>
      {content}
    </div>
  );
}
