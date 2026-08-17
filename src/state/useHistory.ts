import { useEffect, useMemo, useState } from 'react';
import { SNAPSHOT_RETENTION_MS, readSnapshots, type SnapshotRow } from '../data/snapshots';
import { NEEDS_TRUCK_THRESHOLD } from '../model/score';
import {
  buildTracks,
  countOutcomes,
  type Outcome,
  type Track,
} from '../model/verify';
import { useDispatch } from '../store/useDispatch';

/**
 * What this session has watched happen.
 *
 * The store already snapshots every flagged station on every poll — that has
 * been running since the feed was wired in and nothing displayed it. This is
 * the read side: it turns those rows into per-station tracks and the one
 * question a dispatch board cannot otherwise answer, which is whether anything
 * is actually getting better.
 *
 * Honest about its limits. It records only while the tab is open, so it can
 * say "in the last 40 minutes" and never "overnight". The Cloudflare worker
 * scaffolded in /worker is what turns this into a real time series.
 */

export interface SessionHistory {
  /** Null until the first read resolves; empty array means genuinely nothing. */
  tracks: Track[] | null;
  outcomes: Record<Outcome, number>;
  /** Milliseconds from the earliest reading to now, or null if no data. */
  windowMs: number | null;
  /** Distinct polls observed — how much evidence this is built on. */
  readings: number;
}

export function useSessionHistory(): SessionHistory {
  const revision = useDispatch((s) => s.revision);
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readSnapshots(Date.now() - SNAPSHOT_RETENTION_MS).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const tracks = useMemo(() => (rows ? buildTracks(rows) : null), [rows]);

  const outcomes = useMemo(
    () => (tracks ? countOutcomes(tracks) : { resolved: 0, 'still-failing': 0, worsened: 0 }),
    [tracks],
  );

  const windowMs = useMemo(() => {
    if (!tracks || tracks.length === 0) return null;
    return Date.now() - Math.min(...tracks.map((t) => t.firstSeen));
  }, [tracks]);

  const readings = useMemo(() => {
    if (!rows || rows.length === 0) return 0;
    return new Set(rows.map((r) => r.t)).size;
  }, [rows]);

  return { tracks, outcomes, windowMs, readings };
}

/**
 * Stations nobody is fixing.
 *
 * A station that was flagged, is still flagged, and has been flagged for a
 * while is the thing a dispatch board is worst at surfacing — it never reaches
 * the top of a worst-first list if something else is always worse, so it sits
 * there being everyone's second priority forever.
 *
 * Ranked by how long it has been failing, then by how much worse it has got.
 */
export interface StuckStation {
  track: Track;
  /** Minutes between first sighting and the latest reading. */
  minutesFailing: number;
  /** True when it is not merely stuck but actively deteriorating. */
  deteriorating: boolean;
}

export function stuckStations(tracks: Track[], minMinutes = 5): StuckStation[] {
  return tracks
    .filter((t) => t.outcome !== 'resolved' && t.currentScore >= NEEDS_TRUCK_THRESHOLD)
    .map((t) => ({
      track: t,
      minutesFailing: Math.max(1, Math.round((t.lastSeen - t.firstSeen) / 60_000)),
      deteriorating: t.outcome === 'worsened',
    }))
    .filter((s) => s.minutesFailing >= minMinutes)
    .sort((a, b) => {
      if (a.deteriorating !== b.deteriorating) return a.deteriorating ? -1 : 1;
      if (b.minutesFailing !== a.minutesFailing) return b.minutesFailing - a.minutesFailing;
      return b.track.currentScore - a.track.currentScore;
    });
}
