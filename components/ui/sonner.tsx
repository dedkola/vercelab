'use client';

import {
  CheckCircle as CircleCheckIcon,
  Info as InfoIcon,
  SpinnerGap as Loader2Icon,
  XCircle as OctagonXIcon,
  Warning as TriangleAlertIcon,
} from '@phosphor-icons/react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          '--success-bg': 'var(--green-soft)',
          '--success-text': 'var(--green)',
          '--error-bg': 'var(--red-soft)',
          '--error-text': 'var(--red)',
          '--warning-bg': 'var(--orange-soft)',
          '--warning-text': 'var(--warning-ink)',
          '--info-bg': 'var(--blue-soft)',
          '--info-text': 'var(--blue)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
