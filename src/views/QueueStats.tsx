import { StatCard } from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import type { NetworkSummary } from '../model/summary';
import type { HardwareTotals } from '../data/hardware';
import type { BacklogStats } from '../model/workOrder';
import { recoveryBand, recoveryRate, type RecoveryBand } from '../model/verify';
import type { SessionHistory } from '../state/useHistory';
import { formatAgo } from '../lib/time';
import { VEHICLES_ACTIVE, VEHICLES_TOTAL } from '../mock/data';

/**
 * The six headline numbers above the queue.
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
 * "Work orders" is the newest, and it is the other crew's workload sitting next
 * to the vehicle's: "Needs rebalancing" is the queue this screen owns, "Dead
 * docks" is the damage that queue is not allowed to touch, and this is how much
 * of that damage has actually been turned into an order somebody is on the hook
 * for. It counts open orders, not broken stations — the feed says what is
 * broken, a person decides what becomes a job.
 *
 * And three cards used to filter the table while three navigated — the same
 * shape carrying two contracts. Now every interactive card is a door to the
 * screen that owns the number, and the ones with no such screen are inert.
 */
export function QueueStats({
  summary,
  hardware,
  maintenance,
  history,
}: {
  summary: NetworkSummary | null;
  hardware: HardwareTotals | null;
  maintenance: BacklogStats | null;
  history: SessionHistory;
}) {
  const dash = (n: number | undefined) => (summary ? (n ?? 0).toLocaleString('en-US') : '—');
  const num = (n: number) => n.toLocaleString('en-US');
  const recovery = recoveryFor(history);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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
      {/* "Work orders", not "Sent to mechanic": a work order is the thing this
          board actually creates — the button on a mechanic-lane station raises
          one — so the card should be named for the object, not for the gesture
          that made it. It counts what is still open, which is the only figure a
          dispatcher can act on; closed ones are history and live on the
          Maintenance screen. */}
      <StatCard
        label="Work orders"
        value={maintenance ? num(maintenance.open) : '—'}
        tone={maintenance && maintenance.breached > 0 ? 'empty' : 'ink'}
        foot={
          maintenance && maintenance.breached > 0
            ? `${num(maintenance.breached)} past response target`
            : maintenance && maintenance.open === 0
              ? 'nothing outstanding'
              : maintenance && maintenance.unassigned > 0
                ? `${num(maintenance.unassigned)} not yet assigned`
                : 'all inside response target'
        }
        to="/maintenance/orders"
        actionLabel="Open maintenance operations."
        hint="Work orders still open for a technician — dock repairs, battery swaps, dead-bike pickups. Raising one from a station is how this board hands a fault to the mechanics; the count drops as they are closed. A vehicle full of bikes cannot close any of them, which is why they are counted apart from the rebalancing queue and from the dead-dock total beside it."
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
 * Green when the session is genuinely recovering, neutral otherwise. Never red.
 *
 * It used to run the full traffic light, which put a red number under the word
 * "Cleared" — the one card on the row whose subject is good news wearing the
 * colour every other card uses for damage. A reader scanning the row saw red
 * and looked for the problem, and the problem was that six stations had come
 * back instead of sixty. A low recovery rate is worth knowing and is not an
 * alarm, so it reads as ink.
 */
const RECOVERY_TONE: Record<RecoveryBand, Tone> = {
  healthy: 'ok',
  weak: 'ink',
  poor: 'ink',
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
