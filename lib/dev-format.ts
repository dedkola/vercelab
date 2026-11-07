import type { DevContainerState, DevDeploymentStatus } from '@/lib/dev-types';

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDevRelativeTime(value: string | null | undefined) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ] as const;

  for (const [unit, divisor] of units) {
    if (Math.abs(seconds) >= divisor || unit === 'minute') {
      return RELATIVE_TIME_FORMATTER.format(Math.round(seconds / divisor), unit);
    }
  }

  return RELATIVE_TIME_FORMATTER.format(seconds, 'second');
}

export function formatDevDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Not yet';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return DATE_TIME_FORMATTER.format(date);
}

export function getDevStatusLabel(status: DevDeploymentStatus) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'building':
      return 'Building';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'stopped':
      return 'Stopped';
  }
}

export function getDevStatusVariant(
  status: DevDeploymentStatus
): 'default' | 'info' | 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'queued':
      return 'info';
    case 'building':
      return 'warning';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'success';
    case 'stopped':
      return 'default';
  }
}

export function getContainerStatusLabel(state: DevContainerState | null | undefined) {
  switch (state?.status) {
    case 'running':
      return 'Container running';
    case 'exited':
      return 'Container exited';
    case 'created':
      return 'Container created';
    case 'restarting':
      return 'Container restarting';
    case 'paused':
      return 'Container paused';
    case 'dead':
      return 'Container dead';
    case 'unknown':
      return 'Container unknown';
    case 'missing':
    case undefined:
      return 'Container missing';
  }
}

export function getContainerDotClassName(state: DevContainerState | null | undefined) {
  switch (state?.status) {
    case 'running':
      return 'bg-emerald-500';
    case 'restarting':
    case 'created':
    case 'paused':
      return 'bg-amber-500';
    case 'dead':
      return 'bg-red-500';
    default:
      return 'bg-slate-400';
  }
}
