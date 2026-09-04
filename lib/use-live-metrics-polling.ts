'use client';

import { useEffect, useEffectEvent, useRef } from 'react';

import type { MetricsHistoryPoint } from '@/lib/influx-metrics';
import type { MetricsSnapshot } from '@/lib/system-metrics';

const LIVE_POLL_INTERVAL_MS = 10000;
const HIDDEN_LIVE_POLL_INTERVAL_MS = 30000;
const LIVE_POLL_ERROR_BACKOFF_MAX_MS = 60000;
const VISIBILITY_REFRESH_DELAY_MS = 750;

type LiveMetricsPollingOptions = {
  enabled: boolean;
  initialSnapshot: MetricsSnapshot | null;
  initialHistory: MetricsHistoryPoint[];
  // Restart polling when a caller changes its selected history window.
  refreshKey?: string;
  onSnapshot: (snapshot: MetricsSnapshot) => void;
  onHistory: (history: MetricsHistoryPoint[]) => void;
  onError?: (error: string | null) => void;
};

function isDocumentHidden() {
  return document.visibilityState === 'hidden';
}

export function useLiveMetricsPolling({
  enabled,
  initialSnapshot,
  initialHistory,
  refreshKey,
  onSnapshot,
  onHistory,
  onError,
}: LiveMetricsPollingOptions): void {
  const hasMountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const updateSnapshot = useEffectEvent(onSnapshot);
  const updateHistory = useEffectEvent(onHistory);
  const updateError = useEffectEvent((error: string | null) => onError?.(error));

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    let timeoutId: number | null = null;
    let abortController: AbortController | null = null;
    let errorBackoffMs = LIVE_POLL_INTERVAL_MS;

    const scheduleNextPoll = (delayMs: number) => {
      if (!active) {
        return;
      }

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        void pollLiveMetrics();
      }, delayMs);
    };

    const pollLiveMetrics = async () => {
      if (!active) {
        return;
      }

      if (inFlightRef.current) {
        scheduleNextPoll(errorBackoffMs);
        return;
      }

      if (isDocumentHidden()) {
        scheduleNextPoll(HIDDEN_LIVE_POLL_INTERVAL_MS);
        return;
      }

      inFlightRef.current = true;
      abortController = new AbortController();

      try {
        const response = await fetch('/api/metrics?includeHistory=true&mode=current', {
          cache: 'no-store',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Metrics request failed with ${response.status}.`);
        }

        const payload = (await response.json()) as {
          history?: MetricsHistoryPoint[];
          snapshot?: MetricsSnapshot | null;
        };

        if (!active) {
          return;
        }

        if (payload.snapshot) {
          updateSnapshot(payload.snapshot);
        }

        if (Array.isArray(payload.history)) {
          updateHistory(payload.history);
        }

        updateError(null);
        errorBackoffMs = LIVE_POLL_INTERVAL_MS;
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }

        updateError(error instanceof Error ? error.message : 'Unable to load live metrics.');
        errorBackoffMs = Math.min(errorBackoffMs * 2, LIVE_POLL_ERROR_BACKOFF_MAX_MS);
      } finally {
        inFlightRef.current = false;
        abortController = null;
        scheduleNextPoll(errorBackoffMs);
      }
    };

    const shouldPollImmediately = hasMountedRef.current
      ? true
      : !(initialSnapshot && initialHistory.length > 0);

    hasMountedRef.current = true;
    scheduleNextPoll(shouldPollImmediately ? 0 : LIVE_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      scheduleNextPoll(VISIBILITY_REFRESH_DELAY_MS);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      inFlightRef.current = false;
      abortController?.abort();

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, initialHistory.length, initialSnapshot, onError, onHistory, onSnapshot, refreshKey]);
}
