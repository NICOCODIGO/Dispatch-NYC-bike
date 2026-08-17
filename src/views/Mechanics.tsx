import { useState } from 'react';
import { Link } from 'react-router-dom';
import { focusHref } from '../state/useFocus';
import { COLUMN_HELP } from '../content/columns';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Button, Card, CardHead, Finding, Segmented, Td, Th, TonePill } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { pendingCount, useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { mechanicFault } from '../model/triage';
import { CATEGORY_LABEL } from '../model/score';
import { formatReportedAge } from '../lib/time';
import { shortStationId } from '../data/adapt';
import { capacityLoss, networkDocks } from '../data/insights';
import type { ScoredStation } from '../model/summary';
import {
  MECHANICS,
  MECHANICS_ON_SHIFT,
  stationById,
  type ActivityEntry,
  type Ticket,
} from '../mock/data';

/**
 * Work a truck cannot do.
 *
 * Tickets are cards rather than table rows because each one carries a
 * paragraph of fault description and its own decision — assign, defer,
 * complete — and that does not compress into a row without losing the thing a
 * mechanic actually needs to read.
 */
export function Mechanics() {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const tickets = useConsole((s) => s.tickets);
  const activity = useConsole((s) => s.activity);
  const faults = useDispatch((s) => s.lanes.mechanic);

  const pending = pendingCount(tickets);

  return (
    <>
      <PageHeader
        title="Maintenance Operations"
        subtitle={`Work a truck cannot do. ${faults.length} station${faults.length === 1 ? '' : 's'} reported broken by the feed · ${tickets.length} open work order${tickets.length === 1 ? '' : 's'} · ${MECHANICS_ON_SHIFT.active} mechanics on shift · ${pending} pending assignment`}
        actions={
          <>
            <Segmented
              label="Ticket view"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'active', label: 'Active Tickets' },
                { value: 'history', label: 'History' },
              ]}
            />
            <Button variant="dark">Create Work Order</Button>
          </>
        }
      />

      <PageBody>
        <OutOfServiceFinding faults={faults} />

        <div className="mt-3.5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_286px]">
          <div className="min-w-0">
            {tab === 'active' ? (
              <>
                <FeedFaults />

                <h2 className="eyebrow mt-4 mb-2.5 text-[9px]">
                  Work orders ({tickets.length})
                </h2>
                <ul className="flex flex-col gap-3.5">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <TicketCard ticket={t} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Card className="px-4 py-10 text-center text-[12px] text-[var(--color-ink-3)]">
                No resolved tickets in this session.
              </Card>
            )}
          </div>

          <aside className="flex flex-col gap-3.5" aria-label="Mechanics and activity">
            <ActiveMechanics />
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
  const tickets = useConsole((s) => s.tickets);
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
        detail={`Every station the feed returned is renting, returning and showing usable slots. ${tickets.length} work order${tickets.length === 1 ? '' : 's'} remain open from earlier.`}
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
        { label: 'open orders', value: tickets.length },
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

function FeedFaults() {
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
          <span className="num text-[9px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
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

                return (
                  <tr
                    key={station.stationId}
                    className="border-b border-[var(--color-line-soft)] last:border-b-0"
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
                        to={focusHref('/', station.stationId, 'Maintenance Ops', '/mechanics')}
                        className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[9.5px] text-[var(--color-ink-3)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
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
                              icon: 'plug-zap',
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

function TicketCard({ ticket }: { ticket: Ticket }) {
  const tone = TONE[ticket.tone];
  const openStation = useConsole((s) => s.openStation);
  const [before, after] = ticket.faultCode
    ? ticket.fault.split('{code}')
    : [ticket.fault, undefined];

  const linkable = ticket.stationId ? stationById(ticket.stationId) : null;

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
          <Icon name={ticket.icon} size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">{ticket.title}</h3>
            <TonePill label={ticket.severity} tone={ticket.tone} />
          </div>
          {linkable ? (
            <button
              type="button"
              onClick={() => openStation(linkable.id)}
              className="mt-1 block text-left text-[11px] text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
            >
              {ticket.where}
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--color-ink-2)]">{ticket.where}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="eyebrow text-[9px]">Reported</p>
          <p className="num mt-1 text-[12px] font-semibold text-[var(--color-ink)]">
            {ticket.reported}
          </p>
        </div>
      </div>

      <div className="mx-3.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-2.5">
        {ticket.faultCode && (
          <p className="eyebrow flex items-center gap-1.5 text-[9px]">
            <Icon name="cog" size={11} />
            Fault description
          </p>
        )}
        <p
          className={
            ticket.faultCode
              ? 'mt-1.5 text-[11px] leading-relaxed text-[var(--color-ink-2)]'
              : 'text-[11px] leading-relaxed text-[var(--color-ink-2)]'
          }
        >
          {before}
          {ticket.faultCode && (
            <code className="num rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-px text-[10px] text-[var(--color-ink)]">
              {ticket.faultCode}
            </code>
          )}
          {after}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-3.5 pb-3.5">
        {ticket.assignment.kind === 'pending' ? (
          <p className="flex items-center gap-2 text-[11px] text-[var(--color-ink-3)] italic">
            Assignment:
            <span className="not-italic">
              <TonePill label={ticket.assignment.label} tone="mute" />
            </span>
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-3)] italic">
            Assigned to:
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] py-[3px] pr-2.5 pl-1 not-italic">
              <Avatar size={16} />
              <span className="text-[11px] font-medium text-[var(--color-ink)]">
                {ticket.assignment.who}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1 text-[9px] font-semibold tracking-[0.08em] not-italic"
              style={{ color: TONE.ok.fg }}
            >
              <Icon name="truck" size={12} />
              {ticket.assignment.status}
            </span>
          </p>
        )}

        {ticket.assignment.kind === 'pending' ? (
          <span className="flex items-center gap-2">
            <Button size="sm">Defer</Button>
            <Button size="sm" variant="dark">
              Assign Now
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="green">
            Complete Task
          </Button>
        )}
      </div>
    </Card>
  );
}

function Avatar({ size = 22, online }: { size?: number; online?: boolean }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className="block h-full w-full rounded-full bg-gradient-to-br from-[#9c8b73] to-[#5c5145]"
      />
      {online && (
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 h-[7px] w-[7px] rounded-full border-2 border-[var(--color-surface)]"
          style={{ backgroundColor: TONE.ok.fg }}
        />
      )}
    </span>
  );
}

function ActiveMechanics() {
  return (
    <Card>
      <CardHead
        title="Active mechanics"
        right={
          <span className="num text-[10px] text-[var(--color-ink-2)]">
            {MECHANICS_ON_SHIFT.active}/{MECHANICS_ON_SHIFT.total}
          </span>
        }
      />
      <ul className="px-3.5 pb-3">
        {MECHANICS.map((m, i) => (
          <li
            key={m.name}
            className={
              i > 0
                ? 'flex items-center gap-2.5 border-t border-[var(--color-line-soft)] py-2.5'
                : 'flex items-center gap-2.5 py-2.5'
            }
          >
            <Avatar online />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-[var(--color-ink)]">
                {m.name}
              </span>
              <span className="block truncate text-[10px] text-[var(--color-ink-3)]">
                {m.status}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Call ${m.name}`}
              className="shrink-0 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
            >
              <Icon name="phone" size={14} />
            </button>
          </li>
        ))}
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
              <span className="num mt-0.5 block text-[9px] text-[var(--color-ink-3)]">
                {e.time} · {e.where}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
