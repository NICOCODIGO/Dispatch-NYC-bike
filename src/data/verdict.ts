import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD, type ScoreBreakdown } from '../model/score';
import { laneOf } from '../model/triage';
import type { Tone } from '../ui/tone';

/**
 * What a score means — decided once, for every surface that says it out loud.
 *
 * The comparison `score >= NEEDS_TRUCK_THRESHOLD` had been written into the
 * drawer, the hover receipt, the readiness gate and the Score Guide separately.
 * Each was correct in isolation, which is exactly why the divergence was hard
 * to see: the drawer learned about unverified stations and grew a third case,
 * and the hover receipt — same station, same number, six inches away — kept
 * answering the two-case question and called an excluded station "below the
 * threshold". Two true sentences about two different questions, presented as
 * one verdict.
 *
 * So the *classification* lives here and the *prose* does not. A hover card has
 * room for eight words and a drawer has room for a paragraph; forcing them to
 * share a sentence would make one of them worse. They share the decision, which
 * is the part that was actually disagreeing.
 */
export type VerdictKind =
  /** At or above the critical line — jumps the queue. */
  | 'critical'
  /** At or above the dispatch line — worth a trip. */
  | 'dispatch'
  /** Below the dispatch line — drifting, still serving riders. */
  | 'below'
  /** Counts cannot be trusted, so there is no verdict to give. */
  | 'unverified'
  /** Mechanically out of service — no truck can fix it. */
  | 'mechanic';

export function verdictFor(breakdown: ScoreBreakdown, score: number): VerdictKind {
  // Lane first, deliberately. A station that is not reporting can still compute
  // a high score off stale counts, and `needsTruck` is false for it regardless
  // — which is how the old code produced a big red number above the words "no
  // truck needed yet". Neither answer was wrong; the question was.
  const lane = laneOf(breakdown);
  if (lane === 'unverified') return 'unverified';
  if (lane === 'mechanic') return 'mechanic';

  if (score >= CRITICAL_THRESHOLD) return 'critical';
  if (score >= NEEDS_TRUCK_THRESHOLD) return 'dispatch';
  return 'below';
}

/** One line, for places with no room to explain — the hover receipt. */
export const VERDICT_LINE: Record<VerdictKind, string> = {
  critical: `At or above the ${CRITICAL_THRESHOLD}-point critical line — send one now.`,
  dispatch: `At or above the ${NEEDS_TRUCK_THRESHOLD}-point dispatch threshold — needs a truck.`,
  below: `Below the ${NEEDS_TRUCK_THRESHOLD}-point dispatch threshold.`,
  unverified: 'Excluded from scoring — this is what it would score if the counts were trusted.',
  mechanic: 'A truck cannot fix this — it is mechanically out of service.',
};

export const VERDICT_TONE: Record<VerdictKind, Tone> = {
  critical: 'empty',
  dispatch: 'empty',
  below: 'ink',
  unverified: 'mute',
  mechanic: 'empty',
};

/** True when this verdict means a vehicle should actually be sent. */
export function wantsTruck(kind: VerdictKind): boolean {
  return kind === 'critical' || kind === 'dispatch';
}
