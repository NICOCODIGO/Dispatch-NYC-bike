/**
 * The one line that heads the Rebalancing board: what is the worst thing
 * happening on the network right now?
 *
 * The board is a worst-first list, but a list makes the reader do the triage. A
 * dispatcher glancing at it wants a single sentence answering the questions a
 * list cannot: is a station critically broken and being ignored? has the network
 * gone partly blind? is something failing at scale? — not "some stations are
 * full and some are empty", which is the job, not an emergency.
 *
 * So this ranks the possible situations by real severity and returns the first
 * that applies. Routine imbalance is the *fallback*, stated calmly; the alarming
 * cases outrank it and say plainly how bad, how long, and what to do.
 *
 * Pure, like the rest of `model/`. It takes already-derived inputs (the caller
 * owns the feed) and returns a tagged union; the wording lives in
 * `src/content/situation.tsx`.
 */

import { CRITICAL_THRESHOLD, type Signal } from './score';
import type { NetworkSummary } from './summary';
import type { ScoredStation } from './summary';
import type { Triaged } from './triage';
import { mechanicFault } from './triage';
import type { Track } from './verify';
import type { Duration } from '../data/duration';
import type { HardwareTotals } from '../data/hardware';

/* --- thresholds: the line between "normal for a big network" and "act now" ---
   Every one is a guess, sized against live Citi Bike data. They are the first
   thing to tune once the headline has been watched for a few shifts. */

/** Silent stations holding this share of the network's docks → the board is blind. */
const BLIND_DOCK_SHARE = 0.08;
/** Dead docks as a share of the network → hardware is failing at scale. */
const DEAD_DOCK_SHARE_ALARM = 0.04;
/** …or this many stations with most of their rack out of service. */
const CRIPPLED_SITES_ALARM = 15;
/** A critical station failing at least this long with no truck sent is neglected. */
const STUCK_MINUTES = 60;

export type Situation =
  | { kind: 'loading' }
  | {
      kind: 'blind';
      dark: number;
      dockShare: number;
      neverReported: number;
      worstBorough: { borough: string; stations: number } | null;
    }
  | {
      kind: 'critical-stuck';
      name: string;
      stationId: string;
      borough: string;
      score: number;
      minutes: number;
      /** Score movement since first flagged. Positive = getting worse. */
      delta: number;
      signal: Signal;
      failingSince: number;
    }
  | { kind: 'hardware-crippled'; sites: number; deadDocks: number; brokenBikes: number; dockShare: number }
  | {
      kind: 'faults-unraised';
      count: number;
      total: number;
      worstName: string;
      worstBorough: string;
      worstFault: string;
      stationId: string;
    }
  | {
      kind: 'worst';
      name: string;
      stationId: string;
      score: number;
      needsTruck: number;
      dominant: NetworkSummary['dominant'];
      /** Trailing context, folded into the detail line. */
      mechanic: number;
      unraised: number;
      crippled: number;
    }
  | { kind: 'clear'; networkFill: number | null; mechanic: number; unraised: number };

export interface SituationInput {
  phase: 'loading' | 'ready' | 'error';
  summary: NetworkSummary | null;
  lanes: Triaged;
  /** Every nameplate dock the feed returned — `networkDocks(scored)`. */
  networkDocks: number;
  hardware: HardwareTotals;
  tracks: Track[] | null;
  durations: Map<string, Duration>;
  /** Stations with a truck already on the way (open run, or marked dispatched). */
  activeRunIds: Set<string>;
  /** Mechanic-lane stations that already have a work order. */
  raisedFaultIds: Set<string>;
}

function blindSpot(unverified: ScoredStation[], networkDocks: number) {
  let docks = 0;
  let neverReported = 0;
  const byBorough = new Map<string, number>();
  for (const s of unverified) {
    docks += s.station.capacity;
    if (s.breakdown.staleness.ageMinutes === null) neverReported++;
    byBorough.set(s.station.borough, (byBorough.get(s.station.borough) ?? 0) + 1);
  }
  let worstBorough: { borough: string; stations: number } | null = null;
  for (const [borough, stations] of byBorough) {
    if (!worstBorough || stations > worstBorough.stations) worstBorough = { borough, stations };
  }
  return {
    dark: unverified.length,
    dockShare: networkDocks > 0 ? docks / networkDocks : 0,
    neverReported,
    worstBorough,
  };
}

/**
 * A truck-lane station that has been critical for at least an hour and has no
 * truck on the way. It is not the top of the list — something else is always
 * momentarily worse — so it never gets picked, which is exactly why it needs
 * naming here.
 */
function neglectedCritical(input: SituationInput) {
  const { tracks, durations, activeRunIds, lanes } = input;
  if (!tracks) return null;

  const truckIds = new Set(lanes.truck.map((s) => s.station.stationId));

  const candidates = tracks
    .filter((t) => t.outcome !== 'resolved' && t.currentScore >= CRITICAL_THRESHOLD)
    .filter((t) => truckIds.has(t.stationId))
    .filter((t) => !activeRunIds.has(t.stationId))
    .map((t) => ({ t, d: durations.get(t.stationId) }))
    .filter((x): x is { t: Track; d: Duration } => Boolean(x.d?.confident) && x.d!.minutes >= STUCK_MINUTES);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const worse = Number(b.t.outcome === 'worsened') - Number(a.t.outcome === 'worsened');
    if (worse !== 0) return worse;
    return b.d.minutes - a.d.minutes;
  });

  const { t, d } = candidates[0]!;
  return {
    name: t.name,
    stationId: t.stationId,
    borough: t.borough,
    score: t.currentScore,
    minutes: d.minutes,
    delta: t.delta,
    signal: t.signal,
    failingSince: d.failingSince,
  };
}

export function assessSituation(input: SituationInput): Situation {
  const { phase, summary, lanes, networkDocks, hardware, raisedFaultIds } = input;

  if (phase === 'loading' && (!summary || summary.ranked === 0)) {
    return { kind: 'loading' };
  }

  // 1. Has the network gone partly blind?
  const blind = blindSpot(lanes.unverified, networkDocks);
  if (blind.dark >= 8 && blind.dockShare >= BLIND_DOCK_SHARE) {
    return { kind: 'blind', ...blind };
  }

  // 2. A critical station nobody has been sent to.
  const stuck = neglectedCritical(input);
  if (stuck) return { kind: 'critical-stuck', ...stuck };

  // 3. Hardware failing at scale.
  const deadDockShare = networkDocks > 0 ? hardware.deadDocks / networkDocks : 0;
  if (deadDockShare >= DEAD_DOCK_SHARE_ALARM || hardware.crippled >= CRIPPLED_SITES_ALARM) {
    return {
      kind: 'hardware-crippled',
      sites: hardware.crippled,
      deadDocks: hardware.deadDocks,
      brokenBikes: hardware.brokenBikes,
      dockShare: deadDockShare,
    };
  }

  // 4. Out-of-service stations with no repair scheduled.
  const unraised = lanes.mechanic.filter((s) => !raisedFaultIds.has(s.station.stationId));
  if (unraised.length > 0) {
    const worst = unraised[0]!; // mechanic lane is already sorted worst-first
    return {
      kind: 'faults-unraised',
      count: unraised.length,
      total: lanes.mechanic.length,
      worstName: worst.station.name,
      worstBorough: worst.station.borough,
      worstFault: mechanicFault(worst).toLowerCase(),
      stationId: worst.station.stationId,
    };
  }

  // 5. The routine state: everything below the alarm line.
  const needsTruck = summary?.needsTruck ?? 0;
  const mechanic = lanes.mechanic.length;

  if (needsTruck === 0) {
    return {
      kind: 'clear',
      networkFill: summary?.networkFill ?? null,
      mechanic,
      unraised: unraised.length,
    };
  }

  const worst = summary?.worstTruck;
  return {
    kind: 'worst',
    name: worst?.name ?? '—',
    stationId: worst?.stationId ?? '',
    score: worst?.score ?? 0,
    needsTruck,
    dominant: summary?.dominant ?? null,
    mechanic,
    unraised: unraised.length,
    crippled: hardware.crippled,
  };
}
