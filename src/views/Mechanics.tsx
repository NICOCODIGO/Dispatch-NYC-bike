import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { focusHref, useArrival, useScrollToFocus } from '../state/useFocus';
import { COLUMN_HELP } from '../content/columns';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon, type IconName } from '../ui/Icon';
import { ArrivalBanner, Avatar, Button, Card, CardHead, Finding, Segmented, Td, Th, TonePill } from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { openOrders, pendingCount, useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { mechanicFault } from '../model/triage';
import { CATEGORY_LABEL } from '../model/score';
import {
  SLA_MINUTES,
  STATUS_LABEL,
  URGENCY_LABEL,
  WORK_ORDER_LABEL,
  ageMinutes,
  backlog,
  slaState,
  sortByPressure,
  urgencyOf,
  type SlaState,
  type Urgency,
  type WorkOrder,
  type WorkOrderType,
} from '../model/workOrder';
import { formatAgo, formatReportedAge } from '../lib/time';
import { shortStationId } from '../data/adapt';
import { capacityLoss, networkDocks } from '../data/insights';
import type { ScoredStation } from '../model/summary';
import {
  ROLE_LABEL,
  STAFF_STATUS_LABEL,
  candidatesFor,
  currentOrder,
  isOnShift,
  statusOf,
  type Role,
} from '../model/roster';
import { distanceKm, travelMinutes } from '../data/fleet';
import { DEPOTS, ROSTER, mechanicName, stationById, type ActivityEntry } from '../mock/data';
import { cn } from '../lib/cn';

/**
 * Work a truck cannot do.
 *
 * Two tables and a list, in the order a shift uses them: what the feed says is
 * broken, which sites carry the most dead hardware, and the work orders those
 * turn into.
 *
 * Orders are cards rather than table rows because each carries a paragraph of
 * fault description and its own decision — assign, defer, complete — and that
 * does not compress into a row without losing the thing a mechanic needs to
 * read. The hardware backlog above them *is* a table, because there the
 * question is comparative: which of these is worst.
 */
export function Mechanics() {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const workOrders = useConsole((s) => s.workOrders);
  const activity = useConsole((s) => s.activity);
  const faults = useDispatch((s) => s.lanes.mechanic);

  // One clock for the whole render, so two cards cannot disagree about what
  // time it is while one of them is deciding it has breached.
  const now = Date.now();
  const orders = useMemo(() => sortByPressure(workOrders, now), [workOrders, now]);
  const stats = useMemo(() => backlog(workOrders, now), [workOrders, now]);

  // Counts the roles that repair things, not the whole rota — a driver on shift
  // is real capacity, but not capacity for anything on this screen.
  const mechanicsOnShift = useMemo(() => {
    const repairRoles: Role[] = ['field-mechanic', 'depot-mechanic', 'swap-tech'];
    const date = new Date(now);
    return ROSTER.filter((p) => repairRoles.includes(p.role) && isOnShift(p, date)).length;
  }, [now]);

  const pending = pendingCount(workOrders);

  // A reader can arrive here from the Priority Queue's escalation banner,
  // pointed at one fault it flagged as unassigned. Mirrors the queue's own
  // arrival handling so Back and reload behave the same everywhere.
  const arrival = useArrival();
  const focusedFault = arrival.focus ? faults.find((f) => f.station.stationId === arrival.focus) : undefined;
  useScrollToFocus(arrival.focus, faults.length > 0);

  return (
    <>
      <PageHeader
        title="Maintenance Operations"
        subtitle={`Work a truck cannot do. ${faults.length} station${faults.length === 1 ? '' : 's'} reported broken by the feed · ${stats.open} open work order${stats.open === 1 ? '' : 's'}${stats.breached > 0 ? `, ${stats.breached} past target` : ''} · ${mechanicsOnShift} mechanic${mechanicsOnShift === 1 ? '' : 's'} on shift · ${pending} pending assignment`}
        actions={
          <>
            <Segmented
              label="Work order view"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'active', label: 'Open orders' },
                { value: 'history', label: 'History' },
              ]}
            />
            <Button variant="dark" notBuilt="Would open a blank work order not tied to a station.">
              Create Work Order
            </Button>
          </>
        }
      />

      <PageBody>
        {arrival.focus && arrival.from && (
          <ArrivalBanner
            from={arrival.from}
            back={arrival.back}
            detail={
              focusedFault
                ? `showing ${focusedFault.station.name}`
                : 'that station is no longer reporting a mechanical fault — it may have been fixed or come back online'
            }
            onDismiss={arrival.dismiss}
          />
        )}

        <OutOfServiceFinding faults={faults} />

        <div className="mt-3.5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_286px]">
          <div className="min-w-0">
            {tab === 'active' ? (
              <>
                <FeedFaults focusId={arrival.focus} />

                <div className="mt-4 mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className="eyebrow text-[10px]">Work orders ({stats.open})</h2>
                  {/* The backlog's own condition, before you read any of it.
                      A list of cards says how much there is; only these say
                      whether it is being kept up with. */}
                  {stats.breached > 0 && (
                    <span className="text-[10px] font-semibold" style={{ color: TONE.empty.fg }}>
                      {stats.breached} past target
                    </span>
                  )}
                  {stats.dueSoon > 0 && (
                    <span className="text-[10px] font-semibold" style={{ color: TONE.warn.fg }}>
                      {stats.dueSoon} due soon
                    </span>
                  )}
                  {stats.meanOpenAge !== null && (
                    <span className="text-[10px] text-[var(--color-ink-3)]">
                      mean age {formatAgo(stats.meanOpenAge * 60_000)}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-3.5">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <WorkOrderCard order={o} now={now} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Card className="px-4 py-10 text-center text-[12px] text-[var(--color-ink-3)]">
                No work orders closed in this session.
              </Card>
            )}
          </div>

          <aside className="flex flex-col gap-3.5" aria-label="Mechanics and activity">
            <ActiveMechanics orders={workOrders} now={now} />
            <ActivityLog entries={activity} />
          </aside>
        </div>
      </PageBody>
    </>
  );
}

/* ---------------------------------------------------------------------------
   What being broken costs.

   A dead station is not one row on a list, it is a hole in the network the
   size of its dock count — and unlike an empty station, no amount of driving
   fixes it. That distinction is why these are here and not in the queue.
--------------------------------------------------------------------------- */

function OutOfServiceFinding({ faults }: { faults: ScoredStation[] }) {
  const scored = useDispatch((s) => s.scored);
  const phase = useDispatch((s) => s.phase);
  const workOrders = useConsole((s) => s.workOrders);
  const open = useMemo(() => openOrders(workOrders), [workOrders]);
  const dispatched = useConsole((s) => s.dispatched);

  if (phase === 'loading' && scored.length === 0) {
    return <Finding icon="wrench" tone="mute" headline="Reading the live feed…" />;
  }

  if (faults.length === 0) {
    return (
      <Finding
        icon="wrench"
        tone="ok"
        headline="No station is reporting a mechanical fault."
        detail={`Every station the feed returned is renting, returning and showing usable slots. ${open.length} work order${open.length === 1 ? '' : 's'} remain open from earlier.`}
      />
    );
  }

  const loss = capacityLoss(faults, networkDocks(scored));
  const unraised = faults.filter((f) => !dispatched.includes(f.station.stationId)).length;
  const worst = loss.byBorough[0];

  return (
    <Finding
      icon="wrench"
      tone={unraised > 0 ? 'empty' : 'warn'}
      headline={
        <>
          {loss.docks.toLocaleString('en-US')} docks are out of service across {loss.stations}{' '}
          station{loss.stations === 1 ? '' : 's'}.
        </>
      }
      detail={
        <>
          That is {(loss.share * 100).toFixed(1)}% of the network switched off — capacity no truck
          can restore, because moving bikes does not fix a station that is not renting or
          returning. Sending one there is a wasted run, which is why they are routed off the queue
          and onto this page.
          {worst && loss.byBorough.length > 1 && (
            <> {worst.borough} carries the most, with {worst.stations}.</>
          )}
          {unraised > 0 && (
            <>
              {' '}
              <strong className="font-semibold text-[var(--color-ink)]">
                {unraised} {unraised === 1 ? 'has' : 'have'} no work order yet.
              </strong>
            </>
          )}
        </>
      }
      stats={[
        { label: 'stations down', value: loss.stations, tone: 'empty' },
        { label: 'docks offline', value: loss.docks.toLocaleString('en-US'), tone: 'empty' },
        { label: 'of network', value: `${(loss.share * 100).toFixed(1)}%` },
        { label: 'open orders', value: open.length },
        {
          label: 'awaiting an order',
          value: unraised,
          tone: unraised > 0 ? 'empty' : 'ok',
        },
      ]}
    />
  );
}

/* ---------------------------------------------------------------------------
   Faults the feed reports directly.

   These are live: stations whose operator flags say they are not renting, not
   returning, or reporting no usable slots. `triage.ts` routes them here rather
   than into the truck queue, because a truck full of bikes cannot fix a dead
   dock.

   They are not work orders yet — nobody has been assigned, and the feed cannot
   tell you *what* is broken, only that it is. Raising one turns it into a
   ticket in the list below.
--------------------------------------------------------------------------- */

/** Rows shown before the list is truncated. The lane can run to dozens. */
const FAULT_LIMIT = 6;

function FeedFaults({ focusId }: { focusId: string | null }) {
  const faults = useDispatch((s) => s.lanes.mechanic);
  const phase = useDispatch((s) => s.phase);
  const dispatchMechanic = useConsole((s) => s.dispatchMechanic);
  const dispatched = useConsole((s) => s.dispatched);
  const openStation = useConsole((s) => s.openStation);
  const [showAll, setShowAll] = useState(false);

  const shown = showAll ? faults : faults.slice(0, FAULT_LIMIT);

  return (
    <Card className="overflow-hidden">
      <CardHead
        title={`Reported broken by the feed (${faults.length})`}
        right={
          <span className="num text-[10px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
            Live
          </span>
        }
      />

      {faults.length === 0 ? (
        <p className="border-t border-[var(--color-line)] px-4 py-8 text-center text-[12px] text-[var(--color-ink-2)]">
          {phase === 'loading'
            ? 'Reading the live feed…'
            : 'No station is reporting a mechanical fault right now.'}
        </p>
      ) : (
        <>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                <Th>Station</Th>
                <Th width={190} help={COLUMN_HELP.fault}>
                  Fault
                </Th>
                <Th width={110} help={COLUMN_HELP.condition}>
                  Condition
                </Th>
                <Th width={140}>Reported</Th>
                <Th width={150} align="right">
                  Action
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => {
                const { station, breakdown } = entry;
                const raised = dispatched.includes(station.stationId);
                const fault = mechanicFault(entry);

                const focused = station.stationId === focusId;

                return (
                  <tr
                    key={station.stationId}
                    data-focus-id={station.stationId}
                    className={`border-b border-[var(--color-line-soft)] last:border-b-0${focused ? ' bg-[var(--color-sunken)]' : ''}`}
                    style={focused ? { boxShadow: `inset 3px 0 0 ${TONE.empty.fg}` } : undefined}
                  >
                    <Td>
                      <button
                        type="button"
                        onClick={() => openStation(station.stationId)}
                        className="block text-left"
                      >
                        <span className="block text-[12px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline">
                          {station.name}
                        </span>
                        <span className="mt-px block text-[10px] text-[var(--color-ink-3)]">
                          {station.borough} · <span className="num">{station.capacity}</span> docks
                        </span>
                      </button>
                    </Td>

                    <Td className="text-[11px] text-[var(--color-ink-2)]">{fault}</Td>

                    <Td>
                      <TonePill label={CATEGORY_LABEL[breakdown.category]} tone="ink" />
                    </Td>

                    <Td>
                      <span className="num block text-[10px] text-[var(--color-ink-3)]">
                        {formatReportedAge(breakdown.staleness.ageMinutes)}
                      </span>
                      <Link
                        to={focusHref('/', station.stationId, 'Maintenance Ops', '/maintenance/orders')}
                        className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--color-ink-3)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                      >
                        <Icon name="list-ordered" size={10} />
                        why it is off the queue
                      </Link>
                    </Td>

                    <Td align="right">
                      {raised ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium"
                          style={{ color: TONE.ok.fg, backgroundColor: TONE.ok.bg }}
                        >
                          <Icon name="wrench" size={12} />
                          Order raised
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          icon="plus"
                          onClick={() =>
                            dispatchMechanic({
                              key: station.stationId,
                              name: `${station.name} — ${CATEGORY_LABEL[breakdown.category]}`,
                              where: `${station.name} · Station #${shortStationId(station.stationId)} · ${station.borough}`,
                              region: station.borough,
                              stationId: station.stationId,
                              type: 'dock-repair',
                              priority: breakdown.scored ? breakdown.score : null,
                              detail: `Operator flags report: ${fault.toLowerCase()}. Reported ${formatReportedAge(breakdown.staleness.ageMinutes)}. The feed states that the station is out of service but not why — a mechanic needs to identify the fault on site.`,
                            })
                          }
                        >
                          Work order
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {faults.length > FAULT_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full border-t border-[var(--color-line)] py-2.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--color-ink-2)] uppercase hover:bg-[var(--color-sunken)] hover:text-[var(--color-ink)]"
            >
              {showAll ? 'Show fewer' : `Show all ${faults.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/** Presentation only — the model stays free of the UI vocabulary. */
const TYPE_ICON: Record<WorkOrderType, IconName> = {
  rebalance: 'truck',
  'battery-swap': 'battery-low',
  'station-power': 'plug-zap',
  'dock-repair': 'cog',
  'bike-repair': 'wrench',
  inspection: 'info',
};

const URGENCY_TONE: Record<Urgency, Tone> = {
  critical: 'empty',
  high: 'warn',
  routine: 'mute',
};

const SLA_TONE: Record<SlaState, Tone> = {
  breached: 'empty',
  'due-soon': 'warn',
  ok: 'ok',
  closed: 'mute',
};

function WorkOrderCard({ order, now }: { order: WorkOrder; now: number }) {
  const urgency = urgencyOf(order);
  const tone = TONE[URGENCY_TONE[urgency]];
  const sla = slaState(order, now);
  const openStation = useConsole((s) => s.openStation);

  const [before, after] = order.faultCode
    ? order.detail.split('{code}')
    : [order.detail, undefined];

  const linkable = order.target.stationId ? stationById(order.target.stationId) : null;
  const assignee = mechanicName(order.assignee);
  const age = ageMinutes(order, now);
  const target = SLA_MINUTES[order.type];

  return (
    <Card
      className="overflow-hidden"
      style={{ borderLeft: `3px solid ${tone.fg}`, borderRadius: '10px' }}
    >
      <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-3">
        <span
          aria-hidden="true"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: tone.bg, color: tone.fg }}
        >
          <Icon name={TYPE_ICON[order.type]} size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">
              {WORK_ORDER_LABEL[order.type]} — {order.target.stationName}
            </h3>
            <TonePill label={URGENCY_LABEL[urgency]} tone={URGENCY_TONE[urgency]} />
          </div>
          {linkable ? (
            <button
              type="button"
              onClick={() => openStation(linkable.id)}
              className="mt-1 block text-left text-[11px] text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
            >
              {order.target.stationName} · {order.target.borough}
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--color-ink-2)]">
              {order.target.stationName} · {order.target.borough}
            </p>
          )}
        </div>

        {/* Age against target, not a wall-clock stamp. "13:45" told you when
            somebody typed it; this tells you whether anyone is going to make
            it, which is the only thing a backlog screen is for. */}
        <div className="shrink-0 text-right">
          <p className="eyebrow text-[10px]">Open for</p>
          <p
            className="num mt-1 text-[12px] font-semibold"
            style={{ color: TONE[SLA_TONE[sla]].fg }}
          >
            {formatAgo(age * 60_000)}
          </p>
          <p className="num mt-0.5 text-[10px] text-[var(--color-ink-3)]">
            {sla === 'breached'
              ? `${formatAgo((age - target) * 60_000)} over`
              : `of ${formatAgo(target * 60_000)}`}
          </p>
        </div>
      </div>

      <div className="mx-3.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-2.5">
        {order.faultCode && (
          <p className="eyebrow flex items-center gap-1.5 text-[10px]">
            <Icon name="cog" size={11} />
            Fault description
          </p>
        )}
        <p
          className={
            order.faultCode
              ? 'mt-1.5 text-[11px] leading-relaxed text-[var(--color-ink-2)]'
              : 'text-[11px] leading-relaxed text-[var(--color-ink-2)]'
          }
        >
          {before}
          {order.faultCode && (
            <code className="num rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-px text-[10px] text-[var(--color-ink)]">
              {order.faultCode}
            </code>
          )}
          {after}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-3.5 pb-3.5">
        {assignee === null ? (
          <p className="flex items-center gap-2 text-[11px] text-[var(--color-ink-3)] italic">
            Assignment:
            <span className="not-italic">
              <TonePill label={STATUS_LABEL[order.status]} tone="mute" />
            </span>
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-3)] italic">
            Assigned to:
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] py-[3px] pr-2.5 pl-1 not-italic">
              <Avatar size={16} />
              <span className="text-[11px] font-medium text-[var(--color-ink)]">{assignee}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-[0.08em] not-italic uppercase"
              style={{ color: TONE.ok.fg }}
            >
              <Icon name="truck" size={12} />
              {STATUS_LABEL[order.status]}
            </span>
          </p>
        )}

        {assignee === null ? (
          <span className="flex items-center gap-2">
            <Button size="sm" notBuilt="Would push this order to the next shift.">
              Defer
            </Button>
            <Button size="sm" variant="dark" notBuilt="Would put this order on a named mechanic.">
              Assign Now
            </Button>
          </span>
        ) : null}
        {assignee !== null && (
          <Button size="sm" variant="green" notBuilt="Would close the order and log who fixed it.">
            Complete Task
          </Button>
        )}
      </div>

      {order.status === 'open' && <WhoToSend order={order} now={now} />}
    </Card>
  );
}

/**
 * Who can take this, and how far away they are.
 *
 * An unassigned order used to offer "Assign Now" and stop there, which asks the
 * coordinator to hold the whole rota in their head: who is on this shift, which
 * of them does dock repairs rather than battery swaps, who is already carrying
 * two jobs, and which depot is nearer. All four are known to the app.
 *
 * Only on `open` orders. An order somebody already owns does not need a list of
 * alternatives underneath it.
 */
function WhoToSend({ order, now }: { order: WorkOrder; now: number }) {
  const workOrders = useConsole((s) => s.workOrders);
  const scored = useDispatch((s) => s.scored);

  const station = useMemo(() => {
    if (!order.target.stationId) return null;
    const hit = scored.find((s) => s.station.stationId === order.target.stationId);
    return hit ? { lat: hit.station.lat, lon: hit.station.lon } : null;
  }, [scored, order.target.stationId]);

  const candidates = useMemo(
    () =>
      candidatesFor(order.type, ROSTER, workOrders, {
        date: new Date(now),
        station,
        depots: DEPOTS,
        distanceKm,
        travelMinutes,
      }),
    [order.type, workOrders, now, station],
  );

  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-sunken)] px-3.5 py-2.5">
      <p className="eyebrow text-[10px]">Who can take this</p>

      {candidates.length === 0 ? (
        /* Not an empty list but a staffing fact, and the one a coordinator has
           to act on differently: nobody qualified is on, so this waits for the
           next shift however urgent it is. */
        <p className="mt-1 text-[10px] leading-relaxed" style={{ color: TONE.warn.fg }}>
          Nobody on this shift covers {WORK_ORDER_LABEL[order.type].toLowerCase()}. It waits for
          the next shift unless somebody is called in.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {candidates.slice(0, 3).map((c, i) => (
            <li key={c.person.id} className="flex items-center gap-2 text-[10px]">
              <Avatar size={16} online={c.status !== 'off-shift'} />
              <span
                className={cn(
                  'font-semibold',
                  i === 0 ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-2)]',
                )}
              >
                {c.person.name}
              </span>
              <span className="text-[var(--color-ink-3)]">
                {ROLE_LABEL[c.person.role]} · {c.person.depot}
              </span>
              <span className="ml-auto flex items-center gap-2 whitespace-nowrap">
                <span
                  style={{
                    color: c.status === 'available' ? TONE.ok.fg : 'var(--color-ink-3)',
                  }}
                >
                  {c.status === 'available'
                    ? 'free'
                    : `${c.load} job${c.load === 1 ? '' : 's'}`}
                </span>
                {c.minutes !== null && (
                  <span className="num text-[var(--color-ink-2)]">{c.minutes}m out</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


/**
 * Who can actually take one of these orders, right now.
 *
 * Only the roles that fix things — a rebalance driver on shift is real capacity
 * but not capacity for anything on this screen, and listing them here would
 * inflate the number a coordinator reads before deciding whether to escalate.
 */
function ActiveMechanics({ orders, now }: { orders: WorkOrder[]; now: number }) {
  const date = new Date(now);
  const repairRoles: Role[] = ['field-mechanic', 'depot-mechanic', 'swap-tech'];
  const mechanics = ROSTER.filter((p) => repairRoles.includes(p.role));
  const onNow = mechanics.filter((p) => isOnShift(p, date));

  return (
    <Card>
      <CardHead
        title="Mechanics on shift"
        right={
          <span className="num text-[10px] text-[var(--color-ink-2)]">
            {onNow.length}/{mechanics.length}
          </span>
        }
      />
      <ul className="px-3.5 pb-3">
        {mechanics.map((m, i) => {
          const status = statusOf(m, orders, date);
          const job = currentOrder(m, orders);
          const off = status === 'off-shift';

          return (
            <li
              key={m.id}
              className={
                i > 0
                  ? 'flex items-center gap-2.5 border-t border-[var(--color-line-soft)] py-2.5'
                  : 'flex items-center gap-2.5 py-2.5'
              }
            >
              <Avatar online={!off} />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-[11px] font-semibold',
                    off ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink)]',
                  )}
                >
                  {m.name}
                </span>
                {/* Derived every render from the shift clock and the orders
                    pointing at this person, so it cannot go on describing a job
                    that closed an hour ago — which the hand-written status
                    string it replaced did by construction. */}
                <span className="block truncate text-[10px] text-[var(--color-ink-3)]">
                  {STAFF_STATUS_LABEL[status]}
                  {job ? ` · ${WORK_ORDER_LABEL[job.type]} @ ${job.target.stationName}` : ''}
                  {!job && ` · ${ROLE_LABEL[m.role]}`}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Call ${m.name}`}
                disabled={off}
                className="shrink-0 text-[var(--color-ink-3)] hover:text-[var(--color-ink)] disabled:opacity-40"
              >
                <Icon name="phone" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card>
      <CardHead title="Recent activity log" />
      <ul className="px-3.5 pb-3.5">
        {entries.map((e, i) => (
          <li key={i} className="flex gap-2.5 py-2">
            <span
              aria-hidden="true"
              className="mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ backgroundColor: TONE[e.tone].fg }}
            />
            <span className="min-w-0">
              <span className="block text-[11px] leading-snug text-[var(--color-ink-2)]">
                <span className="font-semibold text-[var(--color-ink)]">{e.who}</span> {e.verb}{' '}
                <span className="font-medium text-[var(--color-ink)]">{e.what}</span>
              </span>
              <span className="num mt-0.5 block text-[10px] text-[var(--color-ink-3)]">
                {e.time} · {e.where}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
