import type { ScoredStation } from '../model/summary';
import { vehicleAction } from './insights';
import { distanceKm } from './fleet';

/**
 * Swap pairs — the fix that needs no depot.
 *
 * The Rebalancing table ranks one station at a time and its answer is always
 * "send a vehicle from the yard". It structurally cannot surface the case where
 * the bikes a starved station needs are already sitting 300 m away at an
 * overfull one: that is a relationship between two rows, and a ranked list has
 * no row for a relationship.
 *
 * A pair here is one full-side station and one empty-side station, both already
 * over the dispatch threshold, close enough that a single short hop drains one
 * problem into the other. The move is `min(collect, drop)` bikes — whichever
 * side runs out first bounds it.
 *
 * Pure and tested. Distance is great-circle, not driven: 500 m straight line is
 * "same few blocks" at the granularity this decision needs, and the map draws
 * the literal line between the two dots anyway.
 */

/** Straight-line metres within which two stations count as walkable neighbours. */
export const SWAP_RADIUS_M = 500;

export interface SwapPair {
  /** Full-side station — bikes come off here. */
  from: ScoredStation;
  /** Empty-side station — bikes go on here. */
  to: ScoredStation;
  /** Bikes the hop moves: the smaller of the two stations' needs. */
  bikes: number;
  /** Straight-line separation, rounded metres. */
  meters: number;
}

/**
 * Every full↔empty pairing inside `radiusM`, worst surplus first.
 *
 * Greedy rather than a global assignment solve: the worst full-side station
 * claims its nearest unclaimed empty-side partner, and that partner is removed
 * from the pool so two pairs never point at the same station. A dispatcher
 * overrides half of these anyway, and "the big surplus went to its closest
 * deficit" is a pairing whose logic they can follow at a glance.
 */
export function findSwapPairs(
  vehicleLane: ScoredStation[],
  radiusM: number = SWAP_RADIUS_M,
): SwapPair[] {
  const fulls: { s: ScoredStation; bikes: number }[] = [];
  const empties: { s: ScoredStation; bikes: number }[] = [];

  for (const s of vehicleLane) {
    if (!s.breakdown.needsVehicle) continue;
    const act = vehicleAction(s.breakdown);
    if (act.kind === 'collect' && act.bikes > 0) fulls.push({ s, bikes: act.bikes });
    else if (act.kind === 'drop' && act.bikes > 0) empties.push({ s, bikes: act.bikes });
  }

  fulls.sort((a, b) => b.s.breakdown.score - a.s.breakdown.score);

  const claimed = new Set<string>();
  const pairs: SwapPair[] = [];

  for (const full of fulls) {
    let best: { partner: ScoredStation; need: number; meters: number } | null = null;

    for (const empty of empties) {
      if (claimed.has(empty.s.station.stationId)) continue;
      const meters =
        distanceKm(
          full.s.station.lat,
          full.s.station.lon,
          empty.s.station.lat,
          empty.s.station.lon,
        ) * 1000;
      if (meters > radiusM) continue;
      if (!best || meters < best.meters) {
        best = { partner: empty.s, need: empty.bikes, meters };
      }
    }

    if (!best) continue;
    claimed.add(best.partner.station.stationId);
    pairs.push({
      from: full.s,
      to: best.partner,
      bikes: Math.min(full.bikes, best.need),
      meters: Math.round(best.meters),
    });
  }

  return pairs;
}
