import type { ScoredStation } from '../model/summary';
import { laneOf } from '../model/triage';
import { bikesAt, docksAt, summarize, summarizeDocks } from '../sim/fleet';
import type { Borough } from './boroughs';

/**
 * Where a mechanic or a swap van should go.
 *
 * The Rebalancing board answers "where does the next *vehicle* go" and deliberately
 * excludes hardware — a vehicle full of bikes cannot fix a dead dock. That was
 * always right, and it left the opposite question unanswered: two real fields
 * in the feed, `num_docks_disabled` and `num_bikes_disabled`, were parsed on
 * every poll and read by exactly one tooltip.
 *
 * This is the counterpart ranking. Same shape of answer, different vehicle.
 *
 * ## What is real here and what is not
 *
 * The three counts are the operator's own. Dead docks and broken bikes come
 * straight from the feed. Low-charge e-bikes come from the simulated charge
 * model — labelled as such wherever it is shown — but even that is bounded by a
 * real number, since it can never exceed the e-bikes the feed says are present.
 *
 * ## Why unverified stations are excluded
 *
 * Their counts are exactly what the app has already decided not to trust, and
 * ranking repair work by numbers the board refuses to score on would send
 * somebody to a site on the strength of an hour-old reading. They have their own
 * screen, and a silent station is a power or comms job rather than a dock one.
 */

export type HardwareRank = 'docks' | 'bikes' | 'charge';

export const HARDWARE_RANK_LABEL: Record<HardwareRank, string> = {
  docks: 'Dead docks',
  bikes: 'Broken bikes',
  charge: 'Low battery',
};

export interface HardwareLoad {
  stationId: string;
  name: string;
  borough: Borough;
  /** Docks the operator reports out of service. Real. */
  deadDocks: number;
  /** Bikes the operator reports disabled. Real. */
  brokenBikes: number;
  /** Rideable e-bikes modelled below the swap threshold. Simulated. */
  lowCharge: number;
  /** E-bikes present, from the feed — the ceiling on `lowCharge`. */
  ebikes: number;
  /** Every physical dock accounted for at this site. */
  totalDocks: number;
  /** Dead docks over total docks, or null where the site reports none. */
  deadShare: number | null;
  /** Dead docks whose modelled fault is site-wide power or comms. */
  siteFaults: number;
  /** The station's urgency, where it has one — for cross-referencing the queue. */
  score: number | null;
}

/**
 * One pass over the network, keeping only sites with something wrong.
 *
 * `nowMs` is threaded through rather than read inside so the charge model stays
 * testable and every row on one render shares a clock.
 */
export function hardwareLoad(scored: ScoredStation[], nowMs: number): HardwareLoad[] {
  const out: HardwareLoad[] = [];

  for (const entry of scored) {
    if (laneOf(entry.breakdown) === 'unverified') continue;

    const { station } = entry;
    const { status } = station;

    const deadDocks = Math.max(0, status.docksDisabled);
    const brokenBikes = Math.max(0, status.bikesDisabled);

    // Only pay for the simulation where there are e-bikes to have a charge.
    const lowCharge =
      status.ebikesAvailable > 0
        ? summarize(bikesAt(status, nowMs), status.stationId).lowCharge
        : 0;

    if (deadDocks === 0 && brokenBikes === 0 && lowCharge === 0) continue;

    const dockStats = summarizeDocks(docksAt(status));

    out.push({
      stationId: station.stationId,
      name: station.name,
      borough: station.borough,
      deadDocks,
      brokenBikes,
      lowCharge,
      ebikes: status.ebikesAvailable,
      totalDocks: dockStats.total,
      deadShare: dockStats.total > 0 ? deadDocks / dockStats.total : null,
      siteFaults: dockStats.siteFaults,
      score: entry.breakdown.scored ? entry.breakdown.score : null,
    });
  }

  return out;
}

/**
 * Ranked by the column asked for, then by the other two.
 *
 * Lexicographic rather than a weighted composite on purpose. A single "hardware
 * score" would need three invented weights nobody could argue with, and this
 * app already carries one scoring model whose every constant it has to justify.
 * Picking a column and breaking ties predictably says the same thing and claims
 * nothing.
 */
export function rankHardware(rows: HardwareLoad[], by: HardwareRank): HardwareLoad[] {
  const order: Record<HardwareRank, (r: HardwareLoad) => number[]> = {
    docks: (r) => [r.deadDocks, r.deadShare ?? 0, r.brokenBikes, r.lowCharge],
    bikes: (r) => [r.brokenBikes, r.deadDocks, r.lowCharge],
    charge: (r) => [r.lowCharge, r.ebikes, r.brokenBikes],
  };

  const key = order[by];
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) {
      const diff = (kb[i] ?? 0) - (ka[i] ?? 0);
      if (diff !== 0) return diff;
    }
    // Stable last resort, so a repoll cannot shuffle equal rows.
    return a.name.localeCompare(b.name);
  });
}

export interface HardwareTotals {
  stations: number;
  deadDocks: number;
  brokenBikes: number;
  lowCharge: number;
  /** Sites where most of the rack is out — a rebuild, not a repair. */
  crippled: number;
  siteFaults: number;
}

/** Above this share of docks dead, a station is effectively gone. */
export const CRIPPLED_SHARE = 0.5;

export function hardwareTotals(rows: HardwareLoad[]): HardwareTotals {
  return {
    stations: rows.length,
    deadDocks: rows.reduce((n, r) => n + r.deadDocks, 0),
    brokenBikes: rows.reduce((n, r) => n + r.brokenBikes, 0),
    lowCharge: rows.reduce((n, r) => n + r.lowCharge, 0),
    crippled: rows.filter((r) => (r.deadShare ?? 0) >= CRIPPLED_SHARE).length,
    siteFaults: rows.reduce((n, r) => n + r.siteFaults, 0),
  };
}
