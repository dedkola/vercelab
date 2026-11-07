'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type SegmentedControlOption<T extends string> = {
  icon?: ReactNode;
  label: string;
  value: T;
};

export function SegmentedControl<T extends string>({
  ariaLabel,
  className,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  value: T;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'grid w-max grid-flow-col rounded-[7px] border border-[var(--hairline)] bg-[var(--surface-subtle)] p-0.5',
        className
      )}
      role="group"
    >
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={cn(
            'inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] px-2.5 text-[11px] font-medium transition-colors',
            option.value === value
              ? 'bg-white text-foreground shadow-[0_1px_2px_rgb(16_24_40_/_0.08)]'
              : 'text-[var(--quiet)] hover:text-foreground'
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
