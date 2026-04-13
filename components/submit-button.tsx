"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  variant: "primary" | "secondary" | "danger";
  size?: "default" | "small";
};

export function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
  size = "default",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`button button--${variant} ${size === "small" ? "button--small" : ""}`}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
