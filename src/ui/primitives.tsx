import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { TipBody, TipTitle, Tooltip } from './Tooltip';
import { linkifyNode } from '../content/definitions';
import { TONE, toneForScore, type Tone } from './tone';
import { cn } from '../lib/cn';

/* ---------------------------------------------------------------------------
   Card — the white hairline panel every screen is built out of.
--------------------------------------------------------------------------- */

export function Card({
  children,
  className,
  style,
  pad = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  pad?: boolean;
}) {
  return (
    <section className={cn('card', pad && 'p-4', className)} style={style}>
      {children}
    </section>
  );
}

/** Card title row: eyebrow on the left, anything on the right. */
export function CardHead({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-3.5 pt-3 pb-2.5', className)}>
      <h2 className="eyebrow text-[9px]">{title}</h2>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Buttons.
--------------------------------------------------------------------------- */

export type ButtonVariant = 'dark' | 'outline' | 'ghost' | 'green';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  dark: 'bg-[var(--color-ink)] text-white border border-[var(--color-ink)] hover:bg-[#3a332b]',
  outline:
    'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] hover:border-[var(--color-ink-3)]',
  ghost:
    'bg-transparent text-[var(--color-ink-2)] border border-transparent hover:text-[var(--color-ink)]',
  green: 'bg-[var(--color-ok)] text-white border border-[var(--color-ok)] hover:brightness-95',
};

export function Button({
  children,
  icon,
  variant = 'outline',
  size = 'md',
  onClick,
  className,
  type = 'button',
  title,
  ariaLabel,
}: {
  children?: ReactNode;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit';
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]',
        BUTTON_VARIANT[variant],
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 12 : 13} />}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Pills.
--------------------------------------------------------------------------- */

/** The neutral status pill used in table cells: Empty, Flooded, Full, Low… */
export function StatusPill({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[var(--color-line)] bg-[var(--color-sunken)] px-2 py-[2px] text-[10px] font-medium text-[var(--color-ink-2)]',
        className,
      )}
    >
      {label}
    </span>
  );
}

/** A tinted pill that carries a tone — CRITICAL, MEDIUM, Action Required. */
export function TonePill({
  label,
  tone,
  className,
  uppercase = false,
}: {
  label: string;
  tone: Tone;
  className?: string;
  uppercase?: boolean;
}) {
  const t = TONE[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold tracking-[0.06em]',
        uppercase && 'uppercase',
        className,
      )}
      style={{ color: t.fg, backgroundColor: t.bg, borderColor: t.line }}
    >
      {label}
    </span>
  );
}

/**
 * A filter chip. Selected chips fill with their signal color; unselected ones
 * stay quiet and carry a small colored dot instead, so the row reads as "these
 * two are on" at a glance rather than as five equally loud buttons.
 */
export function FilterChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: Tone;
  active: boolean;
  onClick: () => void;
}) {
  const t = TONE[tone];

  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={true}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[11px] font-medium text-white transition-colors"
        style={{ backgroundColor: t.fg }}
      >
        <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-white/90" />
        {label}
        <span className="num rounded-full bg-white/20 px-1.5 py-px text-[10px] font-semibold">
          {count}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={false}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-[5px] text-[11px] font-medium text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
    >
      <Dot tone={tone} size={5} />
      {label}
      <span className="num rounded-full bg-[var(--color-sunken)] px-1.5 py-px text-[10px] text-[var(--color-ink-3)]">
        {count}
      </span>
    </button>
  );
}

export function Dot({ tone, size = 6 }: { tone: Tone; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: TONE[tone].fg }}
    />
  );
}

/* ---------------------------------------------------------------------------
   The score badge — the one element repeated on every screen.

   A tinted rounded square holding a mono numeral, colored by score band. An
   unscored station shows "?" in mute rather than a zero, because zero would
   claim the station was measured and found fine.
--------------------------------------------------------------------------- */

export function ScoreBadge({
  score,
  size = 'md',
  className,
}: {
  score: number | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tone = toneForScore(score);
  const t = TONE[tone];
  const box =
    size === 'sm'
      ? 'h-[24px] min-w-[28px] text-[11px] rounded-[6px]'
      : size === 'lg'
        ? 'h-[42px] min-w-[42px] text-[19px] rounded-[9px]'
        : 'h-[30px] min-w-[30px] text-[13px] rounded-[7px]';

  return (
    <span
      className={cn(
        'num inline-flex items-center justify-center border px-1.5 font-semibold tabular-nums',
        box,
        className,
      )}
      style={{ color: t.fg, backgroundColor: t.bg, borderColor: t.line }}
    >
      {score === null ? '?' : score}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Bars.
--------------------------------------------------------------------------- */

/** A fill bar. `value` is 0–1; null draws an empty track. */
export function Bar({
  value,
  tone = 'ok',
  height = 5,
  className,
  trackClassName,
}: {
  value: number | null;
  tone?: Tone;
  height?: number;
  className?: string;
  trackClassName?: string;
}) {
  return (
    <span
      className={cn(
        'block w-full overflow-hidden rounded-full bg-[var(--color-line-soft)]',
        trackClassName,
        className,
      )}
      style={{ height }}
    >
      {value !== null && value > 0 && (
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: TONE[tone].fg }}
        />
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Stat cards — the KPI row at the top of most screens.
--------------------------------------------------------------------------- */

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Small unit rendered after the value at reduced size, e.g. "%" or "min". */
  unit?: string;
  tone?: Tone;
  /** The line under the value. */
  foot?: ReactNode;
  /** Draws a fill bar in place of the footer text. */
  bar?: { value: number; tone: Tone };
  /** Navigates to the screen this number summarises. */
  to?: string;
  /** Acts on the current screen instead of leaving it. */
  onClick?: () => void;
  /** What activating it does, for screen readers. */
  actionLabel?: string;
  /**
   * The definition, for anyone who does not already know the vocabulary.
   *
   * The label says what it is and the footer says what it means; this is the
   * third layer — why the number is drawn the way it is, and what to do about
   * it. Marked with a quiet dot so it is discoverable without shouting.
   */
  hint?: string;
}

/**
 * A headline number.
 *
 * Where a number summarises something you can go and act on, the card is a
 * control: Fleet opens the fleet, Stale opens the unverified list, Empty
 * filters the queue in place. A number you can act on must not look identical
 * to one you cannot, so interactive cards take a hover edge and a real focus
 * ring, and inert ones stay flat.
 */
export function StatCard({
  label,
  value,
  unit,
  tone = 'ink',
  foot,
  bar,
  to,
  onClick,
  actionLabel,
  hint,
}: StatCardProps) {
  const interactive = Boolean(to || onClick);

  const body = (
    <>
      <span className="eyebrow flex items-center gap-1 text-[9px]">
        {label}
        {hint && (
          <Icon
            name="info"
            size={10}
            className="opacity-35 transition-opacity group-hover:opacity-100"
          />
        )}
        {interactive && (
          <Icon
            name="chevron-right"
            size={10}
            className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
      </span>
      <span
        className="num mt-1.5 block text-[22px] leading-none font-semibold tabular-nums"
        style={{ color: TONE[tone].fg }}
      >
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-medium">{unit}</span>}
      </span>
      {/* A bar and a caption are not alternatives — the bar shows the value's
          position, the caption says what position is good. The fill card needs
          both, and dropping one left the only percentage on the row unexplained. */}
      {bar && (
        <span className="mt-2.5 block">
          <Bar value={bar.value} tone={bar.tone} height={5} />
        </span>
      )}
      {foot && <span className="mt-1.5 block text-[10px] text-[var(--color-ink-3)]">{foot}</span>}
    </>
  );

  const shell = cn(
    'card group flex min-w-0 flex-col justify-between px-3 py-2.5 text-left',
    interactive && 'transition-colors hover:border-[var(--color-ink-3)]',
  );

  if (to) {
    return (
      <Link to={to} className={shell} aria-label={actionLabel} title={hint}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell} aria-label={actionLabel} title={hint}>
        {body}
      </button>
    );
  }

  return (
    <div className={shell} title={hint}>
      {body}
    </div>
  );
}

/** The "↑4 vs 1h ago" line under a stat. */
export function Delta({
  direction,
  value,
  suffix,
}: {
  direction: 'up' | 'down' | 'flat';
  value: string;
  suffix?: string;
}) {
  const tone: Tone = direction === 'up' ? 'empty' : direction === 'down' ? 'flood' : 'mute';
  const glyph = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '↔';
  return (
    <>
      <span className="num font-semibold" style={{ color: TONE[tone].fg }}>
        {glyph}
        {value}
      </span>
      {suffix && <span className="ml-1">{suffix}</span>}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Form controls.
--------------------------------------------------------------------------- */

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  width?: number;
}) {
  return (
    <label className={cn('relative block', className)} style={width ? { width } : undefined}>
      <span className="sr-only">{placeholder}</span>
      <Icon
        name="search"
        size={14}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-3)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] py-1.5 pr-3 pl-7.5 text-[12px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-ink-3)] focus:outline-none"
      />
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <label className="relative inline-block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] py-1.5 pr-7 pl-2.5 text-[12px] text-[var(--color-ink)] focus:border-[var(--color-ink-3)] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={14}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[var(--color-ink-3)]"
      />
    </label>
  );
}

/** Two-or-more-way segmented toggle: Bikes|Docks, Active Tickets|History. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors',
              active
                ? 'bg-[var(--color-sunken)] text-[var(--color-ink)] shadow-[inset_0_0_0_1px_var(--color-line)]'
                : 'text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Table helpers. Real <table> markup on every screen — these only carry the
   shared padding and the sortable-header affordance.
--------------------------------------------------------------------------- */

/**
 * A column header's definition.
 *
 * `what` is the number and its unit, `good` is how to read it. Where a column
 * holds a fixed vocabulary, `values` glosses each one — a reader meeting
 * "Flooded" for the first time should not have to guess whether it involves
 * water.
 */
export interface ColumnHelpSpec {
  what: ReactNode;
  good?: ReactNode;
  values?: { label: string; gloss: string }[];
}

export function ColumnHelp({ title, spec }: { title: string; spec: ColumnHelpSpec }) {
  return (
    <Tooltip
      help
      width={290}
      content={
        <>
          <TipTitle>{title}</TipTitle>
          <TipBody>{spec.what}</TipBody>
          {spec.good && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-ink-2)]">
              {spec.good}
            </p>
          )}
          {spec.values && (
            <ul className="mt-2 flex flex-col gap-1 border-t border-[var(--color-line-soft)] pt-1.5">
              {spec.values.map((v) => (
                <li key={v.label} className="text-[9.5px] leading-snug text-[var(--color-ink-2)]">
                  <span className="font-semibold text-[var(--color-ink)]">{v.label}</span> —{' '}
                  {v.gloss}
                </li>
              ))}
            </ul>
          )}
        </>
      }
    >
      <span className="inline-flex text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]">
        <Icon name="info" size={10} />
      </span>
    </Tooltip>
  );
}

export function Th({
  children,
  className,
  align = 'left',
  sortable = false,
  width,
  onSort,
  active = false,
  dir = 'desc',
  help,
}: {
  /** Omitted for spacer columns that exist only to hold an action. */
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  width?: number;
  /** Makes the header a real sort control. */
  onSort?: () => void;
  active?: boolean;
  dir?: 'asc' | 'desc';
  /** Explains a column whose meaning is not literal. */
  help?: ColumnHelpSpec;
}) {
  const label = (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {children}
      <SortGlyph active={active} dir={dir} />
    </span>
  );

  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      aria-sort={onSort ? (active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
      className={cn(
        'eyebrow border-b border-[var(--color-line)] px-3 py-2.5 align-middle font-semibold',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        active && 'text-[var(--color-ink)]',
        className,
      )}
    >
      {/* No `flex-row-reverse` on right-aligned columns: it put the help icon
          to the *left* of the label, so "Bikes / Open" read as "ⓘ Bikes". The
          th's own text-align already pushes this inline-flex box to the right;
          the order inside it should stay label-then-icon everywhere. */}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        {onSort ? (
          /* `text-transform: inherit` because Tailwind's Preflight resets
             buttons to `none`, which quietly stripped `.eyebrow`'s uppercase
             from every sortable header — so "Score" sat title-case beside an
             uppercase "YOUR CALL" in the same row, across every table. */
          <button
            type="button"
            onClick={onSort}
            className="cursor-pointer [text-transform:inherit] hover:text-[var(--color-ink)]"
          >
            {label}
          </button>
        ) : sortable ? (
          label
        ) : (
          children
        )}
        {help && <ColumnHelp title={typeof children === 'string' ? children : ''} spec={help} />}
      </span>
    </th>
  );
}

/** Both carets at rest; the engaged direction goes solid when a column sorts. */
function SortGlyph({ active = false, dir = 'desc' }: { active?: boolean; dir?: 'asc' | 'desc' }) {
  return (
    <svg
      aria-hidden="true"
      width="8"
      height="10"
      viewBox="0 0 8 10"
      className={active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]'}
    >
      <path d="M4 0 7 3.4H1z" fill="currentColor" opacity={active && dir === 'asc' ? 1 : 0.4} />
      <path d="M4 10 1 6.6h6z" fill="currentColor" opacity={active && dir === 'desc' ? 1 : 0.4} />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   Banner — feed trouble, stated on the board rather than replacing it.
--------------------------------------------------------------------------- */

export function Banner({
  tone,
  icon,
  children,
}: {
  tone: Tone;
  icon: IconName;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[11px] leading-relaxed"
      style={{ backgroundColor: t.bg, borderColor: t.line, color: t.fg }}
    >
      <Icon name={icon} size={14} className="mt-px shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Finding — the sentence at the top of a screen that says what the numbers
   below it mean.

   A console full of counts makes the reader do the interpreting. This states
   the conclusion in words, then shows the figures it was drawn from, so the
   page leads with a claim it is willing to defend rather than a wall of data.
--------------------------------------------------------------------------- */

export function Finding({
  tone = 'ink',
  icon,
  headline,
  detail,
  stats,
}: {
  tone?: Tone;
  icon: IconName;
  headline: ReactNode;
  detail?: ReactNode;
  stats?: { label: string; value: ReactNode; tone?: Tone }[];
}) {
  const t = TONE[tone];

  return (
    <section
      className="rounded-lg border bg-[var(--color-surface)]"
      style={{ borderColor: t.line, borderLeft: `3px solid ${t.fg}` }}
    >
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
        <span
          aria-hidden="true"
          className="mt-px flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: t.bg, color: t.fg }}
        >
          <Icon name={icon} size={14} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] leading-snug font-semibold text-[var(--color-ink)]">
            {linkifyNode(headline)}
          </p>
          {detail && (
            <p className="mt-1 max-w-[100ch] text-[11px] leading-relaxed text-[var(--color-ink-2)]">
              {/* The callouts are where the jargon is densest, so the prose
                  teaches itself rather than relying on anyone remembering to
                  wrap each term by hand. */}
              {linkifyNode(detail)}
            </p>
          )}
        </div>
      </div>

      {stats && stats.length > 0 && (
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--color-line-soft)] px-4 py-2.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <dd
                className="num text-[13px] font-semibold"
                style={{ color: TONE[s.tone ?? 'ink'].fg }}
              >
                {s.value}
              </dd>
              <dt className="text-[10px] text-[var(--color-ink-3)]">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * "You arrived here from somewhere else, and here is the way back."
 *
 * Shown on every deep-link arrival. Following a link into a thousand-row table
 * and losing your place is worse than not having the link, so no destination
 * is allowed to be a one-way trip.
 */
export function ArrivalBanner({
  from,
  back,
  detail,
  onDismiss,
}: {
  from: string;
  back: string | null;
  detail?: ReactNode;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-[11px]"
      style={{ backgroundColor: TONE.flood.bg, borderColor: TONE.flood.line }}
    >
      <Icon name="chevron-left" size={13} style={{ color: TONE.flood.fg }} />
      <span className="text-[var(--color-ink-2)]">
        Arrived from <span className="font-semibold text-[var(--color-ink)]">{from}</span>
        {detail && <> — {detail}</>}
      </span>
      <span className="ml-auto flex items-center gap-3">
        {back && (
          <Link
            to={back}
            className="font-medium underline underline-offset-2"
            style={{ color: TONE.flood.fg }}
          >
            Back to {from}
          </Link>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="cursor-pointer text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          <Icon name="x" size={13} />
        </button>
      </span>
    </div>
  );
}

/** Marks a panel the live feed cannot supply, so nobody reads it as measured. */
export function FixtureNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-[9.5px] leading-snug text-[var(--color-ink-3)] italic">
      <Icon name="info" size={11} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/* ---------------------------------------------------------------------------
   Pagination.

   Numbered pages rather than an endless scroll: a dispatch board is a list of
   discrete work, and "page 6 of 84" is a position you can hold in your head
   and come back to. The window keeps first and last always reachable and
   collapses the middle, so the control never changes width as you move.
--------------------------------------------------------------------------- */

/** Page indices to render, with 'gap' marking a collapsed run. 0-indexed. */
export function pageWindow(page: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);

  const out: (number | 'gap')[] = [0];
  const start = Math.max(1, page - 1);
  const end = Math.min(count - 2, page + 1);

  if (start > 1) out.push('gap');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < count - 2) out.push('gap');
  out.push(count - 1);

  return out;
}

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const step = (delta: number) => onChange(Math.min(pageCount - 1, Math.max(0, page + delta)));

  return (
    <nav aria-label="Queue pages" className="flex items-center gap-1">
      <PageButton
        onClick={() => step(-1)}
        disabled={page === 0}
        ariaLabel="Previous page"
        wide
      >
        <Icon name="chevron-left" size={12} />
        Prev
      </PageButton>

      {pageWindow(page, pageCount).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap${i}`} aria-hidden="true" className="num px-1 text-[10px] text-[var(--color-ink-3)]">
            …
          </span>
        ) : (
          <PageButton
            key={item}
            onClick={() => onChange(item)}
            active={item === page}
            ariaLabel={`Page ${item + 1}`}
            current={item === page}
          >
            {item + 1}
          </PageButton>
        ),
      )}

      <PageButton
        onClick={() => step(1)}
        disabled={page >= pageCount - 1}
        ariaLabel="Next page"
        wide
      >
        Next
        <Icon name="chevron-right" size={12} />
      </PageButton>
    </nav>
  );
}

function PageButton({
  children,
  onClick,
  disabled = false,
  active = false,
  current = false,
  wide = false,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  current?: boolean;
  wide?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'num inline-flex h-[24px] items-center justify-center gap-1 rounded-md border text-[10px] transition-colors',
        wide ? 'px-2' : 'min-w-[24px] px-1.5',
        active
          ? 'border-[var(--color-ink)] bg-[var(--color-ink)] font-semibold text-white'
          : 'border-transparent text-[var(--color-ink-2)] hover:border-[var(--color-line)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-ink)]',
        disabled && 'cursor-default opacity-35 hover:border-transparent hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Skeleton — a static tint while the first poll lands. No spinners, no pulse:
   a board that throbs reads as a board that is changing.
--------------------------------------------------------------------------- */

export function SkeletonRows({ rows = 8, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-b border-[var(--color-line-soft)] last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className="px-3 py-3">
              <span
                className="block h-[10px] rounded-full bg-[var(--color-line-soft)]"
                style={{ width: c === 1 ? '70%' : c === 0 ? 30 : '55%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function Td({
  children,
  className,
  align = 'left',
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'px-3 py-2 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
