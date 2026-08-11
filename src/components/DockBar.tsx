import type { Signal } from '../model/score';
import { cn } from '../lib/cn';

/**
 * Segmented capacity bar: bikes as filled segments, open docks as empty ones.
 *
 * A fixed 20 segments rather than one per dock, so every row in the queue has
 * the same visual rhythm whether the station has 12 docks or 123 — the exact
 * counts sit beside it in mono and carry the precision. The two edge rules
 * below matter: a station with one bike left must not render identically to a
 * station with none, because that is the whole distinction the board exists to
 * make.
 */

const SEGMENTS = 20;

const FILL: Record<Signal, string> = {
  empty: 'var(--signal-empty)',
  full: 'var(--signal-full)',
  outage: 'var(--signal-outage)',
  ok: 'var(--ink)',
};

export interface DockBarProps {
  bikes: number;
  docks: number;
  signal: Signal;
  /** Colored only when the station is actually failing; healthy rows stay ink. */
  emphasize?: boolean;
  className?: string;
}

export function filledSegments(ratio: number | null): number {
  if (ratio === null) return 0;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return SEGMENTS;
  // Never round a non-empty station down to zero segments, and never round a
  // not-quite-full one up to a completely filled bar.
  return Math.min(SEGMENTS - 1, Math.max(1, Math.round(ratio * SEGMENTS)));
}

export function DockBar({ bikes, docks, signal, emphasize = false, className }: DockBarProps) {
  const usable = bikes + docks;
  const ratio = usable > 0 ? bikes / usable : null;
  const filled = filledSegments(ratio);
  const color = emphasize ? FILL[signal] : 'var(--ink)';

  // A station reporting no usable slots gets words, not a control. Twenty
  // unfilled segments read as "every dock is free" — the exact opposite of the
  // truth — and even a flat rule invites reading a quantity off it. There is no
  // quantity here.
  if (usable === 0) {
    return (
      <span className={cn('num text-[12px] text-[var(--ink-soft)]', className)}>
        no usable slots
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center gap-[2px]', className)}
      role="img"
      aria-label={`${bikes} bikes, ${docks} open docks, ${Math.round((ratio ?? 0) * 100)}% full`}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className="h-[14px] w-[3px] rounded-[1px]"
          style={{ backgroundColor: i < filled ? color : 'var(--line)' }}
        />
      ))}
    </span>
  );
}
