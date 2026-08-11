/**
 * The urgency model.
 *
 * `scoreStation` is a pure function of (info, status, now). It returns a
 * `ScoreBreakdown` that carries every input, every intermediate value and every
 * contribution — enough for the Explain screen to render the full derivation
 * with zero recomputation. The math a dispatcher reads on Explain is, literally,
 * the math that ranked the queue: there is no second copy of this formula
 * anywhere in the UI.
 *
 * The model answers one question — "how badly does this station need a truck
 * right now" — and deliberately does not model demand, time of day or weather.
 * Those would make it more accurate and much harder to trust; a dispatcher who
 * cannot audit the number will not act on it.
 */

import type { StationInfo, StationStatus } from '../data/gbfs';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type StationCategory =
  | 'not_installed'
  | 'unusable'
  | 'outage'
  | 'empty'
  | 'full'
  | 'starving'
  | 'flooded'
  | 'healthy';

/** Which failure signal a category reads as. Empty-side problems (red) need a
 *  truck to *drop off*; full-side problems (indigo) need a truck to *pick up*.
 *  Mechanical problems (ink) need a mechanic — a truck full of bikes does not
 *  help — which is why they are not on the red/indigo supply gradient at all. */
export type Signal = 'empty' | 'full' | 'outage' | 'ok';

export const CATEGORY_SIGNAL: Record<StationCategory, Signal> = {
  not_installed: 'outage',
  unusable: 'outage',
  outage: 'outage',
  empty: 'empty',
  starving: 'empty',
  full: 'full',
  flooded: 'full',
  healthy: 'ok',
};

export const CATEGORY_LABEL: Record<StationCategory, string> = {
  not_installed: 'Not installed',
  unusable: 'Unusable',
  outage: 'Outage',
  empty: 'Empty',
  full: 'Full',
  starving: 'Starving',
  flooded: 'Flooded',
  healthy: 'Healthy',
};

/** The categories a dispatcher can filter by, worst-first. */
export const FILTERABLE_CATEGORIES: readonly StationCategory[] = [
  'unusable',
  'outage',
  'empty',
  'full',
  'starving',
  'flooded',
  'healthy',
  'not_installed',
];

// ---------------------------------------------------------------------------
// Base scores
// ---------------------------------------------------------------------------

/**
 * Installed but neither renting nor returning, or reporting no usable slots at
 * all. The station is a brick: it serves nobody in either direction. Ranked
 * above a plain outage because both directions are dead simultaneously.
 */
export const BASE_UNUSABLE = 90;

/**
 * The operator has flagged one direction closed while the other still works.
 * Slightly below Unusable because half the station is still doing its job.
 */
export const BASE_OUTAGE = 85;

/**
 * Zero rentable bikes. Every rider who walks up leaves without a bike. This is
 * a total service failure in one direction, not a supply gradient, which is why
 * it sits well clear of Starving.
 */
export const BASE_EMPTY = 70;

/** Zero open docks. Every rider arriving cannot end their trip here. */
export const BASE_FULL = 70;

/**
 * Fill ratio at or below {@link STARVING_FILL_RATIO}. The station still works
 * but is minutes from failing. The base ramps from here up to {@link BASE_EMPTY}
 * as the ratio falls to zero, so a station at 2% reads as nearly-empty rather
 * than snapping from 45 to 70 at the last bike.
 */
export const BASE_STARVING = 45;

/** Mirror of {@link BASE_STARVING} for the full side, ramping to {@link BASE_FULL}. */
export const BASE_FLOODED = 45;

/** At or below this fill ratio a station is Starving. */
export const STARVING_FILL_RATIO = 0.15;

/** At or above this fill ratio a station is Flooded. */
export const FLOODED_FILL_RATIO = 0.85;

/**
 * A healthy station still scores 0-20 by how far it has drifted from a 50/50
 * mix — 0 at perfect balance, 20 at the edge of Starving or Flooded. This is
 * what makes the bottom of the queue meaningful: it ranks "fine, but drifting"
 * above "genuinely balanced" without ever competing with a real failure.
 */
export const HEALTHY_MAX_BASE = 20;

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

/**
 * Capacity weight = clamp(FLOOR + SPAN x (capacity / p90), .., CAP).
 *
 * A 60-dock station running dry strands far more riders than a 12-dock one, so
 * severity scales with how many people the station serves. The floor keeps a
 * small station's genuine outage from being dismissed, and the cap stops the
 * handful of enormous transit-hub stations from permanently owning the top of
 * the queue regardless of what is actually wrong.
 */
export const CAPACITY_WEIGHT_FLOOR = 0.75;
export const CAPACITY_WEIGHT_SPAN = 0.5;
export const CAPACITY_WEIGHT_CAP = 1.25;

/**
 * Fallback p90 capacity, used only when the caller does not supply one (unit
 * tests, or a single-station calculation). The live value is computed from the
 * feed on every refresh so the model self-calibrates as the network grows.
 */
export const DEFAULT_P90_CAPACITY = 54;

/** Below this age a report is simply current and costs nothing. */
export const STALENESS_GRACE_MINUTES = 15;

/** At and beyond this age the counts are no longer trustworthy at all. */
export const STALENESS_MAX_MINUTES = 60;

/**
 * Staleness adds *uncertainty*, not severity, so it is a modest additive
 * penalty rather than a multiplier: a station we cannot see might be fine, but
 * a dispatcher should still be nudged to look. It ramps linearly from 0 at 15
 * minutes to +10 at 60.
 */
export const STALENESS_MAX_PENALTY = 10;

/**
 * Past {@link STALENESS_MAX_MINUTES} the station is marked Not reporting: still
 * shown, visually flagged, and excluded from the "needs a truck" count. Sending
 * a truck on an hour-old reading is how you drive to a station that fixed
 * itself forty minutes ago.
 */
export const NOT_REPORTING_AFTER_MINUTES = STALENESS_MAX_MINUTES;

/** Score at or above which a station is counted as needing a truck. */
export const NEEDS_TRUCK_THRESHOLD = 55;

// ---------------------------------------------------------------------------
// Breakdown shape
// ---------------------------------------------------------------------------

export interface ScoreFactor {
  /** Short label, e.g. "Empty" or "Capacity weight". */
  label: string;
  /** One line of plain English stating the inputs and the arithmetic. */
  detail: string;
  /** Signed points this factor contributed to the final score. */
  delta: number;
}

export interface ScoreBreakdown {
  stationId: string;
  category: StationCategory;
  signal: Signal;
  /** False for not-installed stations, which are excluded from ranking. */
  scored: boolean;

  /** The base score and the rule that produced it, in plain English. */
  base: number;
  baseRule: string;

  fill: {
    bikes: number;
    docks: number;
    usableSlots: number;
    /** bikes / usableSlots, or null when the station reports no usable slots. */
    ratio: number | null;
  };

  capacity: {
    capacity: number;
    p90Capacity: number;
    /** The multiplier applied to the base. */
    weight: number;
    /** Points added or removed by that multiplier. */
    contribution: number;
    /** True when the raw weight was clipped by the cap. */
    capped: boolean;
  };

  staleness: {
    lastReportedMs: number | null;
    /** Null when the feed carried no usable timestamp for this station. */
    ageMinutes: number | null;
    penalty: number;
    notReporting: boolean;
    /** Why it is flagged: too old, or never reported at all. */
    reason: 'current' | 'aging' | 'stale' | 'never-reported';
  };

  /** base x capacity weight, before the staleness penalty. */
  weighted: number;
  /** Final, clamped and rounded 0-100. */
  score: number;
  /** Score >= threshold, is scored, and is actually reporting. */
  needsTruck: boolean;

  /** Every contribution, largest absolute first. Drives the hover card. */
  factors: ScoreFactor[];
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (r: number) => `${Math.round(r * 100)}%`;

interface BaseResult {
  category: StationCategory;
  base: number;
  rule: string;
}

/**
 * Classification, in strict priority order. The first rule that matches wins,
 * so an outage flag beats an empty count — a station nobody can rent from
 * because it is switched off is a different job than one that just ran out.
 */
function classify(
  status: StationStatus,
  fillRatio: number | null,
  usableSlots: number,
): BaseResult {
  const { bikesAvailable: bikes, docksAvailable: docks } = status;

  if (!status.isInstalled) {
    return {
      category: 'not_installed',
      base: 0,
      rule: 'Station is not installed, so it is excluded from ranking.',
    };
  }

  if ((!status.isRenting && !status.isReturning) || usableSlots === 0) {
    return {
      category: 'unusable',
      base: BASE_UNUSABLE,
      rule:
        usableSlots === 0
          ? 'Reports no usable slots at all — neither bikes nor open docks.'
          : 'Installed but neither renting nor returning: the station serves nobody.',
    };
  }

  if ((!status.isRenting && bikes > 0) || !status.isReturning) {
    return {
      category: 'outage',
      base: BASE_OUTAGE,
      rule: !status.isRenting
        ? `Operator has closed rentals while ${bikes} bike${bikes === 1 ? '' : 's'} sit here.`
        : 'Operator has closed returns: arriving riders cannot end a trip here.',
    };
  }

  if (bikes === 0) {
    return {
      category: 'empty',
      base: BASE_EMPTY,
      rule: 'No rentable bikes: every rider who walks up leaves without one.',
    };
  }

  if (docks === 0) {
    return {
      category: 'full',
      base: BASE_FULL,
      rule: 'No open docks: every arriving rider is stuck holding a bike.',
    };
  }

  // usableSlots > 0 is guaranteed above, so a ratio exists from here on.
  const ratio = fillRatio ?? 0;

  if (ratio <= STARVING_FILL_RATIO) {
    // Ramp 45 -> 70 as the ratio falls from 15% to 0%, so the approach to
    // empty is continuous with BASE_EMPTY rather than a cliff at the last bike.
    const t = 1 - ratio / STARVING_FILL_RATIO;
    return {
      category: 'starving',
      base: BASE_STARVING + (BASE_EMPTY - BASE_STARVING) * t,
      rule: `Only ${pct(ratio)} full (${bikes} of ${usableSlots} usable slots) — at or below the ${pct(
        STARVING_FILL_RATIO,
      )} starving line.`,
    };
  }

  if (ratio >= FLOODED_FILL_RATIO) {
    const t = (ratio - FLOODED_FILL_RATIO) / (1 - FLOODED_FILL_RATIO);
    return {
      category: 'flooded',
      base: BASE_FLOODED + (BASE_FULL - BASE_FLOODED) * t,
      rule: `${pct(ratio)} full (${bikes} of ${usableSlots} usable slots) — at or above the ${pct(
        FLOODED_FILL_RATIO,
      )} flooded line.`,
    };
  }

  // Healthy: 0 at a 50/50 mix, rising to HEALTHY_MAX_BASE at either threshold.
  const drift = Math.abs(ratio - 0.5);
  const span = 0.5 - STARVING_FILL_RATIO;
  return {
    category: 'healthy',
    base: (HEALTHY_MAX_BASE * drift) / span,
    rule: `${pct(ratio)} full — between the starving and flooded lines. Scored only by its ${pct(
      drift,
    )} drift from an even mix.`,
  };
}

export function scoreStation(
  info: StationInfo,
  status: StationStatus,
  now: number,
  p90Capacity: number = DEFAULT_P90_CAPACITY,
): ScoreBreakdown {
  const bikes = status.bikesAvailable;
  const docks = status.docksAvailable;
  const usableSlots = bikes + docks;
  const ratio = usableSlots > 0 ? bikes / usableSlots : null;

  const classified = classify(status, ratio, usableSlots);
  const { category, rule } = classified;
  const scored = category !== 'not_installed';

  /*
   * Every value below is rounded to its *displayed* precision before it feeds
   * the next step. The Explain screen exists so a dispatcher can check the
   * arithmetic by hand; if the receipt showed 53.3 x 1.12 and printed 59.8
   * because the real multiplicands were 53.333 and 1.1204, the one screen whose
   * job is to earn trust would be visibly failing to add up. Carrying full
   * precision internally and rounding only at render is the more "correct"
   * choice mathematically and the wrong one here — the differences are under a
   * fifth of a point on an integer 0-100 scale.
   */
  const base = round1(classified.base);

  // --- Capacity weight -----------------------------------------------------
  const safeP90 = p90Capacity > 0 ? p90Capacity : DEFAULT_P90_CAPACITY;
  const rawWeight = CAPACITY_WEIGHT_FLOOR + CAPACITY_WEIGHT_SPAN * (info.capacity / safeP90);
  const capped = rawWeight > CAPACITY_WEIGHT_CAP;
  const weight = Math.round(Math.min(rawWeight, CAPACITY_WEIGHT_CAP) * 100) / 100;
  const weighted = scored ? round1(base * weight) : 0;
  const capacityContribution = round1(weighted - (scored ? base : 0));

  // --- Staleness -----------------------------------------------------------
  let ageMinutes: number | null = null;
  let penalty = 0;
  let notReporting = false;
  let reason: ScoreBreakdown['staleness']['reason'] = 'current';

  if (status.lastReportedMs === null) {
    // No usable timestamp at all. We cannot vouch for these counts, so the
    // station carries full uncertainty and is kept out of the truck count.
    notReporting = true;
    penalty = scored ? STALENESS_MAX_PENALTY : 0;
    reason = 'never-reported';
  } else {
    // Clock skew between the feed and the browser can put a report a few
    // seconds in the future; treat that as "just now" rather than negative age.
    // Rounded here, not at render, so the age shown on the receipt is the age
    // the penalty was actually derived from.
    ageMinutes = round1(Math.max(0, (now - status.lastReportedMs) / 60_000));

    if (ageMinutes > STALENESS_GRACE_MINUTES) {
      const t = clamp(
        (ageMinutes - STALENESS_GRACE_MINUTES) /
          (STALENESS_MAX_MINUTES - STALENESS_GRACE_MINUTES),
        0,
        1,
      );
      penalty = scored ? round1(STALENESS_MAX_PENALTY * t) : 0;
      reason = 'aging';
    }

    if (ageMinutes > NOT_REPORTING_AFTER_MINUTES) {
      notReporting = true;
      reason = 'stale';
    }
  }

  const score = scored ? clamp(Math.round(weighted + penalty), 0, 100) : 0;

  // --- Factors (drives the hover card, largest absolute contribution first) --
  const factors: ScoreFactor[] = [];
  if (scored) {
    factors.push({ label: CATEGORY_LABEL[category], detail: rule, delta: base });

    if (Math.abs(capacityContribution) >= 0.05) {
      const dir = capacityContribution > 0 ? 'Larger' : 'Smaller';
      factors.push({
        label: 'Capacity weight',
        detail: `${dir} than typical: ${info.capacity} docks vs a ${safeP90}-dock 90th percentile, so severity is scaled x${weight.toFixed(
          2,
        )}${capped ? ' (capped)' : ''}.`,
        delta: capacityContribution,
      });
    }

    if (penalty > 0) {
      factors.push({
        label: 'Staleness',
        detail:
          ageMinutes === null
            ? 'This station has never reported, so its counts cannot be trusted.'
            : `Last reported ${Math.round(ageMinutes)} min ago, past the ${STALENESS_GRACE_MINUTES}-min grace window.`,
        delta: penalty,
      });
    }
  }
  factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    stationId: info.stationId,
    category,
    signal: CATEGORY_SIGNAL[category],
    scored,
    base,
    baseRule: rule,
    fill: { bikes, docks, usableSlots, ratio },
    capacity: {
      capacity: info.capacity,
      p90Capacity: safeP90,
      weight,
      contribution: capacityContribution,
      capped,
    },
    staleness: {
      lastReportedMs: status.lastReportedMs,
      ageMinutes,
      penalty,
      notReporting,
      reason,
    },
    weighted,
    score,
    needsTruck: scored && !notReporting && score >= NEEDS_TRUCK_THRESHOLD,
    factors,
  };
}
