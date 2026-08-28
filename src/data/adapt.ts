import type { StationCategory } from '../model/score';
import type { ScoredStation } from '../model/summary';
import { laneOf } from '../model/triage';
import { formatReportedAge } from '../lib/time';
import { truckAction } from './insights';
import { applyDuration, type Duration } from './duration';
import type { Tone } from '../ui/tone';
import type { StationRow, StatusLabel } from './stationRow';

/**
 * Live feed → the shape the console draws.
 *
 * The one adapter between the scoring model and the UI. Everything the screens
 * show about a station resolves here, so there is exactly one place where the
 * model's vocabulary meets the interface's.
 *
 * ## On the two vocabularies
 *
 * The comps and the model disagree, and the model wins here — its thresholds
 * are defined, tested and reasoned about, while the comp labelled two stations
 * at the same 97% fill "Flooded" and "Full" with different bar colors.
 *
 * Concretely: `full` means no free docks at all, `flooded` means at or above
 * FLOODED_FILL_RATIO (85%), `starving` means at or below STARVING_FILL_RATIO
 * (15%), and `empty` means no bikes at all. A station holding one bike out of
 * 23 is therefore *Low*, not *Empty* — it can still serve exactly one rider.
 */

const CATEGORY_STATUS: Record<StationCategory, StatusLabel> = {
  not_installed: 'Not installed',
  unusable: 'Outage',
  outage: 'Outage',
  empty: 'Empty',
  starving: 'Low',
  full: 'Full',
  flooded: 'Flooded',
  healthy: 'Healthy',
};

/**
 * Bar color per category.
 *
 * Not simply `CATEGORY_SIGNAL`, because the console grades severity where the
 * model only records direction. The signal says which way the truck drives;
 * the tone says that *and* how far gone the station is:
 *
 *   empty  (no bikes)  red      |  full    (no docks)   blue
 *   starving (≤15%)    amber    |  flooded (≥85%)       light blue
 *
 * Warm means nobody can rent, cool means nobody can return. Mapping both
 * warnings onto one amber would put opposite problems in the same color.
 */
export const CATEGORY_TONE: Record<StationCategory, Tone> = {
  not_installed: 'mute',
  unusable: 'ink',
  outage: 'ink',
  empty: 'empty',
  starving: 'warn',
  full: 'flood',
  flooded: 'flood-soft',
  healthy: 'ok',
};

/**
 * A station id short enough to print.
 *
 * The fixtures used tidy numbers like `#244`; the live feed keys on UUIDs
 * (`66dbc8f5-0aca-11e7-82f6-3863bb44ef7c`), which are 36 characters of nothing
 * a dispatcher can read out over a radio. The first segment is unique enough
 * to identify a station in support, and the full id stays in the data.
 */
export function shortStationId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) : id;
}

export function statusFor(entry: ScoredStation): StatusLabel {
  // Staleness outranks the category for the same reason it does in triage: the
  // category was derived from counts we have already admitted are worthless.
  if (laneOf(entry.breakdown) === 'unverified') return 'Stale';
  return CATEGORY_STATUS[entry.breakdown.category];
}

export function toneFor(entry: ScoredStation): Tone {
  if (laneOf(entry.breakdown) === 'unverified') return 'mute';
  return CATEGORY_TONE[entry.breakdown.category];
}

export function toStationRow(entry: ScoredStation, duration?: Duration): StationRow {
  const { station, breakdown } = entry;
  const { fill, staleness } = breakdown;
  const lane = laneOf(breakdown);
  const unverified = lane === 'unverified';

  // Duration only means anything for a station that is actually failing.
  const adjusted =
    !unverified && breakdown.needsTruck ? applyDuration(breakdown, duration) : null;

  return {
    id: station.stationId,
    name: station.name,
    borough: station.borough,
    docks: station.capacity,

    openDocks: unverified ? undefined : fill.docks,

    // An unverified station reports numbers, but showing them as fact is the
    // whole failure this lane exists to prevent.
    bikes: unverified ? null : fill.bikes,
    score:
      unverified || !breakdown.scored ? null : (adjusted?.score ?? breakdown.score),
    duration: adjusted?.duration ?? null,

    status: statusFor(entry),
    updated: formatReportedAge(staleness.ageMinutes),
    fill: unverified ? null : fill.ratio,
    fillTone: toneFor(entry),
    fillLabel: unverified
      ? 'unknown'
      : fill.ratio === null
        ? 'no usable slots'
        : `${Math.round(fill.ratio * 100)}% full`,

    warning: unverified
      ? staleness.ageMinutes === null
        ? 'Never reported — not scored'
        : `Last seen ${formatReportedAge(staleness.ageMinutes)} — not scored`
      : undefined,

    stationNumber: `#${shortStationId(station.stationId)}`,
    action: unverified ? undefined : truckAction(breakdown),
    breakdown,

    // Carried through verbatim so the drawer can show the observations the
    // score was built from, separately from the score itself.
    raw: {
      stationId: station.stationId,
      capacity: station.capacity,
      usableSlots: fill.usableSlots,
      isRenting: station.status.isRenting,
      isReturning: station.status.isReturning,
      isInstalled: station.status.isInstalled,
      bikesDisabled: station.status.bikesDisabled,
      docksDisabled: station.status.docksDisabled,
      ebikesAvailable: station.status.ebikesAvailable,
      lastReportedMs: staleness.lastReportedMs,
    },
  };
}
