export const TIME_DISPLAY_STORAGE_KEY = 'vercelab:time-display-mode';

export type TimeDisplayMode = 'local' | 'utc';

export const DEFAULT_TIME_DISPLAY_MODE: TimeDisplayMode = 'local';

export function isTimeDisplayMode(value: string | null): value is TimeDisplayMode {
  return value === 'local' || value === 'utc';
}

export function readStoredTimeDisplayMode(): TimeDisplayMode {
  if (typeof window === 'undefined') {
    return DEFAULT_TIME_DISPLAY_MODE;
  }

  try {
    const storedMode = window.localStorage?.getItem(TIME_DISPLAY_STORAGE_KEY) ?? null;

    return isTimeDisplayMode(storedMode) ? storedMode : DEFAULT_TIME_DISPLAY_MODE;
  } catch {
    return DEFAULT_TIME_DISPLAY_MODE;
  }
}

export function writeStoredTimeDisplayMode(mode: TimeDisplayMode) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage?.setItem(TIME_DISPLAY_STORAGE_KEY, mode);
  } catch {
    // The preference remains active for this session when storage is unavailable.
  }
}

export function getTimeZoneForDisplayMode(mode: TimeDisplayMode): string | null {
  return mode === 'utc' ? 'UTC' : null;
}

export function getLocalTimeZoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Device time';
  } catch {
    return 'Device time';
  }
}
