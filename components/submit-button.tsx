"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { IconName } from "@/components/dashboard-kit";
import { Icon } from "@/components/dashboard-kit";

type SubmitButtonProps = {
  className?: string;
  idleLabel: string;
  pendingLabel: string;
  variant: "primary" | "secondary" | "danger";
  size?: "default" | "small" | "compact";
  iconName?: IconName;
};

export function SubmitButton({
  className,
  idleLabel,
  pendingLabel,
  variant,
  size = "default",
  iconName,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  const resolvedVariant =
    variant === "primary"
      ? "default"
      : variant === "danger"
        ? "danger"
        : "secondary";

  return (
    <Button
      className={className}
      variant={resolvedVariant}
      size={size === "compact" ? "xs" : size === "small" ? "sm" : "default"}
      disabled={pending}
      type="submit"
    >
      {iconName ? <Icon name={iconName} className="h-3.5 w-3.5" /> : null}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
