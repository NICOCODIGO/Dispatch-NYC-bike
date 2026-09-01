import { OUTCOME_DELTA_TOLERANCE } from '../model/verify';
import { formatAgo, formatClock } from '../lib/time';

/**
 * Small phrasings the situation headline and the per-screen findings share, so
 * "how long" and "which way it is trending" read the same everywhere.
 */

/** "2h 40m" from a minute count. */
export function elapsed(minutes: number): string {
  return formatAgo(minutes * 60_000);
}

/** "since 09:40" from an epoch-ms timestamp. */
export function since(ms: number): string {
  return `since ${formatClock(ms).slice(0, 5)}`;
}

/**
 * " and getting worse (+8)" once the score has climbed past the noise floor,
 * empty string otherwise — so the clause only appears when it means something.
 */
export function trend(delta: number): string {
  return delta > OUTCOME_DELTA_TOLERANCE ? ` and getting worse (+${delta})` : '';
}
