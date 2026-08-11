import { useEffect, useState } from 'react';

/**
 * Re-renders the calling component on an interval. Used for the "updated Xs
 * ago" ticker, which must move every second without dragging the 2,400-row
 * queue into a re-render — so only the components that call this repaint.
 */
export function useTicker(intervalMs = 1000): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    // Pause while hidden: a backgrounded tab has nothing to animate, and
    // browsers throttle the timer anyway.
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id === null) id = setInterval(() => setTick((n) => n + 1), intervalMs);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        setTick((n) => n + 1);
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);

  return Date.now();
}

/** "8s" / "4m" / "1h 12m" — compact, for the live ticker. */
export function formatAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/**
 * Minutes since a report, for the queue's "last reported" column.
 *
 * Deliberately loses precision past an hour. Anything over 60 minutes is
 * already flagged Not reporting, so the difference between "32h 59m" and "33h"
 * changes no decision — and the long form wraps the column onto a second line,
 * which makes rows change height on refresh.
 */
export function formatReportedAge(ageMinutes: number | null): string {
  if (ageMinutes === null) return 'never';
  if (ageMinutes < 1) return 'just now';
  if (ageMinutes < 60) return `${Math.round(ageMinutes)}m ago`;

  const hours = ageMinutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Wall clock, e.g. "12:41:03" — used when naming the data we are still showing. */
export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false });
}

/** Wall clock with the viewer's zone, e.g. "14:32:06 EST", for the dateline. */
export function formatClockWithZone(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour12: false,
    timeZoneName: 'short',
  });
}
