import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-tight transition-colors shadow-sm backdrop-blur-sm",
  {
    variants: {
      variant: {
        default: "border-border/60 bg-background/85 text-foreground",
        secondary: "border-border/60 bg-muted/75 text-foreground",
        success: "border-green-200/80 bg-green-50/95 text-green-700",
        destructive:
          "border-destructive/15 bg-destructive text-destructive-foreground",
        warning: "border-orange-200/80 bg-orange-50/95 text-orange-700",
        info: "border-blue-200/80 bg-blue-50/95 text-blue-700",
        outline: "border-border/60 bg-transparent text-foreground shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
