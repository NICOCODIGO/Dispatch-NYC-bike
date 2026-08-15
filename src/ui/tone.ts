/**
 * The five signal tones, plus plain ink.
 *
 * Every colored thing in the console — score badges, fill bars, status dots,
 * KPI deltas, donut slices — resolves its color through this one table, so a
 * palette change is a change in exactly one place.
 */
export type Tone = 'empty' | 'flood' | 'warn' | 'ok' | 'mute' | 'ink';

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
  warn: { fg: 'var(--color-warn)', bg: 'var(--color-warn-bg)', line: 'var(--color-warn-line)' },
  ok: { fg: 'var(--color-ok)', bg: 'var(--color-ok-bg)', line: 'var(--color-ok-line)' },
  mute: { fg: 'var(--color-mute)', bg: 'var(--color-mute-bg)', line: 'var(--color-mute-line)' },
  ink: { fg: 'var(--color-ink)', bg: 'var(--color-sunken)', line: 'var(--color-line)' },
};

/**
 * Score bands, shared by the badge and the Score Guide legend so the colors on
 * the board and the colors in the key can never disagree.
 */
export function toneForScore(score: number | null): Tone {
  if (score === null) return 'mute';
  if (score >= 70) return 'empty';
  if (score >= 40) return 'warn';
  return 'ok';
}
