import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-[7px] border text-[11px] font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground shadow-none hover:bg-muted',
        secondary: 'border-border bg-secondary text-foreground shadow-none hover:bg-muted',
        danger:
          'border-destructive/20 bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90',
        ghost:
          'border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'h-9 px-3 py-2',
        sm: 'h-8 px-3 text-[11px]',
        xs: 'h-7 rounded-[6px] px-2.5 text-[11px]',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export interface ButtonProps
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

export { Button, buttonVariants };
