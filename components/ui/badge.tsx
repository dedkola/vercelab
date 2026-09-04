import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center shrink-0 rounded-[6px] border px-2 py-0.5 text-[10px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground',
        secondary: 'border-border/60 bg-muted/75 text-foreground',
        success: 'border-[var(--green)]/20 bg-[var(--green-soft)] text-[var(--green)]',
        destructive: 'border-destructive/20 bg-[var(--red-soft)] text-destructive',
        warning: 'border-[var(--orange)]/25 bg-[var(--orange-soft)] text-[var(--warning-ink)]',
        info: 'border-[var(--blue)]/20 bg-[var(--blue-soft)] text-[var(--blue)]',
        outline: 'border-border/60 bg-transparent text-foreground shadow-none',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
