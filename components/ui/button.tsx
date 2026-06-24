import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border text-sm font-semibold tracking-tight transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-safe:hover:-translate-y-px",
  {
    variants: {
      variant: {
        default:
          "border-border/70 bg-background/85 text-foreground shadow-[0_14px_34px_-24px_rgba(15,23,42,0.32)] hover:bg-background hover:shadow-[0_18px_44px_-26px_rgba(15,23,42,0.38)]",
        secondary:
          "border-border/60 bg-muted/70 text-foreground shadow-[0_12px_30px_-24px_rgba(15,23,42,0.26)] hover:bg-muted/90",
        danger:
          "border-destructive/20 bg-destructive text-destructive-foreground shadow-[0_16px_32px_-24px_rgba(220,38,38,0.45)] hover:bg-destructive/92",
        ghost:
          "border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-background/80 hover:text-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        xs: "h-7 rounded-lg px-2.5 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
