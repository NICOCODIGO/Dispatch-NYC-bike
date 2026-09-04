import { NEEDS_VEHICLE_THRESHOLD } from '../model/score';
import { OUTCOME_DELTA_TOLERANCE } from '../model/verify';
import type { StationRow } from './stationRow';

/**
 * Did the vehicle we sent actually fix anything?
 *
 * Dispatch used to record intent and then go silent — the row was marked, the
 * log had a line, and nothing ever came back. A board that can issue orders
 * but cannot tell you whether they worked is a board that cannot be argued
 * with, and one nobody will trust for long.
 *
 * A run captures the station at the moment of dispatch, captures it again when
 * the crew reports done (or the ETA lapses), and compares. That gives two
 * things the network-wide recovery rate cannot: per-station cause and effect,
 * and a realization rate per vehicle — how much of what you ordered actually
 * moved.
 */

export type RunOutcome = 'recovered' | 'partial' | 'no-change' | 'worse';

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  recovered: 'Recovered',
  partial: 'Partial',
  'no-change': 'No change',
  worse: 'Worse',
};

export const OUTCOME_MEANING: Record<RunOutcome, string> = {
  recovered: `Back below the ${NEEDS_VEHICLE_THRESHOLD}-point dispatch threshold. The trip did what it was for.`,
  partial: 'Bikes moved and the station improved, but it is still over the threshold.',
  'no-change': 'Barely any bikes moved. Either the crew could not access it, or demand undid the work as fast as it was done.',
  worse: 'The station scores higher than when the vehicle was sent. Riders outpaced the delivery, or it was the wrong call.',
};

/** How long a run is assumed to take before it is treated as finished. */
export const DEFAULT_ETA_MINUTES = 15;

/** Below this share of the order, nothing meaningful moved. */
const PARTIAL_FLOOR = 0.25;

export interface RunSnapshot {
  score: number | null;
  bikes: number | null;
  openDocks: number | null;
  /** 0–1. */
  fill: number | null;
  minutesFailing: number | null;
}

export interface DispatchRun {
  id: string;
  vehicleId: string;
  depot: string;
  stationId: string;
  stationName: string;
  borough: string;
  kind: 'drop' | 'collect';
  /** Bikes the coordinator asked for. */
  ordered: number;
  sentAt: number;
  etaMinutes: number;
  before: RunSnapshot;
  completedAt: number | null;
  after: RunSnapshot | null;
  /** True when nobody confirmed — the ETA simply lapsed. */
  auto: boolean;
}

export function snapshotOf(row: StationRow): RunSnapshot {
  return {
    score: row.score,
    bikes: row.bikes,
    openDocks: row.openDocks ?? null,
    fill: row.fill,
    minutesFailing: row.duration?.confident ? row.duration.minutes : null,
  };
}

export function isOverdue(run: DispatchRun, now = Date.now()): boolean {
  return run.completedAt === null && now >= run.sentAt + run.etaMinutes * 60_000;
}

export function elapsedMinutes(run: DispatchRun, now = Date.now()): number {
  return Math.max(0, Math.round(((run.completedAt ?? now) - run.sentAt) / 60_000));
}

/**
 * Bikes that actually moved in the ordered direction.
 *
 * Clamped at zero: if a station gained bikes while a vehicle was collecting,
 * that is riders arriving, not a vehicle delivering in reverse.
 */
export function bikesMoved(run: DispatchRun): number | null {
  if (!run.after || run.before.bikes === null || run.after.bikes === null) return null;
  const delta =
    run.kind === 'collect' ? run.before.bikes - run.after.bikes : run.after.bikes - run.before.bikes;
  return Math.max(0, delta);
}

/** Share of the order that moved. Can exceed 1 when the crew did extra. */
export function realization(run: DispatchRun): number | null {
  const moved = bikesMoved(run);
  if (moved === null || run.ordered <= 0) return null;
  return moved / run.ordered;
}

export function outcomeOf(run: DispatchRun): RunOutcome | null {
  if (!run.after) return null;

  const before = run.before.score;
  const after = run.after.score;
  if (after === null) return 'no-change';

  if (after < NEEDS_VEHICLE_THRESHOLD) return 'recovered';
  if (before !== null && after > before + OUTCOME_DELTA_TOLERANCE) return 'worse';

  const share = realization(run);
  return share !== null && share >= PARTIAL_FLOOR ? 'partial' : 'no-change';
}

/** "93 → 41 · collected 34 of 37 · 22m" */
export function runSummary(run: DispatchRun): string | null {
  if (!run.after) return null;
  const moved = bikesMoved(run);
  const verb = run.kind === 'collect' ? 'collected' : 'delivered';
  const scores =
    run.before.score !== null && run.after.score !== null
      ? `${run.before.score} → ${run.after.score}`
      : 'score unknown';
  const qty = moved === null ? 'movement unknown' : `${verb} ${moved} of ${run.ordered}`;
  return `${scores} · ${qty} · ${elapsedMinutes(run)}m`;
}

/* ---------------------------------------------------------------------------
   Rollups.
--------------------------------------------------------------------------- */

export interface RunStats {
  runs: number;
  completed: number;
  recovered: number;
  ordered: number;
  moved: number;
  /** moved / ordered across completed runs. Null with nothing to divide. */
  realization: number | null;
  /** recovered / completed. */
  recoveryRate: number | null;
}

function accumulate(runs: DispatchRun[]): RunStats {
  let completed = 0;
  let recovered = 0;
  let ordered = 0;
  let moved = 0;

  for (const r of runs) {
    if (!r.after) continue;
    completed++;
    if (outcomeOf(r) === 'recovered') recovered++;
    ordered += r.ordered;
    moved += bikesMoved(r) ?? 0;
  }

  return {
    runs: runs.length,
    completed,
    recovered,
    ordered,
    moved,
    realization: ordered > 0 ? moved / ordered : null,
    recoveryRate: completed > 0 ? recovered / completed : null,
  };
}

function groupBy(runs: DispatchRun[], key: (r: DispatchRun) => string): Record<string, RunStats> {
  const groups = new Map<string, DispatchRun[]>();
  for (const r of runs) {
    const k = key(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return Object.fromEntries([...groups.entries()].map(([k, v]) => [k, accumulate(v)]));
}

export const statsByVehicle = (runs: DispatchRun[]) => groupBy(runs, (r) => r.vehicleId);
export const statsByDepot = (runs: DispatchRun[]) => groupBy(runs, (r) => r.depot);
export const statsOverall = accumulate;

/** The most recent run for a station, in flight or finished. */
export function latestRunFor(runs: DispatchRun[], stationId: string): DispatchRun | null {
  let best: DispatchRun | null = null;
  for (const r of runs) {
    if (r.stationId !== stationId) continue;
    if (!best || r.sentAt > best.sentAt) best = r;
  }
  return best;
}
