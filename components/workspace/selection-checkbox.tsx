'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

export function SelectionCheckbox({
  ariaLabel,
  checked,
  className,
  disabled = false,
  indeterminate = false,
  onChange,
  title,
}: {
  ariaLabel: string;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      aria-label={ariaLabel}
      checked={checked}
      className={cn(
        'size-3.5 shrink-0 cursor-pointer rounded-[3px] accent-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      disabled={disabled}
      onChange={onChange}
      ref={inputRef}
      title={title}
      type="checkbox"
    />
  );
}
