import type { StationStatus } from '../data/gbfs';
import type { StationRow } from '../data/stationRow';

/**
 * Individual bikes and docks, which the feed does not carry.
 *
 * GBFS is station-level arithmetic: twelve bikes here, three of them electric,
 * two broken, six free docks, one dead. It never says *which* twelve, and never
 * says what is wrong with the two. Everything an operator actually touches — a
 * numbered frame with a flat tyre, a dock whose release button sticks — lives
 * in systems only the operator has.
 *
 * So this module invents them. The rule it holds to, and the reason it is a
 * simulation rather than decoration:
 *
 *   **Every invented set is sized by a real number from the live feed.**
 *
 * The counts are the operator's. Identity, fault and charge are the fiction.
 * The fiction can elaborate what the feed leaves out; it can never disagree
 * with what the feed states.
 *
 * ## Why it is deterministic
 *
 * The board repolls every 60 seconds. A random fleet would reshuffle every
 * frame: bike #38472 would cease to exist mid-shift, batteries would jump, and
 * nothing could be tracked or assigned. Identity is derived from `stationId`
 * and the slot index through a seeded hash, so the same station yields the same
 * bikes on every poll, across reloads, in every tab. The one thing allowed to
 * move is charge, which drifts on a slow clock — a battery that never
 * discharges is a worse lie than an invented one.
 *
 * ## On `available` and `disabled` being disjoint
 *
 * GBFS defines `num_bikes_available` as *functional* vehicles present and
 * `num_bikes_disabled` as broken ones present. They do not overlap: a station
 * reporting 12 available and 2 disabled has fourteen bikes on the rack. The
 * app's own fill denominator agrees — `usableSlots` is `bikesAvailable +
 * docksAvailable`, deliberately excluding both disabled counts.
 *
 * An earlier version of this file treated disabled bikes as a subset of
 * available and marked two of the twelve as broken, which quietly lost every
 * broken bike in the network from the rack view — precisely the machines a
 * mechanic is being sent for.
 */

/**
 * The counts a rack is built from, recovered off a rendered row.
 *
 * Exists so the drawer's summary and the assets panel cannot disagree: both
 * need the same `StationStatus`, and hand-assembling that object twice is how
 * one of them ends up passing `openDocks` where the other passes `docks`.
 *
 * Returns null for a station whose counts the board has already refused to
 * trust — the unverified lane. Elaborating a rack of individual frames on top
 * of numbers nothing else will score on is the one place this can mislead.
 */
export function statusFromRow(row: StationRow): StationStatus | null {
  const raw = row.raw;
  if (!raw || row.bikes === null) return null;

  return {
    stationId: raw.stationId,
    bikesAvailable: row.bikes,
    ebikesAvailable: raw.ebikesAvailable,
    docksAvailable: row.openDocks ?? 0,
    bikesDisabled: raw.bikesDisabled,
    docksDisabled: raw.docksDisabled,
    isInstalled: raw.isInstalled,
    isRenting: raw.isRenting,
    isReturning: raw.isReturning,
    lastReportedMs: raw.lastReportedMs,
  };
}

export type BikeKind = 'classic' | 'electric';

/**
 * What is wrong with a bike, in the words a mechanic would use.
 *
 * The feed gives a count of disabled bikes and no reason at all. These are the
 * failures riders actually report on a dock-based system: tyres and brakes
 * dominate, drivetrain and bars trail, and `battery-fault` only exists for a
 * machine that has a battery.
 */
export type BikeFault =
  | 'flat-tyre'
  | 'brakes'
  | 'drivetrain'
  | 'handlebars'
  | 'wheel'
  | 'battery-fault';

export const BIKE_FAULT_LABEL: Record<BikeFault, string> = {
  'flat-tyre': 'Flat tyre',
  brakes: 'Brake fault',
  drivetrain: 'Chain / drivetrain',
  handlebars: 'Handlebars loose',
  wheel: 'Wheel out of true',
  'battery-fault': 'Battery fault',
};

/** Faults common to any bike, in rough order of how often they are reported. */
const COMMON_FAULTS: BikeFault[] = [
  'flat-tyre',
  'flat-tyre',
  'brakes',
  'brakes',
  'drivetrain',
  'wheel',
  'handlebars',
];

export type BikeCondition = 'ok' | 'flagged' | 'out-of-service';

export const CONDITION_LABEL: Record<BikeCondition, string> = {
  ok: 'OK',
  flagged: 'Needs check',
  'out-of-service': 'Out of service',
};

export interface Bike {
  /** Frame number, the way a mechanic would call it out. */
  id: string;
  kind: BikeKind;
  /** 0–100 for an electric bike, null for a classic one. */
  charge: number | null;
  condition: BikeCondition;
  /** Null exactly when `condition` is 'ok'. */
  fault: BikeFault | null;
  /** Which dock it is sitting in, 1-indexed for humans. */
  dock: number;
}

/**
 * What is wrong with a dock.
 *
 * `no-power` and `no-comms` are site-level failures that happen to be reported
 * per dock — they are the ones that escalate into a `station-power` work order
 * rather than a dock repair, and the ones that eventually drop a station into
 * the unverified lane.
 */
export type DockFault = 'stuck-release' | 'wont-lock' | 'no-power' | 'no-comms';

export const DOCK_FAULT_LABEL: Record<DockFault, string> = {
  'stuck-release': 'Release button stuck',
  'wont-lock': 'Will not lock a bike',
  'no-power': 'No power to dock',
  'no-comms': 'Not reporting',
};

const DOCK_FAULTS: DockFault[] = [
  'stuck-release',
  'stuck-release',
  'wont-lock',
  'wont-lock',
  'no-power',
  'no-comms',
];

export type DockState = 'occupied' | 'free' | 'out-of-service';

export interface Dock {
  /** 1-indexed position along the rack. */
  index: number;
  state: DockState;
  fault: DockFault | null;
}

/** Below this a bike is not worth leaving on the street for a rider to find. */
export const LOW_CHARGE = 25;

/** Charge lost per hour of standing time, before the dock is considered. */
const DRAIN_PER_HOUR = 1.4;

/**
 * A grid-connected dock charges what sits in it.
 *
 * Lyft has been connecting stations to mains power specifically to cut manual
 * battery swaps, so a fleet that only ever drains would model the *old*
 * network. Which stations are wired is not public, so it is drawn from the
 * station id — stable, roughly a third of the network, labelled as invented.
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

function pick<T>(list: T[], seed: string, facet: string): T {
  return list[Math.floor(unit(seed, facet) * list.length)] ?? (list[0] as T);
}

/* ---------------------------------------------------------------------------
   Counts, reconciled once.
--------------------------------------------------------------------------- */

interface Counts {
  rideable: number;
  brokenBikes: number;
  electric: number;
  freeDocks: number;
  deadDocks: number;
}

/**
 * The feed's numbers, clamped into something a rack can be built from.
 *
 * Every clamp here corresponds to something the live feed actually does:
 * negative values, and e-bike counts that exceed the total available.
 */
function countsOf(status: StationStatus): Counts {
  const rideable = Math.max(0, status.bikesAvailable);
  return {
    rideable,
    brokenBikes: Math.max(0, status.bikesDisabled),
    electric: Math.min(Math.max(0, status.ebikesAvailable), rideable),
    freeDocks: Math.max(0, status.docksAvailable),
    deadDocks: Math.max(0, status.docksDisabled),
  };
}

/* ---------------------------------------------------------------------------
   The rack.
--------------------------------------------------------------------------- */

/**
 * The bikes standing at one station right now, rideable and broken.
 *
 * `nowMs` is a parameter rather than `Date.now()` so the charge model is
 * testable and so every bike on one render shares a single clock.
 */
export function bikesAt(status: StationStatus, nowMs: number): Bike[] {
  const { rideable, brokenBikes, electric } = countsOf(status);
  const bikes: Bike[] = [];

  for (let slot = 0; slot < rideable + brokenBikes; slot += 1) {
    const seed = `${status.stationId}#${slot}`;
    const broken = slot >= rideable;

    // E-bikes take the low slots so the *available* electric count is exact.
    // A broken bike's kind is drawn instead: the feed does not break disabled
    // bikes down by type, so claiming a split would be inventing a number the
    // operator never published.
    const kind: BikeKind = broken
      ? unit(seed, 'kind') < 0.4
        ? 'electric'
        : 'classic'
      : slot < electric
        ? 'electric'
        : 'classic';

    const condition: BikeCondition = !broken
      ? 'ok'
      : // The feed says a bike is unavailable, never how badly. Roughly a third
        // are treated as genuinely scrap and the rest as needing a look — the
        // difference between a depot job and a five-minute fix on the street.
        unit(seed, 'condition') < 0.34
        ? 'out-of-service'
        : 'flagged';

    bikes.push({
      id: frameNumber(seed),
      kind,
      charge: kind === 'electric' ? chargeFor(seed, status, nowMs) : null,
      condition,
      fault: condition === 'ok' ? null : faultFor(seed, kind),
      dock: slot + 1,
    });
  }

  return bikes;
}

/**
 * The dock strip, including the positions holding bikes.
 *
 * Length is every physical dock the feed accounts for: bikes present (working
 * and broken) plus free docks plus dead ones. That sum is usually a little
 * under the station's nameplate `capacity`, which is expected — hundreds of
 * stations disagree with their own nameplate, which is why the app's fill math
 * never divides by it.
 */
export function docksAt(status: StationStatus): Dock[] {
  const { rideable, brokenBikes, freeDocks, deadDocks } = countsOf(status);
  const occupied = rideable + brokenBikes;

  const docks: Dock[] = [];
  for (let i = 0; i < occupied; i += 1) {
    docks.push({ index: i + 1, state: 'occupied', fault: null });
  }
  for (let i = 0; i < freeDocks; i += 1) {
    docks.push({ index: occupied + i + 1, state: 'free', fault: null });
  }
  for (let i = 0; i < deadDocks; i += 1) {
    const index = occupied + freeDocks + i + 1;
    docks.push({
      index,
      state: 'out-of-service',
      fault: pick(DOCK_FAULTS, `${status.stationId}~${index}`, 'dockfault'),
    });
  }
  return docks;
}

/** Five digits, the shape Citi Bike prints on a frame. */
function frameNumber(seed: string): string {
  return `#${10_000 + Math.floor(unit(seed, 'frame') * 90_000)}`;
}

/** Battery faults are only possible on a machine that has a battery. */
function faultFor(seed: string, kind: BikeKind): BikeFault {
  if (kind === 'electric' && unit(seed, 'batteryfault') < 0.22) return 'battery-fault';
  return pick(COMMON_FAULTS, seed, 'fault');
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
  const wired = isGridConnected(status.stationId);
  const delta = wired ? standingHours * CHARGE_PER_HOUR : -standingHours * DRAIN_PER_HOUR;

  return Math.round(Math.min(100, Math.max(2, start + delta)));
}

export function isGridConnected(stationId: string): boolean {
  return unit(stationId, 'grid') < CHARGING_SHARE;
}

/* ---------------------------------------------------------------------------
   Rollups — what a screen actually asks for.
--------------------------------------------------------------------------- */

export interface FleetSummary {
  /** Every bike on the rack, working and broken. */
  total: number;
  rideable: number;
  electric: number;
  classic: number;
  /** Rideable electric bikes below `LOW_CHARGE`. A swap-crew signal. */
  lowCharge: number;
  /** Mean charge across rideable electric bikes, or null when there are none. */
  meanCharge: number | null;
  flagged: number;
  outOfService: number;
  gridConnected: boolean;
}

export function summarize(bikes: Bike[], stationId: string): FleetSummary {
  const rideable = bikes.filter((b) => b.condition === 'ok');
  const electric = bikes.filter((b) => b.kind === 'electric');
  const charged = rideable.filter((b) => b.charge !== null);
  const sum = charged.reduce((n, b) => n + (b.charge ?? 0), 0);

  return {
    total: bikes.length,
    rideable: rideable.length,
    electric: electric.length,
    classic: bikes.length - electric.length,
    lowCharge: charged.filter((b) => (b.charge ?? 100) < LOW_CHARGE).length,
    meanCharge: charged.length > 0 ? Math.round(sum / charged.length) : null,
    flagged: bikes.filter((b) => b.condition === 'flagged').length,
    outOfService: bikes.filter((b) => b.condition === 'out-of-service').length,
    gridConnected: isGridConnected(stationId),
  };
}

export interface DockSummary {
  total: number;
  free: number;
  occupied: number;
  dead: number;
  /** Dead docks whose fault is a site-level power or comms failure. */
  siteFaults: number;
  byFault: { fault: DockFault; count: number }[];
}

export function summarizeDocks(docks: Dock[]): DockSummary {
  const dead = docks.filter((d) => d.state === 'out-of-service');

  const counts = new Map<DockFault, number>();
  for (const d of dead) {
    if (d.fault) counts.set(d.fault, (counts.get(d.fault) ?? 0) + 1);
  }

  return {
    total: docks.length,
    free: docks.filter((d) => d.state === 'free').length,
    occupied: docks.filter((d) => d.state === 'occupied').length,
    dead: dead.length,
    siteFaults: dead.filter((d) => d.fault === 'no-power' || d.fault === 'no-comms').length,
    byFault: [...counts.entries()]
      .map(([fault, count]) => ({ fault, count }))
      .sort((a, b) => b.count - a.count),
  };
}
