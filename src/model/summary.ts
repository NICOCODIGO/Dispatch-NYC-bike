/**
 * Network-level derivations: the status strip numbers and the failure
 * breakdown. The one-line situation readout that heads the Queue is built from
 * these in `src/model/situation.ts`.
 *
 * Everything here is computed from the *vehicle lane* unless explicitly named
 * otherwise. The board's headline question is "where does the vehicle go", so a
 * broken dock must not inflate the number a dispatcher plans their shift
 * around. Mechanic and unverified counts are reported separately, never folded
 * into the vehicle total.
 */

import type { JoinedStation } from '../data/gbfs';
import type { Borough } from '../data/boroughs';
import {
  CATEGORY_LABEL,
  type ScoreBreakdown,
  type Signal,
  type StationCategory,
  scoreStation,
} from './score';
import { QUIET_CATEGORIES, VEHICLE_CATEGORIES, triage, type Triaged } from './triage';

export interface ScoredStation {
  station: JoinedStation;
  breakdown: ScoreBreakdown;
}

export interface NetworkSummary {
  /** Every station the feed described. */
  total: number;
  /** Stations that were actually ranked (installed). */
  ranked: number;

  /** Vehicle-lane stations at or above the threshold — the shift's workload. */
  needsVehicle: number;
  /** Every vehicle-lane station, including those below the threshold. */
  vehicleLane: number;
  /** Of `needsVehicle`, which way they are failing. */
  emptySide: number;
  fullSide: number;

  /** Routed elsewhere. Never part of the vehicle numbers. */
  mechanic: number;
  unverified: number;
  notInstalled: number;

  bikesAvailable: number;
  usableSlots: number;
  /** Bikes as a share of usable slots across the whole network, 0-1. */
  networkFill: number | null;

  categoryCounts: Record<StationCategory, number>;
  /** The larger failure side among flagged vehicle-lane stations. */
  dominant: { signal: Signal; count: number; share: number } | null;
  /** The single worst vehicle-actionable station — where the first vehicle goes. */
  worstVehicle: { name: string; stationId: string; score: number } | null;
  /** Borough holding the most of the ten worst flagged vehicle-lane stations. */
  worstTen: { borough: Borough; count: number } | null;
}

const EMPTY_COUNTS = (): Record<StationCategory, number> => ({
  not_installed: 0,
  unusable: 0,
  outage: 0,
  empty: 0,
  full: 0,
  starving: 0,
  flooded: 0,
  healthy: 0,
});

/** Scores every station and returns them sorted worst-first. */
export function scoreNetwork(
  stations: JoinedStation[],
  now: number,
  p90Capacity: number,
): ScoredStation[] {
  return stations
    .map((station) => ({
      station,
      breakdown: scoreStation(station, station.status, now, p90Capacity),
    }))
    .sort(compareByUrgency);
}

/** Worst first. Ties break on capacity, then name, so order is stable across
 *  refreshes and the FLIP animation never shuffles identical rows. */
export function compareByUrgency(a: ScoredStation, b: ScoredStation): number {
  if (b.breakdown.score !== a.breakdown.score) return b.breakdown.score - a.breakdown.score;
  if (b.station.capacity !== a.station.capacity) return b.station.capacity - a.station.capacity;
  return a.station.name.localeCompare(b.station.name);
}

export function summarize(scored: ScoredStation[], lanes: Triaged): NetworkSummary {
  const categoryCounts = EMPTY_COUNTS();
  let ranked = 0;
  let bikesAvailable = 0;
  let usableSlots = 0;

  for (const { station, breakdown } of scored) {
    categoryCounts[breakdown.category]++;
    if (breakdown.scored) {
      ranked++;
      // Only count slots for stations that are part of the network; an
      // uninstalled station skews network fill for no reason.
      bikesAvailable += station.status.bikesAvailable;
      usableSlots += station.usableSlots;
    }
  }

  // The workload numbers come from the vehicle lane only.
  const flagged = lanes.vehicle.filter((s) => s.breakdown.needsVehicle);
  let emptySide = 0;
  let fullSide = 0;
  for (const s of flagged) {
    if (s.breakdown.signal === 'empty') emptySide++;
    else if (s.breakdown.signal === 'full') fullSide++;
  }

  const dominant =
    flagged.length > 0 && (emptySide > 0 || fullSide > 0)
      ? fullSide >= emptySide
        ? { signal: 'full' as Signal, count: fullSide, share: fullSide / flagged.length }
        : { signal: 'empty' as Signal, count: emptySide, share: emptySide / flagged.length }
      : null;

  const worst = lanes.vehicle[0];
  const worstVehicle = worst
    ? {
        name: worst.station.name,
        stationId: worst.station.stationId,
        score: worst.breakdown.score,
      }
    : null;

  // Which borough owns the worst ten a vehicle can actually fix. This is the
  // clause a dispatcher routes on.
  const boroughTally = new Map<Borough, number>();
  for (const s of flagged.slice(0, 10)) {
    boroughTally.set(s.station.borough, (boroughTally.get(s.station.borough) ?? 0) + 1);
  }
  let worstTen: NetworkSummary['worstTen'] = null;
  for (const [borough, count] of boroughTally) {
    if (!worstTen || count > worstTen.count) worstTen = { borough, count };
  }

  return {
    total: scored.length,
    ranked,
    needsVehicle: flagged.length,
    vehicleLane: lanes.vehicle.length,
    emptySide,
    fullSide,
    mechanic: lanes.mechanic.length,
    unverified: lanes.unverified.length,
    notInstalled: categoryCounts.not_installed,
    bikesAvailable,
    usableSlots,
    networkFill: usableSlots > 0 ? bikesAvailable / usableSlots : null,
    categoryCounts,
    dominant,
    worstVehicle,
    worstTen,
  };
}

/** Convenience for callers that have the scored list but not the lanes. */
export function summarizeAll(scored: ScoredStation[]): NetworkSummary {
  return summarize(scored, triage(scored));
}

// The one-line situation readout moved to `src/model/situation.ts`, which ranks
// the network's state by severity rather than always leading with the vehicle
// workload. This module keeps the counts it draws from.

// ---------------------------------------------------------------------------
// Failure-mode rail
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  category: StationCategory;
  label: string;
  count: number;
  /** Share of the vehicle lane, 0-1 — the denominator the bar is drawn against. */
  share: number;
}

/**
 * The rail's primary block: how the vehicle-actionable work breaks down.
 * Denominated against the vehicle lane, not the whole network, so the bars
 * compare like with like.
 */
export function vehicleBreakdown(s: NetworkSummary): BreakdownRow[] {
  const denom = s.vehicleLane || 1;
  return VEHICLE_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    count: s.categoryCounts[category],
    share: s.categoryCounts[category] / denom,
  }));
}

/** The rail's tertiary block: everything that needs nobody. */
export function quietBreakdown(s: NetworkSummary): BreakdownRow[] {
  const denom = s.ranked || 1;
  return QUIET_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    count: s.categoryCounts[category],
    share: s.categoryCounts[category] / denom,
  }));
}
