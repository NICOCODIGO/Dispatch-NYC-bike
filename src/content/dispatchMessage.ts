import type { StationRow } from '../data/stationRow';
import { formatAgo } from '../lib/time';

/**
 * The instruction a driver actually receives.
 *
 * Written to be read aloud over a radio or pasted into a text, which drives
 * every formatting choice: the action first, the reasoning second, no jargon,
 * no score without the plain-English cause beside it. A driver does not need
 * to know what "flooded" means; they need to know to pick up thirty bikes.
 *
 * Kept out of the component because the message is the product here — the
 * dialog is just a way to send it — and because a string this operational
 * should be readable in one place rather than assembled across JSX.
 */

export function instructionFor(row: StationRow): string {
  const a = row.action;
  if (!a || a.kind === 'none') return 'assess on arrival';
  if (a.kind === 'mechanic') return 'mechanical fault — do not send a truck';
  return a.kind === 'drop' ? `drop ${a.bikes} bikes` : `collect ${a.bikes} bikes`;
}

/** Why, in a sentence a driver can act on without opening the dashboard. */
export function reasonFor(row: StationRow): string {
  const bikes = row.bikes ?? 0;
  const open = row.openDocks ?? 0;
  const pct = row.fill === null ? null : Math.round(row.fill * 100);

  const state =
    row.status === 'Empty'
      ? 'no bikes left, riders cannot rent'
      : row.status === 'Full'
        ? 'no open docks, riders cannot return'
        : row.status === 'Low'
          ? 'nearly out of bikes'
          : row.status === 'Flooded'
            ? 'nearly out of docks'
            : row.status.toLowerCase();

  const counts = `${bikes} bikes / ${open} open${pct === null ? '' : ` (${pct}% full)`}`;
  const age = row.duration?.confident
    ? `, this way for ${formatAgo(row.duration.minutes * 60_000)}`
    : '';

  return `${state} — ${counts}${age}`;
}

export function composeDispatch(row: StationRow, truckId: string, at: string): string {
  return [
    `DISPATCH · Truck ${truckId}`,
    `${row.name} — ${row.borough}`,
    row.stationNumber ? `Station ${row.stationNumber}` : null,
    '',
    `DO:   ${instructionFor(row)}`,
    `WHY:  ${reasonFor(row)}`,
    `SCORE: ${row.score ?? '—'}/100 · last reported ${row.updated}`,
    '',
    `Raised ${at} by Ops Center`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function mailtoFor(row: StationRow, body: string): string {
  const subject = `Dispatch: ${row.name} — ${instructionFor(row)}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function smsFor(body: string): string {
  return `sms:?&body=${encodeURIComponent(body)}`;
}
