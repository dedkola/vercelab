'use client';

import type {
  ComponentPropsWithoutRef,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
 * Shared building blocks for the workspace inventory tables (Apps, Containers, Overview).
 * Keeping header, row, status and action styling in one place keeps every table aligned
 * on the same rhythm: 36px header, 56px rows, right-aligned numerics, one action column.
 */

type Align = 'left' | 'right' | 'center';

const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full table-fixed border-collapse text-left', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function DataTableHeaderRow({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="h-9 border-b border-[var(--hairline)] bg-[var(--surface-subtle)]">
        {children}
      </tr>
    </thead>
  );
}

export function DataTableHead({
  align = 'left',
  children,
  className,
}: {
  align?: Align;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        'px-3 align-middle text-2xs font-medium tracking-[0.06em] whitespace-nowrap text-[var(--muted-ink)] uppercase first:pl-4 last:pr-4',
        ALIGN_CLASS[align],
        className
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

export function DataTableActionsHead({ className }: { className?: string }) {
  return (
    <th className={cn('px-3 last:pr-4', className)} scope="col">
      <span className="sr-only">Actions</span>
    </th>
  );
}

export function DataTableRow({
  children,
  label,
  onSelectAction,
  selected = false,
  ...props
}: {
  children: ReactNode;
  /** Overrides the row's accessible name; omit to let screen readers read the cells. */
  label?: string;
  onSelectAction: () => void;
  selected?: boolean;
} & Omit<ComponentPropsWithoutRef<'tr'>, 'onClick' | 'onKeyDown' | 'onSelect'>) {
  return (
    <tr
      {...props}
      aria-label={label}
      aria-selected={selected || undefined}
      className={cn(
        'group h-14 cursor-pointer border-b border-[var(--hairline)] outline-none transition-colors duration-150 last:border-b-0',
        'hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:shadow-[inset_0_0_0_2px_var(--blue)]',
        selected &&
          'bg-[color-mix(in_srgb,var(--blue-soft)_55%,white)] shadow-[inset_3px_0_0_var(--blue)] hover:bg-[color-mix(in_srgb,var(--blue-soft)_75%,white)]'
      )}
      onClick={onSelectAction}
      onKeyDown={(event: ReactKeyboardEvent<HTMLTableRowElement>) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectAction();
        }
      }}
      tabIndex={0}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  align = 'left',
  children,
  className,
}: {
  align?: Align;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle first:pl-4 last:pr-4',
        ALIGN_CLASS[align],
        align === 'right' && 'tabular-nums',
        className
      )}
    >
      {children}
    </td>
  );
}

/** Primary line + muted secondary line, used for most cells. */
export function CellStack({
  className,
  mono = true,
  primary,
  secondary,
}: {
  className?: string;
  mono?: boolean;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <span className={cn('block min-w-0', className)}>
      <span
        className={cn(
          'block truncate text-xs text-foreground',
          mono && 'font-mono tracking-[-0.01em]'
        )}
      >
        {primary}
      </span>
      {secondary ? (
        <span
          className={cn(
            'mt-0.5 block truncate text-2xs text-[var(--quiet)]',
            mono && 'font-mono tracking-[-0.01em]'
          )}
        >
          {secondary}
        </span>
      ) : null}
    </span>
  );
}

/** First column: avatar tile + name + identifier. */
export function EntityCell({
  avatar,
  name,
  subtitle,
}: {
  avatar: ReactNode;
  name: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {avatar}
      <span className="min-w-0">
        <span className="block truncate text-body font-semibold tracking-[-0.01em] text-foreground">
          {name}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate font-mono text-2xs tracking-[-0.01em] text-[var(--quiet)]">
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}

const AVATAR_TONES = [
  'border-[var(--blue)]/15 bg-[var(--blue-soft)] text-[var(--blue)]',
  'border-[var(--orange)]/20 bg-[var(--orange-soft)] text-[var(--warning-ink)]',
  'border-[var(--purple)]/15 bg-[var(--purple-soft)] text-[var(--purple)]',
  'border-[var(--green)]/15 bg-[var(--green-soft)] text-[var(--green)]',
] as const;

export function InitialsAvatar({ initials, toneIndex }: { initials: string; toneIndex: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-[8px] border text-2xs font-semibold tracking-[0.02em]',
        AVATAR_TONES[toneIndex % AVATAR_TONES.length]
      )}
    >
      {initials}
    </span>
  );
}

export function getInitials(name: string) {
  const words = name.split(/[-_.\s]+/).filter(Boolean);

  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'border-[var(--green)]/20 bg-[var(--green-soft)] text-[var(--green)]',
  warning: 'border-[var(--orange)]/25 bg-[var(--orange-soft)] text-[var(--warning-ink)]',
  danger: 'border-[var(--red)]/20 bg-[var(--red-soft)] text-[var(--red)]',
  neutral: 'border-[var(--hairline)] bg-[var(--surface-subtle)] text-[var(--muted-ink)]',
};

const STATUS_DOT_CLASS: Record<StatusTone, string> = {
  success: 'bg-[var(--green)]',
  warning: 'bg-[var(--orange)]',
  danger: 'bg-[var(--red)]',
  neutral: 'bg-[var(--quiet)]',
};

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full border px-2 text-2xs font-medium whitespace-nowrap',
        STATUS_TONE_CLASS[tone]
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT_CLASS[tone])}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function RouteLink({ href, label }: { href: string | null; label: string | null }) {
  if (!href || !label) {
    return <span className="text-xs text-[var(--quiet)]">not routed</span>;
  }

  return (
    <a
      className="inline-flex max-w-full items-center gap-1 font-mono text-xs tracking-[-0.01em] text-[var(--blue)] underline-offset-2 hover:underline"
      href={href}
      onClick={(event) => event.stopPropagation()}
      rel="noreferrer"
      target="_blank"
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight aria-hidden="true" className="size-3 shrink-0 opacity-70" />
    </a>
  );
}

export function RowActionButton({
  children,
  onClickAction,
}: {
  children: ReactNode;
  onClickAction: () => void;
}) {
  return (
    <Button
      className="group-hover:border-[var(--hairline-strong)]"
      onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onClickAction();
      }}
      size="xs"
      type="button"
      variant="secondary"
    >
      {children}
    </Button>
  );
}

export function DataTableEmpty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-12 text-center text-body text-[var(--muted-ink)]">{children}</div>;
}
