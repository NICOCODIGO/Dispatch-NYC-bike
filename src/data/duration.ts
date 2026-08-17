import type { ScoreBreakdown } from '../model/score';
import type { Track } from '../model/verify';

/**
 * How long a station has been failing, and what that is worth.
 *
 * The queue ranked purely on present condition, so a station empty for five
 * minutes and one empty for four hours rendered identically and sorted
 * identically. The second is a worse failure by every measure a rider cares
 * about, and it is the one most likely to keep losing the tie-break and never
 * get served.
 *
 * ## Why this is a layer and not part of `score.ts`
 *
 * `scoreStation()` is a pure function of a single reading. That is what lets
 * the scheduled worker in /worker import the same module and be guaranteed to
 * agree with the live board, and it is what 133 tests pin down. Duration needs
 * history, so feeding it in would break both properties.
 *
 * Instead this composes on top: same displayed formula, same effect on rank,
 * and `score.ts` keeps its contract. If duration ever becomes a first-class
 * input, it belongs in the worker's time series rather than in a pure scorer.
 */

/** Most a long-running failure can add. */
export const DURATION_CAP = 15;

/** Points per hour above the dispatch threshold. Reaches the cap at 3h 45m. */
export const DURATION_PER_HOUR = 4;

export interface Duration {
  /** Epoch ms of the first poll that saw this station above the threshold. */
  failingSince: number;
  minutes: number;
  /** Points contributed, 0…DURATION_CAP. */
  points: number;
  /**
   * False when the session has not been running long enough for the figure to
   * mean anything. The board should not imply four minutes of evidence is a
   * measurement of how long something has been broken.
   */
  confident: boolean;
}

export function durationPoints(minutes: number): number {
  return Math.min(DURATION_CAP, Math.round((minutes / 60) * DURATION_PER_HOUR));
}

/** Below this the reading is just "we only started watching recently". */
const CONFIDENCE_MINUTES = 3;

/**
 * Index every tracked station by how long it has been continuously failing.
 *
 * Built from the same snapshot history Analytics reads, so the queue and the
 * "nobody is fixing these" panel cannot disagree about how long something has
 * been broken.
 */
export function durationIndex(tracks: Track[] | null, now = Date.now()): Map<string, Duration> {
  const out = new Map<string, Duration>();
  if (!tracks) return out;

  for (const t of tracks) {
    // Resolved stations are no longer failing; their clock stopped.
    if (t.outcome === 'resolved') continue;

    const minutes = Math.max(0, Math.round((now - t.firstSeen) / 60_000));
    out.set(t.stationId, {
      failingSince: t.firstSeen,
      minutes,
      points: durationPoints(minutes),
      confident: minutes >= CONFIDENCE_MINUTES,
    });
  }

  return out;
}

export interface AdjustedScore {
  /** Final 0–100 after duration, clamped. */
  score: number;
  /** weighted + staleness + duration, before rounding and clamping. */
  raw: number;
  duration: Duration | null;
}

/**
 * The published formula, with duration folded in before the clamp.
 *
 * Added pre-clamp rather than to the finished score for the same reason the
 * model rounds at each step: a receipt that says 88 + 12 = 100 when the real
 * arithmetic ran 112.5 + 0 + 12 → clamped is a receipt that lies about its own
 * working.
 */
export function applyDuration(
  breakdown: ScoreBreakdown,
  duration: Duration | undefined,
): AdjustedScore {
  const points = duration?.confident ? duration.points : 0;
  const raw = breakdown.weighted + breakdown.staleness.penalty + points;

  return {
    score: Math.max(0, Math.min(100, Math.round(raw))),
    raw,
    duration: duration ?? null,
  };
}
