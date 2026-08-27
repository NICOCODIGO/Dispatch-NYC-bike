import type { StationStatus } from '../data/gbfs';

/**
 * Individual bikes, which the feed does not carry.
 *
 * GBFS is station-level arithmetic: twelve bikes here, three of them electric,
 * two of them broken. It never says *which* twelve. Everything an operator
 * actually touches — a numbered frame, a battery at 12%, a bike that has failed
 * inspection twice — lives in systems only the operator has.
 *
 * So this module invents them. The rule it holds to, and the reason it is a
 * simulation rather than decoration:
 *
 *   **Every invented set is sized by a real number from the live feed.**
 *
 * A station reporting 12 available, 3 electric, 2 disabled produces exactly 12
 * bikes, of which exactly 3 are electric and exactly 2 are flagged. The fiction
 * can elaborate what the feed leaves out; it can never disagree with what the
 * feed states. That keeps `bikesDisabled` and `ebikesAvailable` — two real
 * fields the app parses and had been using in one tooltip — load-bearing.
 *
 * ## Why it is deterministic
 *
 * The board repolls every 60 seconds. A random fleet would reshuffle every
 * frame: bike #38472 would cease to exist mid-shift, batteries would jump, and
 * nothing could be tracked or assigned. Identity is therefore derived from
 * `stationId` and the slot index through a seeded hash, so the same station
 * yields the same bikes on every poll, across reloads, in every tab.
 *
 * The one thing allowed to move is charge, which drifts down on a slow clock —
 * because a battery that never discharges is a worse lie than an invented one.
 */

/** Slot-stable identity. Charge is the only field that moves between polls. */
export interface Bike {
  /** Frame number, the way a mechanic would call it out. */
  id: string;
  kind: 'classic' | 'electric';
  /** 0–100 for an electric bike, null for a classic one. */
  charge: number | null;
  condition: BikeCondition;
  /** Which dock it is sitting in, 1-indexed for humans. */
  dock: number;
}

/**
 * `ok` and `flagged` are both rideable; `out-of-service` is not.
 *
 * The split matters because the feed only tells us a count of disabled bikes,
 * not how bad each one is. Treating every disabled bike as scrap would overstate
 * the repair backlog; treating none of them as scrap would understate it.
 */
export type BikeCondition = 'ok' | 'flagged' | 'out-of-service';

export const CONDITION_LABEL: Record<BikeCondition, string> = {
  ok: 'OK',
  flagged: 'Needs check',
  'out-of-service': 'Out of service',
};

/** Below this a bike is not worth leaving on the street for a rider to find. */
export const LOW_CHARGE = 25;

/** Charge lost per hour of standing time, before the dock is considered. */
const DRAIN_PER_HOUR = 1.4;

/**
 * A grid-connected dock charges what sits in it.
 *
 * Lyft has been connecting stations to mains power specifically to cut manual
 * battery swaps, so a fleet that only ever drains would model the *old* network.
 * Which stations are wired is not public, so it is drawn from the station id —
 * stable, roughly a third of the network, and labelled as invented wherever it
 * surfaces.
 */
const CHARGING_SHARE = 0.34;
const CHARGE_PER_HOUR = 9;

/* ---------------------------------------------------------------------------
   Deterministic noise.
--------------------------------------------------------------------------- */

/**
 * FNV-1a, then a couple of xorshift rounds.
 *
 * Any stable string hash would do. This one is short, has no dependency, and
 * avalanches well enough that adjacent slot indices do not produce visibly
 * adjacent bikes — which a plain `hash(id) + index` very much does.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Stable 0–1 for a named facet of a seed. */
function unit(seed: string, facet: string): number {
  return hash(`${seed}:${facet}`) / 0x100000000;
}

/* ---------------------------------------------------------------------------
   Building a station's fleet.
--------------------------------------------------------------------------- */

/**
 * The bikes standing at one station right now.
 *
 * Ordered by dock. The counts come from `status`; only the character of each
 * bike is invented.
 *
 * `nowMs` is a parameter rather than `Date.now()` so the charge model is
 * testable and so every row on one render shares a single clock — bikes whose
 * batteries disagreed by a few milliseconds would be a strange thing to ship.
 */
export function bikesAt(status: StationStatus, nowMs: number): Bike[] {
  const total = Math.max(0, status.bikesAvailable);
  const electric = Math.min(Math.max(0, status.ebikesAvailable), total);

  // The feed counts disabled bikes separately from available ones, so a station
  // can report more broken than present. Clamping keeps the invented list from
  // claiming bikes the feed never said were there.
  const broken = Math.min(Math.max(0, status.bikesDisabled), total);

  const bikes: Bike[] = [];
  for (let slot = 0; slot < total; slot += 1) {
    const seed = `${status.stationId}#${slot}`;

    // Electric bikes take the low slots and broken ones the high slots, so both
    // counts are exact. Which physical dock that implies is invented anyway;
    // what matters is that the totals reconcile with the feed.
    const kind: Bike['kind'] = slot < electric ? 'electric' : 'classic';
    const isBroken = slot >= total - broken;

    bikes.push({
      id: frameNumber(seed),
      kind,
      charge: kind === 'electric' ? chargeFor(seed, status, nowMs) : null,
      condition: isBroken ? conditionFor(seed) : 'ok',
      dock: slot + 1,
    });
  }
  return bikes;
}

/** Five digits, the shape Citi Bike prints on a frame. */
function frameNumber(seed: string): string {
  return `#${10_000 + Math.floor(unit(seed, 'frame') * 90_000)}`;
}

/**
 * Disabled bikes are split rather than all called scrap.
 *
 * The feed says two bikes are unavailable; it does not say whether that is a
 * flat tyre or a dead frame. Roughly a third are treated as genuinely out of
 * service and the rest as needing a look, which is the difference between a
 * depot job and a five-minute fix on the street.
 */
function conditionFor(seed: string): BikeCondition {
  return unit(seed, 'condition') < 0.34 ? 'out-of-service' : 'flagged';
}

/**
 * Charge, as a function of how long the bike has been standing.
 *
 * Anchored to `lastReportedMs` rather than to wall-clock alone: a station that
 * last spoke four hours ago has bikes that have been sitting four hours, and
 * tying the two together means the battery story and the staleness story cannot
 * contradict each other on the same row.
 */
function chargeFor(seed: string, status: StationStatus, nowMs: number): number {
  const standingHours =
    status.lastReportedMs === null
      ? 0
      : Math.max(0, (nowMs - status.lastReportedMs) / 3_600_000);

  const start = 30 + unit(seed, 'charge') * 65;
  const wired = unit(status.stationId, 'grid') < CHARGING_SHARE;
  const delta = wired ? standingHours * CHARGE_PER_HOUR : -standingHours * DRAIN_PER_HOUR;

  return Math.round(Math.min(100, Math.max(2, start + delta)));
}

/* ---------------------------------------------------------------------------
   Rollups — what a screen actually asks for.
--------------------------------------------------------------------------- */

export interface FleetSummary {
  total: number;
  electric: number;
  classic: number;
  /** Rideable electric bikes below `LOW_CHARGE`. A swap-crew signal. */
  lowCharge: number;
  /** Mean charge across electric bikes, or null when there are none. */
  meanCharge: number | null;
  flagged: number;
  outOfService: number;
  /** True when this station's docks are modelled as mains-connected. */
  gridConnected: boolean;
}

export function summarize(bikes: Bike[], stationId: string): FleetSummary {
  const electric = bikes.filter((b) => b.kind === 'electric');
  const charged = electric.filter((b) => b.charge !== null);
  const sum = charged.reduce((n, b) => n + (b.charge ?? 0), 0);

  return {
    total: bikes.length,
    electric: electric.length,
    classic: bikes.length - electric.length,
    lowCharge: electric.filter(
      (b) => b.condition !== 'out-of-service' && (b.charge ?? 100) < LOW_CHARGE,
    ).length,
    meanCharge: charged.length > 0 ? Math.round(sum / charged.length) : null,
    flagged: bikes.filter((b) => b.condition === 'flagged').length,
    outOfService: bikes.filter((b) => b.condition === 'out-of-service').length,
    gridConnected: unit(stationId, 'grid') < CHARGING_SHARE,
  };
}
