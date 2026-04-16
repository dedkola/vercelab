import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-input/80 bg-background/80 px-3 py-1 text-base shadow-[0_14px_34px_-26px_rgba(15,23,42,0.28)] transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring/70 focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
