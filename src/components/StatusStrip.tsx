import { cn } from '../lib/cn';

/**
 * The six headline numbers as a single hairline-divided strip.
 *
 * Deliberately not six cards: cards would give each stat its own box, its own
 * border and its own shadow, and the page would read as a wall of equal weight
 * with nothing to look at first.
 *
 * Where a number corresponds to something on the page, it is a control — the
 * mechanic count scrolls to and opens the mechanic section, the truck count
 * clears filters back to the full queue. A number you can act on should not
 * look identical to one you cannot, so actionable entries underline on hover
 * and take a real focus ring.
 *
 * Grid and hairline rules live in `.status-strip` in index.css — the column
 * count changes at two breakpoints and the "no left border at the start of a
 * row" rule has to change with it, which is unreadable as utility classes.
 */

export interface Stat {
  label: string;
  /** Null renders an em-dash, which reserves exactly the same space. */
  value: string | null;
  tone?: 'ink' | 'empty' | 'full' | 'outage';
  /** Makes the entry a button. */
  onClick?: () => void;
  /** Describes what activating it does, for screen readers. */
  actionLabel?: string;
}

const TONE: Record<NonNullable<Stat['tone']>, string> = {
  ink: 'var(--ink)',
  empty: 'var(--signal-empty-ink)',
  full: 'var(--signal-full)',
  outage: 'var(--signal-outage)',
};

export function StatusStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="status-strip">
      {stats.map((stat) => {
        const body = (
          <>
            <dd
              className={cn(
                'num text-[26px] leading-none font-semibold tabular-nums',
                stat.onClick && 'group-hover:underline group-hover:underline-offset-4',
              )}
              style={{ color: TONE[stat.tone ?? 'ink'] }}
            >
              {stat.value ?? '—'}
            </dd>
            <dt className="eyebrow mt-2">{stat.label}</dt>
          </>
        );

        return (
          <div key={stat.label}>
            {stat.onClick ? (
              <button
                type="button"
                onClick={stat.onClick}
                aria-label={stat.actionLabel ?? `${stat.label}: ${stat.value ?? 'no data'}`}
                className="group block w-full text-left"
              >
                {body}
              </button>
            ) : (
              body
            )}
          </div>
        );
      })}
    </dl>
  );
}
