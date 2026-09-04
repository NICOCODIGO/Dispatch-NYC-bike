/**
 * Outcome classification for the Verify screen.
 *
 * Every threshold here is a named constant, and the definitions shown to the
 * user are generated from those same constants. A verification screen that
 * hand-writes "within ±5" in prose while the code compares against something
 * else is worse than no verification screen at all.
 */

import { NEEDS_VEHICLE_THRESHOLD } from './score';
import type { Signal, StationCategory } from './score';
import type { SnapshotRow } from '../data/snapshots';

export type Outcome = 'resolved' | 'still-failing' | 'worsened';

/**
 * Points of score movement treated as noise rather than a trend.
 *
 * Scores drift by a couple of points as single bikes come and go, so a station
 * that reads 78 then 80 has not "worsened" in any sense a dispatcher cares
 * about. Five points is roughly one bike at a mid-sized station.
 */
export const OUTCOME_DELTA_TOLERANCE = 5;

export const OUTCOME_LABEL: Record<Outcome, string> = {
  resolved: 'Resolved',
  'still-failing': 'Still failing',
  worsened: 'Worsened',
};

/** Definitions rendered in the UI, written from the constants above. */
export const OUTCOME_DEFINITIONS: Record<Outcome, string> = {
  resolved: `Score dropped below the dispatch threshold (${NEEDS_VEHICLE_THRESHOLD}) since first flagged.`,
  'still-failing': `Still at or above ${NEEDS_VEHICLE_THRESHOLD}, and no more than ${OUTCOME_DELTA_TOLERANCE} points worse than the first reading.`,
  worsened: `Still at or above ${NEEDS_VEHICLE_THRESHOLD}, and rose more than ${OUTCOME_DELTA_TOLERANCE} points since first flagged.`,
};

/**
 * Resolved beats everything: dropping below the threshold is the outcome that
 * matters regardless of how the score got there. Above the threshold, only a
 * rise larger than the tolerance counts as worsening — a station that improved
 * but has not yet crossed the line is still simply failing.
 */
export function classifyOutcome(firstScore: number, currentScore: number): Outcome {
  if (currentScore < NEEDS_VEHICLE_THRESHOLD) return 'resolved';
  if (currentScore - firstScore > OUTCOME_DELTA_TOLERANCE) return 'worsened';
  return 'still-failing';
}

export interface Reading {
  t: number;
  score: number;
  category: StationCategory;
  signal: Signal;
  bikes: number | null;
  docks: number | null;
}

export interface Track {
  stationId: string;
  name: string;
  borough: string;
  readings: Reading[];
  scores: number[];
  firstScore: number;
  currentScore: number;
  delta: number;
  signal: Signal;
  category: StationCategory;
  outcome: Outcome;
  firstSeen: number;
  lastSeen: number;
}

/** Sort order: open work first, and worst within that. */
const OUTCOME_RANK: Record<Outcome, number> = {
  worsened: 0,
  'still-failing': 1,
  resolved: 2,
};

/**
 * Folds raw snapshot rows into one track per station.
 *
 * A station appears here only if it was flagged at some point this session; the
 * comparison runs from the first reading at which it was flagged, not from
 * whenever we happened to start recording it.
 */
export function buildTracks(rows: SnapshotRow[]): Track[] {
  const byStation = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const list = byStation.get(row.stationId);
    if (list) list.push(row);
    else byStation.set(row.stationId, [row]);
  }

  const tracks: Track[] = [];

  for (const [stationId, list] of byStation) {
    list.sort((a, b) => a.t - b.t);
    const firstFlaggedIdx = list.findIndex((r) => r.needsVehicle);
    if (firstFlaggedIdx === -1) continue;

    // Only readings from the moment it was first flagged onward are evidence
    // about whether flagging it was right.
    const window = list.slice(firstFlaggedIdx);
    const first = window[0]!;
    const last = window[window.length - 1]!;

    tracks.push({
      stationId,
      name: last.name,
      borough: last.borough,
      readings: window.map((r) => ({
        t: r.t,
        score: r.score,
        category: r.category,
        signal: r.signal,
        bikes: r.bikes ?? null,
        docks: r.docks ?? null,
      })),
      scores: window.map((r) => r.score),
      firstScore: first.score,
      currentScore: last.score,
      delta: last.score - first.score,
      signal: last.signal,
      category: last.category,
      outcome: classifyOutcome(first.score, last.score),
      firstSeen: first.t,
      lastSeen: last.t,
    });
  }

  return tracks.sort(
    (a, b) => OUTCOME_RANK[a.outcome] - OUTCOME_RANK[b.outcome] || b.currentScore - a.currentScore,
  );
}

export function countOutcomes(tracks: Track[]): Record<Outcome, number> {
  const counts: Record<Outcome, number> = { resolved: 0, 'still-failing': 0, worsened: 0 };
  for (const t of tracks) counts[t.outcome]++;
  return counts;
}

// ---------------------------------------------------------------------------
// Is the network getting better?
// ---------------------------------------------------------------------------

/**
 * Share of everything flagged this session that has come back below the line.
 *
 * The verdict is the ratio, not the raw count: two recoveries out of three is a
 * network being managed, two out of forty is a network being watched.
 *
 * Null — not zero — when nothing has been flagged yet. A fresh session has no
 * evidence either way, and rendering that as 0% would read as total failure at
 * the exact moment the board knows nothing.
 *
 * This counts stations, not dispatches, so it includes the ones that recovered
 * on their own; riders rebalance the network all day without being asked. It is
 * therefore *not* the `recovery rate` on the Dispatch History screen, which
 * divides recovered runs by completed runs and is strictly about whether our
 * own vehicles worked. Two honest numbers, two different questions, and they are
 * deliberately not given the same name anywhere in the UI.
 */
export function recoveryRate(counts: Record<Outcome, number>): number | null {
  const flagged = counts.resolved + counts['still-failing'] + counts.worsened;
  return flagged > 0 ? counts.resolved / flagged : null;
}

/**
 * Bands for that share.
 *
 * Named here because two screens draw a verdict from it — the queue's Cleared
 * card and the Analytics finding — and a board that calls 38% "weak" in one
 * place and "healthy" in another has undermined both. The card shows the ratio
 * as a count rather than a percentage; the band it is coloured by is this one. The numbers themselves
 * are judgement, not measurement: recovering under a sixth of what you flagged
 * is a network nobody is managing, and clearing over 40% while new failures
 * keep arriving is a good shift.
 */
export const RECOVERY_HEALTHY = 0.4;
export const RECOVERY_WEAK = 0.15;

export type RecoveryBand = 'unknown' | 'poor' | 'weak' | 'healthy';

export function recoveryBand(share: number | null): RecoveryBand {
  if (share === null) return 'unknown';
  if (share >= RECOVERY_HEALTHY) return 'healthy';
  if (share >= RECOVERY_WEAK) return 'weak';
  return 'poor';
}
