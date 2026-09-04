import * as React from 'react';

import { cn } from '@/lib/utils';

type InputGroupProps = React.HTMLAttributes<HTMLDivElement>;

function InputGroup({ className, ...props }: InputGroupProps) {
  return (
    <div
      className={cn(
        'flex h-9 min-w-0 w-full items-center overflow-hidden rounded-[7px] border border-input bg-card focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/70',
        className
      )}
      {...props}
    />
  );
}

type InputGroupInputProps = React.ComponentProps<'input'>;

function InputGroupInput({ className, ...props }: InputGroupInputProps) {
  return (
    <input
      className={cn(
        'h-full min-w-0 w-full border-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none',
        className
      )}
      {...props}
    />
  );
}

type InputGroupSuffixProps = React.HTMLAttributes<HTMLSpanElement>;

function InputGroupSuffix({ className, ...props }: InputGroupSuffixProps) {
  return (
    <span
      className={cn(
        'h-full max-w-[55%] shrink-0 truncate border-l border-border px-2.5 text-[12px] leading-9 text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupInput, InputGroupSuffix };
