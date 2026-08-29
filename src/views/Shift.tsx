import { useMemo } from 'react';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Avatar, Card, CardHead, Finding, StatCard, TonePill } from '../ui/primitives';
import { ProvenancePill } from '../ui/ProvenancePill';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { rebalanceDemand } from '../data/insights';
import { formatAgo } from '../lib/time';
import {
  ROLE_LABEL,
  RUNS_PER_DRIVER_PER_SHIFT,
  SHIFTS,
  STAFF_STATUS_LABEL,
  currentOrder,
  shiftCapacity,
  statusOf,
  verdict,
  type Role,
  type StaffStatus,
} from '../model/roster';
import { WORK_ORDER_LABEL, ageMinutes, backlog, slaState } from '../model/workOrder';
import { ROSTER } from '../mock/data';
import { TRUCKS } from '../mock/data';
import { cn } from '../lib/cn';

/**
 * Can this shift clear the queue?
 *
 * The method sheet already argues the thing this screen exists to prove: *"The
 * line is not what limits you — capacity is."* Stated there, it is a paragraph
 * a reader can nod at and move past. Here it is arithmetic — the runs a shift
 * contains against the runs the backlog is asking for — and the answer is
 * usually no.
 *
 * That is the point. Every other screen in this console helps decide *where* to
 * send somebody. This one is the only one that says how much of that decision
 * is real, and a dispatch board without it quietly implies the whole queue is
 * actionable when a tenth of it is.
 */

const STATUS_TONE: Record<StaffStatus, Tone> = {
  'off-shift': 'mute',
  available: 'ok',
  assigned: 'warn',
  'on-site': 'flood',
};

export function Shift() {
  const lane = useDispatch((s) => s.lanes.truck);
  const workOrders = useConsole((s) => s.workOrders);

  const now = Date.now();
  const date = useMemo(() => new Date(now), [now]);

  const demand = useMemo(() => rebalanceDemand(lane), [lane]);

  // Same fleet arithmetic the method sheet uses, so the two screens cannot
  // disagree about how big a truck is.
  const activeCapacity = TRUCKS.filter((t) => t.state !== 'idle').reduce(
    (sum, t) => sum + t.capacity,
    0,
  );

  const cap = useMemo(
    () =>
      shiftCapacity(ROSTER, workOrders, {
        relocatable: demand.relocatable,
        truckCapacity: activeCapacity,
        date,
      }),
    [workOrders, demand.relocatable, activeCapacity, date],
  );

  const orders = useMemo(() => backlog(workOrders, now), [workOrders, now]);
  const short = cap.shortfall !== null && cap.shortfall < 0;
  const shiftLabel = SHIFTS.find((s) => s.key === cap.shift)?.label ?? cap.shift;

  return (
    <>
      <PageHeader
        title="Shift"
        subtitle={`Who is on, and what that means for what gets done. ${shiftLabel} · ${cap.onShift.length} of ${ROSTER.length} on shift.`}
      />

      <PageBody>
        {/* The answer first. A capacity screen that opens with a roster table
            makes the reader assemble the conclusion themselves, and the
            conclusion is the only reason to come here. */}
        <Finding
          icon={short ? 'alert-triangle' : 'info'}
          tone={short ? 'empty' : 'ok'}
          headline={verdict(cap)}
          detail={
            cap.runsNeeded === null ? (
              'Every truck is idle, so there is no capacity to divide the backlog into.'
            ) : (
              <>
                {demand.relocatable.toLocaleString('en-US')} bikes are worth moving right now.
                At {activeCapacity} bikes of active truck capacity that is{' '}
                <strong className="font-semibold">{cap.runsNeeded} full runs</strong>, and{' '}
                {cap.drivers} driver{cap.drivers === 1 ? '' : 's'} on this shift can complete about{' '}
                <strong className="font-semibold">{cap.runsAvailable}</strong>. Moving the dispatch
                threshold changes which stations are named, not how many trips exist.
              </>
            )
          }
        />

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="On shift"
            value={cap.onShift.length}
            foot={`of ${ROSTER.length} on the roster`}
            hint="Everyone whose shift window contains the current hour. Derived from the clock, not stored."
          />
          <StatCard
            label="Runs needed"
            value={cap.runsNeeded ?? '—'}
            tone={short ? 'empty' : 'ink'}
            foot="to clear the backlog"
            hint="Bikes worth moving, divided by what the active fleet carries in one load. The same figure the method sheet quotes."
          />
          <StatCard
            label="Runs available"
            value={cap.runsAvailable}
            foot={`${cap.drivers} driver${cap.drivers === 1 ? '' : 's'} × ${RUNS_PER_DRIVER_PER_SHIFT}`}
            hint={`Assumes ${RUNS_PER_DRIVER_PER_SHIFT} loads per driver per eight-hour shift — roughly ninety minutes a round trip. A guess, and the first thing to replace with a measurement.`}
          />
          <StatCard
            label="Open orders"
            value={orders.open}
            tone={orders.breached > 0 ? 'empty' : 'ink'}
            foot={orders.breached > 0 ? `${orders.breached} past target` : 'all inside target'}
            to="/maintenance/orders"
            actionLabel="Open maintenance operations."
            hint="Repair and swap work outstanding. Separate from rebalancing — a truck full of bikes cannot fix a dead dock."
          />
          <StatCard
            label="Unassignable"
            value={cap.unassignable}
            tone={cap.unassignable > 0 ? 'warn' : 'ok'}
            foot="no role on shift covers"
            hint="Open orders that nobody currently on shift is qualified to take. Different from unassigned: that is a scheduling choice, this is a hole in the rota."
          />
        </div>

        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Card className="overflow-hidden">
            <CardHead
              title="Roster"
              right={<ProvenancePill provenance="simulated" detail="GBFS carries no people. The roster, shifts and depots are modelled; what each person is doing is derived from the work orders on the board." />}
            />
            <ul className="px-3.5 pb-3">
              {ROSTER.map((p, i) => {
                const status = statusOf(p, workOrders, date);
                const job = currentOrder(p, workOrders);
                const off = status === 'off-shift';

                return (
                  <li
                    key={p.id}
                    className={cn(
                      'flex items-center gap-3 py-2.5',
                      i > 0 && 'border-t border-[var(--color-line-soft)]',
                    )}
                  >
                    <Avatar online={!off} />

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            'text-[12px] font-semibold',
                            off ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink)]',
                          )}
                        >
                          {p.name}
                        </span>
                        <TonePill label={STAFF_STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--color-ink-3)]">
                        {ROLE_LABEL[p.role]} · {p.depot}
                        {p.vehicleId && (
                          <>
                            {' '}
                            · <span className="num">Truck {p.vehicleId}</span>
                          </>
                        )}
                      </span>
                      {job && (
                        <span className="mt-0.5 block truncate text-[10px]" style={{ color: TONE.warn.fg }}>
                          {WORK_ORDER_LABEL[job.type]} @ {job.target.stationName} ·{' '}
                          {formatAgo(ageMinutes(job, now) * 60_000)}
                          {slaState(job, now) === 'breached' && ' · past target'}
                        </span>
                      )}
                    </span>

                    <span className="num shrink-0 text-[10px] text-[var(--color-ink-3)]">
                      {SHIFTS.find((s) => s.key === p.shift)?.label.split(' · ')[1]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <aside className="flex flex-col gap-3" aria-label="Coverage by role">
            <Card>
              <CardHead title="Coverage by role" />
              <ul className="px-3.5 pb-4">
                {(Object.keys(ROLE_LABEL) as Role[]).map((role, i) => {
                  const r = cap.byRole[role];
                  return (
                    <li
                      key={role}
                      className={cn(
                        'flex items-baseline justify-between gap-3 py-2',
                        i > 0 && 'border-t border-[var(--color-line-soft)]',
                      )}
                    >
                      <span className="text-[11px] text-[var(--color-ink-2)]">
                        {ROLE_LABEL[role]}
                      </span>
                      <span
                        className="num shrink-0 text-[11px] font-semibold"
                        style={{ color: r.on === 0 ? TONE.empty.fg : TONE.ok.fg }}
                      >
                        {r.on}/{r.total}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-[var(--color-line-soft)] px-3.5 py-2 text-[10px] leading-snug text-[var(--color-ink-3)] italic">
                A role at 0 on shift is not a staffing gap by itself — the night shift is meant to
                be thin. It becomes one when an order arrives that nobody on can take.
              </p>
            </Card>

            <Card>
              <CardHead title="Next shift" />
              <ul className="px-3.5 pb-4">
                {SHIFTS.map((s, i) => {
                  const count = ROSTER.filter((p) => p.shift === s.key).length;
                  const current = s.key === cap.shift;
                  return (
                    <li
                      key={s.key}
                      className={cn(
                        'flex items-baseline justify-between gap-3 py-2',
                        i > 0 && 'border-t border-[var(--color-line-soft)]',
                      )}
                    >
                      <span
                        className={cn(
                          'text-[11px]',
                          current
                            ? 'font-semibold text-[var(--color-ink)]'
                            : 'text-[var(--color-ink-2)]',
                        )}
                      >
                        {s.label}
                        {current && (
                          <span className="ml-1.5 text-[10px] text-[var(--color-ink-3)]">now</span>
                        )}
                      </span>
                      <span className="num shrink-0 text-[11px] text-[var(--color-ink-2)]">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card>
              <CardHead title="What carries over" />
              <div className="px-3.5 pb-4">
                {short && cap.runsNeeded !== null ? (
                  <p className="text-[11px] leading-relaxed text-[var(--color-ink-2)]">
                    <span className="num font-semibold" style={{ color: TONE.empty.fg }}>
                      {Math.abs(cap.shortfall ?? 0)}
                    </span>{' '}
                    runs will not happen this shift. Those stations stay over the threshold, keep
                    accruing duration, and arrive on the next shift worse than they are now — which
                    is the mechanism behind every chronic offender in Analytics.
                  </p>
                ) : (
                  <p className="text-[11px] leading-relaxed text-[var(--color-ink-2)]">
                    Nothing rebalancing-side carries over on the current numbers.
                  </p>
                )}
                {orders.oldest && (
                  <p className="mt-2 flex items-start gap-1.5 border-t border-[var(--color-line-soft)] pt-2 text-[10px] leading-snug text-[var(--color-ink-3)]">
                    <Icon name="wrench" size={11} />
                    <span>
                      Oldest open order: {WORK_ORDER_LABEL[orders.oldest.type]} at{' '}
                      {orders.oldest.target.stationName}, {formatAgo(ageMinutes(orders.oldest, now) * 60_000)} old.
                    </span>
                  </p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
