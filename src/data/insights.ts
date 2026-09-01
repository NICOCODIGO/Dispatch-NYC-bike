import type { ScoredStation } from '../model/summary';
import { laneOf } from '../model/triage';

/**
 * Consequences, computed from the live feed.
 *
 * The board is good at "which station is worst". It is silent on the questions
 * a supervisor actually asks — how much work is this, what is it costing us,
 * and is anyone dealing with it. Everything here answers one of those, and
 * every figure is derived from the same feed the queue is ranked from, so
 * nothing on these panels can disagree with the table.
 */

/* ---------------------------------------------------------------------------
   How much rebalancing work is outstanding.
--------------------------------------------------------------------------- */

export interface RebalanceDemand {
  /** Bikes that need delivering to empty-side stations. */
  deficit: number;
  /** Bikes that need collecting from full-side stations. */
  surplus: number;
  /**
   * Bikes that can be handled by relocation alone — the smaller of the two.
   * Anything beyond this has to come from, or go to, a depot.
   */
  relocatable: number;
  stationsShort: number;
  stationsOver: number;
}

/**
 * A balanced station is half full: it can serve a rider who wants a bike and a
 * rider who wants a dock. Distance from that midpoint, summed over everything
 * at or above the truck threshold, is the outstanding workload in bikes.
 *
 * Measured against slots actually reported usable rather than the nameplate,
 * for the same reason the fill ratio is — 870 stations disagree with their own
 * capacity, and a target computed from a wrong denominator is a wrong target.
 */
export function rebalanceDemand(lane: ScoredStation[]): RebalanceDemand {
  let deficit = 0;
  let surplus = 0;
  let stationsShort = 0;
  let stationsOver = 0;

  for (const { breakdown } of lane) {
    if (!breakdown.needsTruck) continue;

    const { bikes, usableSlots } = breakdown.fill;
    if (usableSlots === 0) continue;
    const target = Math.round(usableSlots / 2);

    if (breakdown.signal === 'empty' && bikes < target) {
      deficit += target - bikes;
      stationsShort++;
    } else if (breakdown.signal === 'full' && bikes > target) {
      surplus += bikes - target;
      stationsOver++;
    }
  }

  return {
    deficit,
    surplus,
    relocatable: Math.min(deficit, surplus),
    stationsShort,
    stationsOver,
  };
}

/* ---------------------------------------------------------------------------
   What a truck should actually do when it arrives.
--------------------------------------------------------------------------- */

export interface TruckAction {
  kind: 'drop' | 'collect' | 'mechanic' | 'none';
  /** Bikes to move. Zero for the non-truck kinds. */
  bikes: number;
}

/**
 * The instruction, not the diagnosis.
 *
 * "Empty" tells a dispatcher the direction; it does not tell them how much to
 * load. Both the fleet panel and the queue need the same answer, so it is
 * computed once here — the two screens disagreeing about how many bikes a
 * station needs would be worse than neither showing it.
 *
 * The target is the same midpoint `rebalanceDemand` uses, so the per-station
 * numbers sum to the network figure.
 */
export function truckAction(breakdown: ScoredStation['breakdown']): TruckAction {
  if (breakdown.signal === 'outage') return { kind: 'mechanic', bikes: 0 };

  const { bikes, usableSlots } = breakdown.fill;
  if (usableSlots === 0) return { kind: 'mechanic', bikes: 0 };

  const target = Math.round(usableSlots / 2);

  if (breakdown.signal === 'empty' && bikes < target) {
    return { kind: 'drop', bikes: target - bikes };
  }
  if (breakdown.signal === 'full' && bikes > target) {
    return { kind: 'collect', bikes: bikes - target };
  }
  return { kind: 'none', bikes: 0 };
}

/* ---------------------------------------------------------------------------
   Capacity that is not serving anybody.
--------------------------------------------------------------------------- */

export interface CapacityLoss {
  stations: number;
  /** Nameplate docks belonging to those stations. */
  docks: number;
  /** Share of the whole network's docks, 0–1. */
  share: number;
  /** Age of the longest-running case, in minutes. Null when unknown. */
  oldestMinutes: number | null;
  /** Worst-affected boroughs, largest first. */
  byBorough: { borough: string; stations: number; docks: number }[];
}

export function capacityLoss(lane: ScoredStation[], networkDocks: number): CapacityLoss {
  const docks = lane.reduce((sum, s) => sum + s.station.capacity, 0);

  const ages = lane
    .map((s) => s.breakdown.staleness.ageMinutes)
    .filter((a): a is number => a !== null);

  const groups = new Map<string, { stations: number; docks: number }>();
  for (const s of lane) {
    const g = groups.get(s.station.borough) ?? { stations: 0, docks: 0 };
    g.stations++;
    g.docks += s.station.capacity;
    groups.set(s.station.borough, g);
  }

  return {
    stations: lane.length,
    docks,
    share: networkDocks > 0 ? docks / networkDocks : 0,
    oldestMinutes: ages.length > 0 ? Math.max(...ages) : null,
    byBorough: [...groups.entries()]
      .map(([borough, g]) => ({ borough, ...g }))
      .sort((a, b) => b.docks - a.docks),
  };
}

/* ---------------------------------------------------------------------------
   Per-borough rollup.
--------------------------------------------------------------------------- */

export interface BoroughRollup {
  borough: string;
  stations: number;
  needsTruck: number;
  /** Mean fill across stations that report usable slots, 0–1. Null if none. */
  avgFill: number | null;
  /** needsTruck / stations — how much of the borough is in trouble. */
  pressure: number;
}

export function boroughRollup(scored: ScoredStation[]): BoroughRollup[] {
  const groups = new Map<string, { stations: number; needsTruck: number; fills: number[] }>();

  for (const s of scored) {
    const key = s.station.borough;
    const g = groups.get(key) ?? { stations: 0, needsTruck: 0, fills: [] };
    g.stations++;
    if (s.breakdown.needsTruck) g.needsTruck++;
    if (s.breakdown.fill.ratio !== null) g.fills.push(s.breakdown.fill.ratio);
    groups.set(key, g);
  }

  return [...groups.entries()]
    .map(([borough, g]) => ({
      borough,
      stations: g.stations,
      needsTruck: g.needsTruck,
      avgFill: g.fills.length > 0 ? g.fills.reduce((a, b) => a + b, 0) / g.fills.length : null,
      pressure: g.stations > 0 ? g.needsTruck / g.stations : 0,
    }))
    .sort((a, b) => b.stations - a.stations);
}

/** Total nameplate docks across everything the feed returned. */
export function networkDocks(scored: ScoredStation[]): number {
  return scored.reduce((sum, s) => sum + s.station.capacity, 0);
}

/* ---------------------------------------------------------------------------
   Searching for something that is not in this queue.
--------------------------------------------------------------------------- */

export interface OffQueueMatches {
  mechanic: ScoredStation[];
  unverified: ScoredStation[];
  quiet: ScoredStation[];
  total: number;
}

/**
 * Stations matching the search that the Rebalancing board structurally cannot show.
 *
 * The queue pools the truck lane only — by design, since a dead station has no
 * business in a rebalancing list. But the consequence was a search box that
 * silently returns nothing for perfectly real stations, and the reader has no
 * way to tell "no such station" from "that one is on a different screen".
 *
 * Finding them is not the same as showing them here. This reports what exists
 * elsewhere so the queue can point at it.
 */
export function matchesOutsideQueue(
  lanes: { mechanic: ScoredStation[]; unverified: ScoredStation[]; quiet: ScoredStation[] },
  search: string,
  borough: string,
): OffQueueMatches {
  const needle = search.trim().toLowerCase();
  if (!needle) return { mechanic: [], unverified: [], quiet: [], total: 0 };

  const hit = (s: ScoredStation) => {
    if (borough !== 'all' && s.station.borough !== borough) return false;
    return `${s.station.name} ${s.station.borough}`.toLowerCase().includes(needle);
  };

  const mechanic = lanes.mechanic.filter(hit);
  const unverified = lanes.unverified.filter(hit);
  // Healthy stations are the common case and would drown the other two.
  const quiet = lanes.quiet.filter(hit).slice(0, 20);

  return {
    mechanic,
    unverified,
    quiet,
    total: mechanic.length + unverified.length + quiet.length,
  };
}

/* ---------------------------------------------------------------------------
   Zones, derived from the feed rather than declared.
--------------------------------------------------------------------------- */

export function zoneSlug(borough: string): string {
  return borough.toLowerCase().replace(/\s+/g, '-');
}

export interface Zone {
  slug: string;
  name: string;
  stations: number;
}

/**
 * The zone list the sidebar shows.
 *
 * Derived, not hard-coded, for two reasons. The counts have to agree with
 * every other screen — a sidebar claiming Manhattan has 318 stations beside an
 * analytics table saying 681 is worse than no sidebar. And the service area is
 * not the five boroughs: the feed covers Jersey City and Hoboken too, which a
 * fixed list quietly hides.
 */
export function liveZones(scored: ScoredStation[]): Zone[] {
  const counts = new Map<string, number>();
  for (const s of scored) {
    counts.set(s.station.borough, (counts.get(s.station.borough) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([name]) => name !== 'Unknown')
    .map(([name, stations]) => ({ slug: zoneSlug(name), name, stations }))
    .sort((a, b) => b.stations - a.stations);
}

export interface ZoneStats extends Zone {
  needsTruck: number;
  avgFill: number | null;
  /** Worst-first, already ordered by the store. */
  ranked: ScoredStation[];
  unverified: number;
  mechanic: number;
}

export function zoneStats(scored: ScoredStation[], slug: string): ZoneStats | null {
  const inZone = scored.filter((s) => zoneSlug(s.station.borough) === slug);
  if (inZone.length === 0) return null;

  const fills = inZone
    .map((s) => s.breakdown.fill.ratio)
    .filter((r): r is number => r !== null);

  return {
    slug,
    name: inZone[0]!.station.borough,
    stations: inZone.length,
    needsTruck: inZone.filter((s) => s.breakdown.needsTruck).length,
    avgFill: fills.length > 0 ? fills.reduce((a, b) => a + b, 0) / fills.length : null,
    ranked: inZone.filter((s) => s.breakdown.needsTruck),

    // Counted through `laneOf`, not by re-testing the underlying flags. A
    // not-installed station can carry `notReporting` too, and testing that flag
    // directly made this page claim 73 silent stations in Brooklyn while the
    // Unverified screen — which reads the lane — showed 3 in the whole network.
    unverified: inZone.filter((s) => laneOf(s.breakdown) === 'unverified').length,
    mechanic: inZone.filter((s) => laneOf(s.breakdown) === 'mechanic').length,
  };
}
