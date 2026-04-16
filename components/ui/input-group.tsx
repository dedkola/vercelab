import * as React from "react";

import { cn } from "@/lib/utils";

type InputGroupProps = React.HTMLAttributes<HTMLDivElement>;

function InputGroup({ className, ...props }: InputGroupProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-full items-center rounded-xl border border-input/80 bg-background/80 shadow-[0_14px_34px_-26px_rgba(15,23,42,0.28)] focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/70 focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.18)]",
        className,
      )}
      {...props}
    />
  );
}

type InputGroupInputProps = React.ComponentProps<"input">;

function InputGroupInput({ className, ...props }: InputGroupInputProps) {
  return (
    <input
      className={cn(
        "h-full w-full border-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none",
        className,
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
        "h-full shrink-0 border-l border-border/70 px-3 text-sm leading-10 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupInput, InputGroupSuffix };
