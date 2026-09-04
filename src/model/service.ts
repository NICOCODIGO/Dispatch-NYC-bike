/**
 * Service level: how much of the network a rider can actually use right now,
 * and the line below which that is not good enough.
 *
 * Shown on the board as "Service performance" — the card is named for what a
 * dispatcher is being asked to judge, this module for what is being counted.
 * It is the only headline number on the queue where a higher value is better;
 * every other card counts something broken.
 *
 * Every other number on this board counts work *outstanding* — 638 stations
 * need a vehicle, 5 have gone silent. None of them answer the question a shift
 * actually turns on: is the network in acceptable shape, and how far off is it?
 * A backlog with no target cannot be finished, only survived. It gives a
 * dispatcher no way to decide that today went well, and no way to decide what
 * to leave alone — which matters, because leaving things alone is most of the
 * job. There are always more broken stations than vehicles.
 *
 * ## What counts as served
 *
 * A rider can take a bike here, and a rider can park one here. That is the
 * whole definition. It reads the feed's own counts and flags and nothing else.
 *
 * Deliberately *not* derived from the score. If "acceptable" meant "scores
 * below the dispatch threshold", then a tuning pass on capacity weight would
 * silently redefine acceptable service network-wide, and the target would drift
 * every time somebody adjusted a constant it has nothing to do with. Same
 * reasoning that keeps CRITICAL_THRESHOLD from being defined as
 * NEEDS_VEHICLE_THRESHOLD + 15: they answer different questions, so they should
 * be free to be wrong separately.
 *
 * A station holding forty bikes with rentals switched off is not serving
 * anybody, so the operator flags count. The counts say the bikes are there; the
 * operator says nobody may take one. A number named for what a rider can do has
 * to believe the flag.
 *
 * ## What is measured
 *
 * Installed stations that are currently reporting. Silent stations are excluded
 * rather than assumed good or assumed bad — their counts are exactly what this
 * measure would have to read, and the board has already decided those counts
 * are not evidence. They are reported separately so the denominator can never
 * quietly shrink without saying so.
 */

import type { StationStatus } from '../data/gbfs';
import type { ScoredStation } from './summary';

/**
 * The share of reporting stations that must be usable for the network to be
 * called healthy.
 *
 * A policy dial, not a measurement — there is no derivation that produces 90%,
 * and pretending otherwise would be the kind of undisclosed constant the
 * Explain screen exists to prevent. It is set where clearing the gap is a
 * shift's work rather than a fantasy: high enough that meeting it means the
 * city is genuinely served, low enough that a dispatcher can actually get
 * there and stop.
 *
 * Calibrated against the live feed rather than picked round. On 3 Sep 2026 the
 * network read 87.8% — 2,117 of 2,412 reporting stations usable, with 205 out
 * of docks and 96 out of bikes. That puts the gap at 54 stations: a real
 * shift's work, and close enough that the target line lands inside the queue
 * where a dispatcher can see it. A target of 85% would already be met and the
 * feature would be inert; 95% would put the line 175 stations down and make it
 * scenery. Both failure modes are quiet ones, which is why the number that
 * produced this value is written down here.
 *
 * This is the number to change when ops policy changes, and it is the only
 * place the comparison is made.
 */
export const SERVICE_TARGET = 0.9;

/** A rider can both take a bike and leave one. */
export function isServing(status: StationStatus): boolean {
  return (
    status.isInstalled &&
    status.isRenting &&
    status.bikesAvailable > 0 &&
    status.isReturning &&
    status.docksAvailable > 0
  );
}

/**
 * How far below target still reads as "close".
 *
 * Expressed as a distance from {@link SERVICE_TARGET} rather than as a fixed
 * 80%, because the whole meaning of the colour is *how far from target*. Pin
 * the bands to absolute numbers and raising the target to 95% would leave the
 * card showing green at 90% while the queue below it says the network is 120
 * stations short — a green headline sitting on top of a red instruction. This
 * board has made that mistake before, in the other direction: a big red score
 * printed above the words "no vehicle needed yet".
 *
 * With the target at 90%: green at 90 and up, amber from 80, red below 80.
 */
export const SERVICE_WARN_MARGIN = 0.1;

export type ServiceBand = 'unknown' | 'poor' | 'fair' | 'good';

export function serviceBand(level: number | null): ServiceBand {
  if (level === null) return 'unknown';
  if (level >= SERVICE_TARGET) return 'good';
  if (level >= SERVICE_TARGET - SERVICE_WARN_MARGIN) return 'fair';
  return 'poor';
}

export interface ServiceLevel {
  /** Reporting, installed stations a rider can use. */
  usable: number;
  /** The denominator: reporting, installed stations. */
  measured: number;
  /** Installed but silent, so deliberately outside the measurement. */
  unverified: number;
  /** usable / measured, or null when nothing is measurable. */
  level: number | null;
  /** The target this was compared against, carried so callers never re-read it. */
  target: number;
  /** Stations that must be restored to reach the target. 0 when it is met. */
  shortfall: number;
  meetsTarget: boolean;
}

export function serviceLevel(scored: ScoredStation[]): ServiceLevel {
  let usable = 0;
  let measured = 0;
  let unverified = 0;

  for (const { station, breakdown } of scored) {
    // Not installed is not part of the network, not a failure of it.
    if (!breakdown.scored) continue;
    if (breakdown.staleness.notReporting) {
      unverified++;
      continue;
    }
    measured++;
    if (isServing(station.status)) usable++;
  }

  // The shortfall is the comparison. `meetsTarget` is read off it rather than
  // computed as `level >= target`, so the headline and the count can never
  // disagree at the boundary the way two separate float comparisons can.
  const shortfall = Math.max(0, Math.ceil(SERVICE_TARGET * measured) - usable);

  return {
    usable,
    measured,
    unverified,
    level: measured > 0 ? usable / measured : null,
    target: SERVICE_TARGET,
    shortfall,
    meetsTarget: measured > 0 && shortfall === 0,
  };
}

/**
 * Where to draw the line on a worst-first queue: clear everything above it and
 * the network is at target.
 *
 * `restores[i]` says whether fixing the i-th row would put a station back into
 * service. Most rows do not — a station at 12% fill is uncomfortable but a
 * rider can still take a bike and still park one, so it is already counted as
 * served and moving bikes to it changes the service level by nothing. Only the
 * genuine failures move this number, which is exactly why the line lands where
 * it does rather than at row N of the ranking.
 *
 * Returns how many rows from the top must be cleared, or null when the target
 * is already met or cannot be reached from this list alone — a gap that a vehicle
 * cannot close (because the remaining failures need a mechanic, or are silent)
 * must not be drawn as though it could.
 */
export function targetCutIndex(
  restores: readonly boolean[],
  shortfall: number,
): number | null {
  if (shortfall <= 0) return null;

  let remaining = shortfall;
  for (let i = 0; i < restores.length; i++) {
    if (restores[i]) remaining--;
    if (remaining === 0) return i + 1;
  }
  return null;
}
