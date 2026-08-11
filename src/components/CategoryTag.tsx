import { CATEGORY_LABEL, CATEGORY_SIGNAL, type Signal, type StationCategory } from '../model/score';
import { cn } from '../lib/cn';

/** Signal colors for *marks* — plates, bars, ticks. */
export const SIGNAL_COLOR: Record<Signal, string> = {
  empty: 'var(--signal-empty)',
  full: 'var(--signal-full)',
  outage: 'var(--signal-outage)',
  ok: 'var(--signal-ok)',
};

/**
 * Signal colors for *words*. Identical except red, which needs a slightly
 * darker cut to clear 4.5:1 as body text. Anywhere a signal color renders as
 * text on paper, use this map instead.
 */
export const SIGNAL_TEXT: Record<Signal, string> = {
  ...SIGNAL_COLOR,
  empty: 'var(--signal-empty-ink)',
};

/**
 * The failure mode as plain text in its signal color. Not a pill: boxes are
 * reserved for plates and interactive cards, and hundreds of rows of filled
 * badges would turn the queue into confetti.
 */
export function CategoryTag({
  category,
  className,
}: {
  category: StationCategory;
  className?: string;
}) {
  const signal = CATEGORY_SIGNAL[category];
  const quiet = category === 'healthy' || category === 'not_installed';

  return (
    <span
      className={cn(
        'text-[13px] leading-none',
        quiet ? 'text-[var(--ink-soft)]' : 'font-medium',
        className,
      )}
      style={quiet ? undefined : { color: SIGNAL_TEXT[signal] }}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}
