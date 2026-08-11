import { Link } from 'react-router-dom';
import { CATEGORY_SIGNAL, type Signal, type StationCategory } from '../model/score';
import { cn } from '../lib/cn';

/**
 * The signature element.
 *
 * A bold Plex Mono numeral in a rounded-square plate, sized like a subway route
 * bullet, filled with the station's failure signal color. It appears identically
 * in the queue, the detail panel, the mechanic and unverified sections and the
 * Verify timeline, and clicking it anywhere opens that station's detail.
 *
 * Plate color is decided *here and only here*, from the station's category.
 * Callers pass a category, never a color — an earlier version let each screen
 * pass its own signal, and Verify ended up drawing black plates for stations
 * whose actual failure was Empty or Full.
 *
 * Two variants:
 *   fill    — the score is evidence. Solid signal color, white numeral.
 *   outline — the score exists but its inputs are too old to trust. No fill;
 *             the number is still readable but is visibly not a claim.
 */

export type PlateSize = 'sm' | 'md' | 'lg';
export type PlateVariant = 'fill' | 'outline';

/**
 * Every numeral is at least 19px **bold**, which is WCAG's large-text threshold
 * (18.66px bold) — so the plate needs 3:1 rather than 4.5:1 against its fill.
 * That matters because the red signal, #D6453D, is 4.40:1 on white:
 * comfortably over 3:1, fractionally under 4.5:1. Sizing the bullet to the
 * standard keeps the brand color exact *and* keeps the element accessible.
 *
 * The negative tracking is what lets a 3-digit "100" sit inside the small plate
 * without shrinking the type back below the threshold.
 */
const SIZES: Record<PlateSize, { box: string; text: string; radius: string }> = {
  sm: { box: 'h-[38px] w-[38px]', text: 'text-[19px]', radius: 'rounded-[8px]' },
  md: { box: 'h-[46px] w-[46px]', text: 'text-[22px]', radius: 'rounded-[10px]' },
  lg: { box: 'h-[68px] w-[68px]', text: 'text-[30px]', radius: 'rounded-[14px]' },
};

const FILL: Record<Signal, string> = {
  empty: 'var(--signal-empty)',
  full: 'var(--signal-full)',
  outage: 'var(--signal-outage)',
  ok: 'transparent',
};

/** Signal colors as *text*, where red needs its darker cut to stay legible. */
const INK: Record<Signal, string> = {
  empty: 'var(--signal-empty-ink)',
  full: 'var(--signal-full)',
  outage: 'var(--signal-outage)',
  ok: 'var(--ink-soft)',
};

export interface ScorePlateProps {
  score: number;
  category: StationCategory;
  size?: PlateSize;
  variant?: PlateVariant;
  /** Renders as a link to this station's detail. */
  to?: string;
  className?: string;
  ticking?: boolean;
  /** -1 inside the queue: the row already has one tab stop. */
  tabIndex?: number;
  ariaLabel?: string;
}

export function ScorePlate({
  score,
  category,
  size = 'sm',
  variant = 'fill',
  to,
  className,
  ticking = false,
  tabIndex,
  ariaLabel,
}: ScorePlateProps) {
  const s = SIZES[size];
  const signal = CATEGORY_SIGNAL[category];
  // A station that isn't installed has no urgency to report; showing "0" would
  // imply it was measured and found fine.
  const absent = category === 'not_installed';
  const outlined = variant === 'outline' || absent || signal === 'ok';

  const plate = (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center num font-bold tabular-nums tracking-[-0.03em] select-none',
        s.box,
        s.text,
        s.radius,
        ticking && 'plate-tick',
        className,
      )}
      style={{
        backgroundColor: outlined ? 'transparent' : FILL[signal],
        color: outlined ? INK[signal] : '#fff',
        boxShadow: outlined
          ? `inset 0 0 0 ${variant === 'outline' && !absent ? '2px' : '1px'} ${
              absent || signal === 'ok' ? 'var(--line)' : INK[signal]
            }`
          : undefined,
      }}
    >
      {absent ? '—' : score}
    </span>
  );

  if (!to) return plate;

  return (
    <Link
      to={to}
      tabIndex={tabIndex}
      className={cn('inline-flex', s.radius)}
      aria-label={
        ariaLabel ?? `Urgency ${absent ? 'not scored' : score}. Show the full calculation.`
      }
    >
      {plate}
    </Link>
  );
}
