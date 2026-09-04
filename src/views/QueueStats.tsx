import { StatCard } from '../ui/primitives';
import type { Tone } from '../ui/tone';
import type { NetworkSummary } from '../model/summary';
import { serviceBand, type ServiceBand, type ServiceLevel } from '../model/service';
import { recoveryBand, recoveryRate, type RecoveryBand } from '../model/verify';
import type { SessionHistory } from '../state/useHistory';
import { formatAgo } from '../lib/time';
import { VEHICLES_ACTIVE, VEHICLES_TOTAL } from '../mock/data';

/**
 * The six headline numbers above the queue.
 *
 * Every card carries three layers, because a number alone is a quiz: the label
 * says what it is in plain words, the footer says what it means for a rider,
 * and the hint says why the line is drawn where it is. None of them say "empty
 * side" or "score ≥ 55" — that is the model's vocabulary, and a dispatcher
 * should not have to learn it to read their own board.
 *
 * ## Two things this row used to get wrong
 *
 * It led with "Needs a vehicle", which was the next two cards added together —
 * `needsVehicle === emptySide + fullSide` by construction in `summary.ts`, since
 * every flagged vehicle-lane station fails in exactly one of the two directions.
 * A card whose only content is arithmetic between its neighbours is a card
 * spending the most valuable slot on the row to say nothing. Service level took
 * the slot because it answers the question the rest of the row cannot: not how
 * much is broken, but whether that is acceptable.
 *
 * And three cards used to filter the table while three navigated — the same
 * shape and the same hover carrying two different contracts, so there was no
 * way to know which kind you were about to click. Worse, the filtering ones
 * hid the board's other 1,900 rows to "show" you a number you were already
 * looking at. Now every interactive card is a door to the screen that owns the
 * number, and the two that have no such screen are inert readouts.
 */
export function QueueStats({
  summary,
  service,
  history,
}: {
  summary: NetworkSummary | null;
  service: ServiceLevel | null;
  history: SessionHistory;
}) {
  const dash = (n: number | undefined) => (summary ? (n ?? 0).toLocaleString('en-US') : '—');
  const targetPct = Math.round((service?.target ?? 0) * 100);
  const recovery = recoveryFor(history);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Service performance"
        value={service?.level == null ? '—' : Math.round(service.level * 100)}
        unit={service?.level == null ? undefined : '%'}
        tone={SERVICE_TONE[serviceBand(service?.level ?? null)]}
        bar={
          service?.level == null
            ? undefined
            : {
                value: service.level,
                tone: SERVICE_TONE[serviceBand(service.level)],
                mark: service.target,
              }
        }
        foot={
          service == null || service.level === null
            ? undefined
            : service.meetsTarget
              ? `at or above the ${targetPct}% target`
              : `${service.shortfall.toLocaleString('en-US')} stations short of ${targetPct}%`
        }
        hint={`The share of reporting stations where a rider can both take a bike and park one. Stations that have gone silent are left out rather than guessed at — their counts are the exact thing this would have to measure. The ${targetPct}% target is a policy choice, not a measurement: it is set where the network is genuinely served and a shift can still get there, because there are always more broken stations than vehicles.`}
      />
      <StatCard
        label="Running empty"
        value={dash(summary?.emptySide)}
        tone="empty"
        foot="riders may find none to take"
        hint="Out of bikes, or nearly. Somebody walking up wants a bike and there may not be one. A vehicle fixes this by dropping bikes off."
      />
      <StatCard
        label="Filling up"
        value={dash(summary?.fullSide)}
        tone="flood"
        foot="riders may find nowhere to park"
        hint="Out of docks, or nearly. Somebody arriving with a bike may have nowhere to leave it and has to ride on. A vehicle fixes this by picking bikes up — the opposite trip."
      />
      <StatCard
        label="Vehicles out"
        value={VEHICLES_ACTIVE}
        unit={`of ${VEHICLES_TOTAL}`}
        foot={`${VEHICLES_TOTAL - VEHICLES_ACTIVE} idle at depots, ready to send`}
        to="/fleet/vehicles"
        actionLabel="Open fleet operations."
        hint={`How many of the fleet's ${VEHICLES_TOTAL} vehicles are on the road right now. The other ${VEHICLES_TOTAL - VEHICLES_ACTIVE} are parked at depots and can be dispatched. Vans and box trucks both count — the fleet is mixed, which is why nothing here says "trucks". Fixture: the public feed carries no vehicles.`}
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
 * Deliberately no bar, unlike Service performance. That one is a level — a fact
 * about the city right now — and it earns a bar and a target notch because
 * "against what?" is the question it has to answer. This is a tally over a
 * session with no target, so a bar would draw a comparison that does not exist.
 * Two percentages drawn identically is exactly the trap the old Network fill
 * card fell into.
 */
/**
 * Green good, amber close, red far off — the one card on the row where a high
 * number is the good news, so it is also the one that earns a traffic light.
 * The other five count things that are broken, and colouring those by size
 * would just say "there are a lot of them" in red.
 *
 * The bands live in the model beside the target they are measured from, so the
 * colour and the queue's target line can never tell opposite stories.
 */
const SERVICE_TONE: Record<ServiceBand, Tone> = {
  good: 'ok',
  fair: 'warn',
  poor: 'empty',
  unknown: 'mute',
};

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
