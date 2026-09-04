'use client';

import { cn } from '@/lib/utils';

export function WorkspaceTabs<T extends string>({
  id,
  label,
  onChange,
  tabs,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: T) => void;
  tabs: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <div
      aria-label={label}
      className="flex min-h-[39px] shrink-0 gap-4 overflow-x-auto border-b border-[var(--hairline)] px-4"
      role="tablist"
    >
      {tabs.map((tab, index) => (
        <button
          aria-controls={`${id}-panel`}
          aria-selected={value === tab.value}
          className={cn(
            'relative shrink-0 text-[11px] font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5',
            value === tab.value
              ? 'text-foreground after:bg-[var(--blue)]'
              : 'text-[var(--quiet)] hover:text-foreground'
          )}
          id={`${id}-${tab.value}`}
          key={tab.value}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            const nextIndex =
              event.key === 'ArrowRight'
                ? (index + 1) % tabs.length
                : event.key === 'ArrowLeft'
                  ? (index - 1 + tabs.length) % tabs.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : null;
            if (nextIndex === null) return;
            event.preventDefault();
            const next = tabs[nextIndex];
            onChange(next.value);
            document.getElementById(`${id}-${next.value}`)?.focus();
          }}
          role="tab"
          tabIndex={value === tab.value ? 0 : -1}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
