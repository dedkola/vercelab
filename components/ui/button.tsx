import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Every variant is transparent: a hairline outline (or none) over whatever surface the
// button sits on, with a faint ink wash on hover. Emphasis comes from border weight and
// type, never from a filled brand colour.
const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border bg-transparent font-medium tracking-[-0.005em] shadow-none',
    'transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-white',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-border text-foreground hover:border-[var(--hairline-strong)] hover:bg-[var(--ink)]/[0.04] active:bg-[var(--ink)]/[0.07]',
        primary:
          'border-[var(--hairline-strong)] font-semibold text-foreground hover:border-[var(--ink)]/35 hover:bg-[var(--ink)]/[0.05] active:bg-[var(--ink)]/[0.08]',
        secondary:
          'border-border text-foreground hover:border-[var(--hairline-strong)] hover:bg-[var(--ink)]/[0.04] active:bg-[var(--ink)]/[0.07]',
        danger:
          'border-destructive/25 text-destructive hover:border-destructive/45 hover:bg-destructive/[0.06] active:bg-destructive/[0.1]',
        ghost:
          'border-transparent text-[var(--muted-ink)] hover:bg-[var(--ink)]/[0.05] hover:text-foreground active:bg-[var(--ink)]/[0.08]',
      },
      size: {
        default: 'h-8 px-3 text-xs',
        sm: 'h-7 px-2.5 text-xs',
        xs: 'h-6 rounded-[5px] px-2 text-2xs',
        lg: 'h-9 px-4 text-body',
        icon: 'size-7 p-0',
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
