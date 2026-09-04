import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 min-w-0 w-full rounded-[7px] border border-input bg-card px-2.5 py-1 text-[12px] shadow-none transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
