/**
 * Outcome classification for the Verify screen.
 *
 * Every threshold here is a named constant, and the definitions shown to the
 * user are generated from those same constants. A verification screen that
 * hand-writes "within ±5" in prose while the code compares against something
 * else is worse than no verification screen at all.
 */

import { NEEDS_TRUCK_THRESHOLD } from './score';
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
  resolved: `Score dropped below the truck threshold (${NEEDS_TRUCK_THRESHOLD}) since first flagged.`,
  'still-failing': `Still at or above ${NEEDS_TRUCK_THRESHOLD}, and no more than ${OUTCOME_DELTA_TOLERANCE} points worse than the first reading.`,
  worsened: `Still at or above ${NEEDS_TRUCK_THRESHOLD}, and rose more than ${OUTCOME_DELTA_TOLERANCE} points since first flagged.`,
};

/**
 * Resolved beats everything: dropping below the threshold is the outcome that
 * matters regardless of how the score got there. Above the threshold, only a
 * rise larger than the tolerance counts as worsening — a station that improved
 * but has not yet crossed the line is still simply failing.
 */
export function classifyOutcome(firstScore: number, currentScore: number): Outcome {
  if (currentScore < NEEDS_TRUCK_THRESHOLD) return 'resolved';
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
    const firstFlaggedIdx = list.findIndex((r) => r.needsTruck);
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
