/**
 * The five signal tones, plus plain ink.
 *
 * Every colored thing in the console — score badges, fill bars, status dots,
 * KPI deltas, donut slices — resolves its color through this one table, so a
 * palette change is a change in exactly one place.
 */
import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD } from '../model/score';

/**
 * Warm tones are empty-side problems (nobody can rent), cool tones are
 * full-side (nobody can return), and within each pair the saturated one is the
 * hard failure while the soft one is the warning:
 *
 *   empty  ← warn        |        flood-soft → flood
 *   no bikes / few bikes | few docks / no docks
 */
export type Tone = 'empty' | 'warn' | 'flood' | 'flood-soft' | 'ok' | 'mute' | 'ink';

export interface ToneSpec {
  /** The saturated color: text, bars, dots, strokes. */
  fg: string;
  /** The tint behind a badge or soft pill. */
  bg: string;
  /** The hairline around a tinted badge. */
  line: string;
}

export const TONE: Record<Tone, ToneSpec> = {
  empty: { fg: 'var(--color-empty)', bg: 'var(--color-empty-bg)', line: 'var(--color-empty-line)' },
  flood: { fg: 'var(--color-flood)', bg: 'var(--color-flood-bg)', line: 'var(--color-flood-line)' },
  'flood-soft': {
    fg: 'var(--color-flood-soft)',
    bg: 'var(--color-flood-soft-bg)',
    line: 'var(--color-flood-soft-line)',
  },
  warn: { fg: 'var(--color-warn)', bg: 'var(--color-warn-bg)', line: 'var(--color-warn-line)' },
  ok: { fg: 'var(--color-ok)', bg: 'var(--color-ok-bg)', line: 'var(--color-ok-line)' },
  mute: { fg: 'var(--color-mute)', bg: 'var(--color-mute-bg)', line: 'var(--color-mute-line)' },
  ink: { fg: 'var(--color-ink)', bg: 'var(--color-sunken)', line: 'var(--color-line)' },
};

/**
 * Score bands, shared by the badge and the Score Guide legend so the colors on
 * the board and the colors in the key can never disagree.
 *
 * They disagreed for a while anyway, because this claim was aspirational: the
 * amber floor here was a bare `40` while the legend published "55–69 Warning /
 * 0–54 Drifting". A station scoring 45 therefore rendered an amber badge next
 * to a key insisting amber began at 55 — the key was wrong about the board it
 * was a key to. Both bounds now read from the model, so the legend and the
 * badge derive from one source and the sentence above is finally true.
 */
export function toneForScore(score: number | null): Tone {
  if (score === null) return 'mute';
  if (score >= CRITICAL_THRESHOLD) return 'empty';
  if (score >= NEEDS_TRUCK_THRESHOLD) return 'warn';
  return 'ok';
}
