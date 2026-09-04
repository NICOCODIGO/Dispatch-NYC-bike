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
  if (a.kind === 'mechanic') return 'mechanical fault — do not send a vehicle';
  return a.kind === 'drop' ? `drop ${a.bikes} bikes` : `collect ${a.bikes} bikes`;
}

/**
 * The second errand: what to take away.
 *
 * Kept as its own line rather than folded into the instruction above, because
 * "drop 12 bikes, load 4 dead ones" is two jobs with two different destinations
 * — the rack, and the back of the vehicle bound for the warehouse — and a
 * driver reading one run-on sentence over a radio will act on the first half.
 *
 * Returns null when there is nothing to say, which is most stations. A dispatch
 * note that always carries a line about dead bikes trains a driver to skip it,
 * and that line is the one that occasionally says "brakes".
 */
export function pickupLineFor(row: StationRow): string | null {
  const p = row.pickup;
  if (!p || p.load === 0) return null;

  const bikes = `${p.load} dead bike${p.load === 1 ? '' : 's'}`;
  return p.urgency === 'immediate'
    ? `also load ${bikes} — ${p.hazards > 0 ? 'unsafe to leave locked here' : 'they are blocking docks riders need'}`
    : `also load ${bikes} if there is room — routine sweep, no rush`;
}

/**
 * Bikes a rider has reported that nobody has checked yet.
 *
 * Deliberately not phrased as work for this crew: a rebalancing driver is not
 * the person who decides whether a reported bike is actually broken, and about
 * two thirds of these turn out to be fine. It is on the note so the driver is
 * not surprised by red docks that the load count does not account for.
 */
export function inspectLineFor(row: StationRow): string | null {
  const p = row.pickup;
  if (!p || p.inspect === 0) return null;
  return `${p.inspect} more reported but unchecked — leave for a mechanic`;
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

export function composeDispatch(row: StationRow, vehicleId: string, at: string): string {
  const pickup = pickupLineFor(row);
  const inspect = inspectLineFor(row);

  return [
    `DISPATCH · Vehicle ${vehicleId}`,
    `${row.name} — ${row.borough}`,
    row.stationNumber ? `Station ${row.stationNumber}` : null,
    '',
    `DO:   ${instructionFor(row)}`,
    // Indented under DO rather than given its own keyword: it is part of the
    // same stop, and a third label would imply a third errand.
    pickup ? `      ${pickup}` : null,
    inspect ? `      ${inspect}` : null,
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
