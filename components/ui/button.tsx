import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border font-medium tracking-[-0.005em]',
    'transition-[color,background-color,border-color,box-shadow] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-white',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-[var(--hairline)] bg-white text-foreground shadow-[0_1px_1px_rgb(16_24_40/0.04)] hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-subtle)] active:bg-[var(--muted)]',
        primary:
          'border-[color-mix(in_srgb,var(--blue)_88%,black)] bg-[var(--blue)] text-white shadow-[0_1px_1px_rgb(16_24_40/0.08),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-[color-mix(in_srgb,var(--blue)_90%,black)] active:bg-[color-mix(in_srgb,var(--blue)_82%,black)]',
        secondary:
          'border-[var(--hairline)] bg-white text-foreground shadow-[0_1px_1px_rgb(16_24_40/0.04)] hover:border-[var(--hairline-strong)] hover:bg-[var(--surface-subtle)] active:bg-[var(--muted)]',
        danger:
          'border-[color-mix(in_srgb,var(--red)_88%,black)] bg-[var(--red)] text-white shadow-[0_1px_1px_rgb(16_24_40/0.08),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-[color-mix(in_srgb,var(--red)_90%,black)] active:bg-[color-mix(in_srgb,var(--red)_82%,black)]',
        ghost:
          'border-transparent bg-transparent text-[var(--muted-ink)] shadow-none hover:bg-[var(--muted)] hover:text-foreground active:bg-[color-mix(in_srgb,var(--muted)_80%,black_4%)]',
      },
      size: {
        default: 'h-9 px-3.5 text-body',
        sm: 'h-8 px-3 text-xs',
        xs: 'h-7 rounded-[6px] px-2.5 text-xs',
        lg: 'h-10 px-5 text-sm',
        icon: 'size-9 p-0',
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
