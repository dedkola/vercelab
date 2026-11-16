import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Every variant is transparent: a hairline outline (or none) over whatever surface the
// button sits on, with a faint ink wash on hover. Emphasis comes from border weight and
// type, never from a filled brand colour.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 rounded-[6px] border bg-transparent text-xs font-medium shadow-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-border text-foreground hover:border-[var(--hairline-strong)] hover:bg-[var(--ink)]/[0.04]',
        primary:
          'border-[var(--hairline-strong)] font-semibold text-foreground hover:border-[var(--ink)]/35 hover:bg-[var(--ink)]/[0.05]',
        secondary:
          'border-border text-foreground hover:border-[var(--hairline-strong)] hover:bg-[var(--ink)]/[0.04]',
        danger:
          'border-destructive/25 text-destructive hover:border-destructive/45 hover:bg-destructive/[0.06]',
        ghost:
          'border-transparent text-muted-foreground hover:bg-[var(--ink)]/[0.05] hover:text-foreground',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2.5',
        xs: 'h-6 rounded-[5px] px-2 text-2xs',
        lg: 'h-9 px-4 text-body',
        icon: 'size-7',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button };
