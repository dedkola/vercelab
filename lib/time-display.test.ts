import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TIME_DISPLAY_MODE,
  getTimeZoneForDisplayMode,
  readStoredTimeDisplayMode,
  TIME_DISPLAY_STORAGE_KEY,
  writeStoredTimeDisplayMode,
} from '@/lib/time-display';

describe('time display preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to local device time and ignores invalid stored values', () => {
    expect(readStoredTimeDisplayMode()).toBe(DEFAULT_TIME_DISPLAY_MODE);

    window.localStorage.setItem(TIME_DISPLAY_STORAGE_KEY, 'server');

    expect(readStoredTimeDisplayMode()).toBe(DEFAULT_TIME_DISPLAY_MODE);
  });

  it('persists UTC and resolves display zones', () => {
    writeStoredTimeDisplayMode('utc');

    expect(readStoredTimeDisplayMode()).toBe('utc');
    expect(getTimeZoneForDisplayMode('utc')).toBe('UTC');
    expect(getTimeZoneForDisplayMode('local')).toBeNull();
  });
});
