import { StatCard } from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import type { NetworkSummary } from '../model/summary';
import type { HardwareTotals } from '../data/hardware';
import { recoveryBand, recoveryRate, type RecoveryBand } from '../model/verify';
import type { SessionHistory } from '../state/useHistory';
import { formatAgo } from '../lib/time';
import { VEHICLES_ACTIVE, VEHICLES_TOTAL } from '../mock/data';

/**
 * The five headline numbers above the queue.
 *
 * Every card carries three layers, because a number alone is a quiz: the label
 * says what it is in plain words, the footer says what it means, and the hint
 * says why the line is drawn where it is. None of them say "empty side" or
 * "score ≥ 55" — that is the model's vocabulary, and a dispatcher should not
 * have to learn it to read their own board.
 *
 * ## What this row learned
 *
 * It once led with "Needs a vehicle", a bare total, then spent two more slots on
 * "Running empty" and "Filling up" — the same total split in two. Now that split
 * is one card, "Needs rebalancing": the direction is the part a dispatcher acts
 * on and the sum is just `emptySide + fullSide`.
 *
 * "Service performance" — a network-availability percentage against a policy
 * target — held the freed slot for a while. It is a real SLA metric but an
 * exec-dashboard one; nobody on a vehicle acts on it. The slot now counts dead
 * docks, which are a real field problem and belong beside the other health
 * numbers.
 *
 * And three cards used to filter the table while three navigated — the same
 * shape carrying two contracts. Now every interactive card is a door to the
 * screen that owns the number, and the ones with no such screen are inert.
 */
export function QueueStats({
  summary,
  hardware,
  history,
}: {
  summary: NetworkSummary | null;
  hardware: HardwareTotals | null;
  history: SessionHistory;
}) {
  const dash = (n: number | undefined) => (summary ? (n ?? 0).toLocaleString('en-US') : '—');
  const num = (n: number) => n.toLocaleString('en-US');
  const recovery = recoveryFor(history);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Needs rebalancing"
        value={
          <span className="whitespace-nowrap">
            <span style={{ color: TONE.empty.fg }}>{dash(summary?.emptySide)}</span>
            <span className="mx-1.5 text-[15px] font-normal text-[var(--color-ink-3)]">/</span>
            <span style={{ color: TONE.flood.fg }}>{dash(summary?.fullSide)}</span>
          </span>
        }
        foot={
          <span className="whitespace-nowrap">
            <span style={{ color: TONE.empty.fg }}>empty</span>
            <span className="mx-1">/</span>
            <span style={{ color: TONE.flood.fg }}>full</span>
          </span>
        }
        hint="Every station a vehicle could move bikes to or from right now, split by which way it failed. Left, in red: out of bikes — riders find none to take, and a vehicle drops some off. Right, in blue: out of docks — riders have nowhere to park, and a vehicle picks some up, the opposite trip. Silent stations are not counted; their numbers cannot be trusted."
      />
      <StatCard
        label="Dead docks"
        value={hardware ? num(hardware.deadDocks) : '—'}
        tone={hardware && hardware.deadDocks > 0 ? 'empty' : 'ink'}
        foot={
          hardware && hardware.crippled > 0
            ? `${num(hardware.crippled)} stations mostly out`
            : 'flagged out of service'
        }
        to="/maintenance/hardware"
        actionLabel="Open hardware and docks."
        hint="Docks the operator's own feed reports out of service — they can neither take a bike nor release one, so they quietly shrink every fill number on this board. A vehicle cannot re-seat a dock; these are a mechanic's job and are ranked on the Hardware & Docks screen."
      />
      <StatCard
        label="Vehicles available"
        value={VEHICLES_TOTAL - VEHICLES_ACTIVE}
        unit={`of ${VEHICLES_TOTAL}`}
        foot="ready to send to any borough"
        to="/fleet/vehicles"
        actionLabel="Open fleet operations."
        hint={`How many of the fleet's ${VEHICLES_TOTAL} vehicles are parked at a depot right now and can be dispatched anywhere in the city — the other ${VEHICLES_ACTIVE} are already on the road. Vans and box trucks both count — the fleet is mixed, which is why nothing here says "trucks". Fixture: the public feed carries no vehicles.`}
      />
      <StatCard
        label="Stations not reporting"
        value={dash(summary?.unverified)}
        tone={summary && summary.unverified > 0 ? 'warn' : 'ink'}
        foot="silent over an hour"
        to="/monitoring/unverified"
        actionLabel="Open unverified stations."
        hint="Stations that have not checked in for more than an hour. Their bike counts cannot be trusted, so they are left out of the ranking entirely rather than sending a vehicle on a stale reading."
      />
      <StatCard
        label="Cleared"
        value={recovery.value}
        unit={recovery.unit}
        tone={RECOVERY_TONE[recovery.band]}
        foot={recovery.foot}
        to="/analytics"
        actionLabel="Open network performance."
        hint="Every time a station gets bad enough to need a vehicle, the board adds it to a list for this session. This is how much of that list is back to normal: 7 of 23 means 23 stations went bad and 7 are fine again. It counts stations rather than trips — some come back because a vehicle went, others because riders happened to even them out — so it is not a score for the crews. For whether one dispatch worked, see Dispatch History. The list starts fresh when you reload."
      />
    </div>
  );
}

/**
 * Shown as "7 of 23" rather than 30%.
 *
 * The ratio was the headline and the count sat underneath it in the footer,
 * which was the same sentence twice. The count is the better headline of the
 * two: it carries the scale as well as the progress, so 7 and 70 stop reading
 * as the same morning.
 *
 * Set as value plus `unit` rather than as one "7/23" string, which puts the
 * count at full size and the denominator small beside it — the shape already
 * used by Vehicles out, the other card on the row that is a part of a known
 * whole. Spelling out "of" rather than a slash is the whole fix for "why 5 out
 * of 8?": a slash leaves the reader to guess at the relationship, and the two
 * cards using it were guessable in different directions.
 *
 * Deliberately no bar. This is a tally over a session with no target, so a bar
 * would draw a comparison that does not exist — the trap the old Network fill
 * card fell into.
 */
/**
 * Green good, amber close, red far off — Cleared is the one card on the row
 * where a high number is the good news, so it is the one that earns a traffic
 * light. The others count things that are broken, and colouring those by size
 * would just say "there are a lot of them" in red.
 */
const RECOVERY_TONE: Record<RecoveryBand, Tone> = {
  healthy: 'ok',
  weak: 'warn',
  poor: 'empty',
  unknown: 'mute',
};

/**
 * Three states, not two.
 *
 * "Still reading the session log" and "nothing has gone bad yet" are both empty
 * and they mean opposite things: one is the board not knowing anything yet, the
 * other is the board knowing there has been nothing to fix. Collapsing them
 * into a single dash would let a quiet network read as a broken feature during
 * the first minute after a reload.
 *
 * With the count promoted to the headline, the footer's job changed: it now
 * says how long the tally has been running. That window is the thing people
 * misread — a low number an hour in means something very different from the
 * same number four minutes after a reload.
 */
function recoveryFor(history: SessionHistory): {
  value: string | number;
  unit?: string;
  band: RecoveryBand;
  foot: string;
} {
  if (history.tracks === null) {
    return { value: '—', band: 'unknown', foot: 'reading this session…' };
  }

  const { resolved, worsened } = history.outcomes;
  const flagged = resolved + history.outcomes['still-failing'] + worsened;
  const share = recoveryRate(history.outcomes);

  if (share === null) {
    return { value: '—', band: 'unknown', foot: 'nothing has gone bad yet' };
  }

  return {
    value: resolved,
    unit: `of ${flagged}`,
    band: recoveryBand(share),
    foot:
      history.windowMs === null
        ? 'back to normal since you opened the board'
        : `back to normal in the last ${formatAgo(history.windowMs)}`,
  };
}
