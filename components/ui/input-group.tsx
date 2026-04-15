import * as React from "react";

import { cn } from "@/lib/utils";

type InputGroupProps = React.HTMLAttributes<HTMLDivElement>;

function InputGroup({ className, ...props }: InputGroupProps) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-sm focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
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
        "h-full w-full border-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none",
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
        "h-full shrink-0 border-l px-3 text-sm text-muted-foreground leading-9",
        className,
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupInput, InputGroupSuffix };
