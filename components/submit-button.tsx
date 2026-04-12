"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
  variant: "primary" | "secondary" | "danger";
};

export function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button className={`button button--${variant}`} disabled={pending} type="submit">
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
