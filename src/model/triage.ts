/**
 * Triage: which crew can actually fix this station?
 *
 * The score answers "how bad is it". It does not answer "who do I send", and
 * conflating the two put broken docks at the top of a rebalancing queue — a
 * vehicle full of bikes cannot fix a dead station, so the board's single most
 * prominent answer was useless.
 *
 * Routing happens *after* scoring and never modifies it. `score.ts` is
 * untouched: a station's urgency is the same number it always was, it is simply
 * shown to the crew that can act on it.
 */

import type { ScoreBreakdown, StationCategory } from './score';
import type { ScoredStation } from './summary';

export type Lane =
  /** Empty, Full, Starving, Flooded — a vehicle fixes these by moving bikes. */
  | 'vehicle'
  /** Outage, Unusable — mechanical failure; a vehicle is the wrong vehicle. */
  | 'mechanic'
  /** Counts too old to act on. Scored, but the score is not evidence. */
  | 'unverified'
  /** Healthy or not installed — nothing to dispatch. */
  | 'quiet';

/** The categories a vehicle can actually resolve, worst-first. */
export const VEHICLE_CATEGORIES: readonly StationCategory[] = [
  'empty',
  'full',
  'starving',
  'flooded',
];

/** Shown in the rail for context, and selectable to inspect them. */
export const QUIET_CATEGORIES: readonly StationCategory[] = ['healthy', 'not_installed'];

/**
 * Lane assignment, in priority order.
 *
 * Staleness outranks everything for a reason: an "Unusable" verdict is derived
 * from bike and dock counts, so if those counts cannot be trusted then neither
 * can the verdict. Routing a stale record to the mechanic queue would be
 * dispatching a technician on the strength of a reading we have already
 * admitted is worthless.
 */
export function laneOf(b: ScoreBreakdown): Lane {
  if (!b.scored) return 'quiet';
  if (b.staleness.notReporting) return 'unverified';
  if (b.signal === 'outage') return 'mechanic';
  if (b.category === 'healthy') return 'quiet';
  return 'vehicle';
}

export interface Triaged {
  /** Vehicle-actionable, worst-first. This is the ranked queue. */
  vehicle: ScoredStation[];
  mechanic: ScoredStation[];
  unverified: ScoredStation[];
  quiet: ScoredStation[];
}

/** Splits an already-sorted list into lanes, preserving order within each. */
export function triage(scored: ScoredStation[]): Triaged {
  const out: Triaged = { vehicle: [], mechanic: [], unverified: [], quiet: [] };
  for (const s of scored) out[laneOf(s.breakdown)].push(s);
  return out;
}

/** Plain-English statement of what is broken, for the mechanic list. */
export function mechanicFault(s: ScoredStation): string {
  const { isRenting, isReturning } = s.station.status;
  if (!isRenting && !isReturning) return 'Not renting or returning';
  if (!isRenting) return 'Rentals closed';
  if (!isReturning) return 'Returns closed';
  if (s.breakdown.fill.usableSlots === 0) return 'Reports no usable slots';
  return 'Out of service';
}

/** Why a station's counts are not trusted, for the unverified list. */
export function unverifiedReason(s: ScoredStation): string {
  return s.breakdown.staleness.ageMinutes === null
    ? 'Never reported'
    : 'Report too old to act on';
}
