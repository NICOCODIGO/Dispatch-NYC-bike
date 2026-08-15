import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
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
    <div className={cn('flex items-center justify-between gap-3 px-3 pt-3 pb-2.5', className)}>
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
}: StatCardProps) {
  const interactive = Boolean(to || onClick);

  const body = (
    <>
      <span className="eyebrow flex items-center gap-1 text-[9px]">
        {label}
        {interactive && (
          <Icon
            name="chevron-right"
            size={10}
            className="opacity-0 transition-opacity group-hover:opacity-100"
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
      {bar ? (
        <span className="mt-2.5 block">
          <Bar value={bar.value} tone={bar.tone} height={5} />
        </span>
      ) : (
        <span className="mt-1.5 block text-[10px] text-[var(--color-ink-3)]">{foot}</span>
      )}
    </>
  );

  const shell = cn(
    'card flex min-w-0 flex-col justify-between px-3 py-2.5 text-left',
    interactive && 'group transition-colors hover:border-[var(--color-ink-3)]',
  );

  if (to) {
    return (
      <Link to={to} className={shell} aria-label={actionLabel}>
        {body}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell} aria-label={actionLabel}>
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
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

export function Th({
  children,
  className,
  align = 'left',
  sortable = false,
  width,
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  width?: number;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        'eyebrow border-b border-[var(--color-line)] px-3 py-2.5 align-middle font-semibold',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className,
      )}
    >
      {sortable ? (
        <span className="inline-flex items-center gap-1">
          {children}
          <SortGlyph />
        </span>
      ) : (
        children
      )}
    </th>
  );
}

function SortGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="8"
      height="10"
      viewBox="0 0 8 10"
      className="text-[var(--color-ink-3)]"
    >
      <path d="M4 0 7 3.4H1z" fill="currentColor" opacity="0.55" />
      <path d="M4 10 1 6.6h6z" fill="currentColor" opacity="0.55" />
    </svg>
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
