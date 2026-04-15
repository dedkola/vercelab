import * as React from "react";

import { cn } from "@/lib/utils";

type InputGroupProps = React.HTMLAttributes<HTMLDivElement>;

function InputGroup({ className, ...props }: InputGroupProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-full items-center rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-sm focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-1",
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
        "h-full w-full border-0 bg-transparent px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus-visible:outline-none",
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
        "h-full shrink-0 border-l border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] leading-10",
        className,
      )}
      {...props}
    />
  );
}

export { InputGroup, InputGroupInput, InputGroupSuffix };
