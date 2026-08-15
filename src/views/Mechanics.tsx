import { useState } from 'react';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Button, Card, CardHead, Segmented, TonePill } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { pendingCount, useConsole } from '../state/useConsole';
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

  const pending = pendingCount(tickets);

  return (
    <>
      <PageHeader
        title="Maintenance Operations"
        subtitle={`${tickets.length} open hardware alert${tickets.length === 1 ? '' : 's'} · ${MECHANICS_ON_SHIFT.active} mechanics on shift · ${pending} dispatch${pending === 1 ? '' : 'es'} pending`}
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_286px]">
          <div className="min-w-0">
            {tab === 'active' ? (
              <ul className="flex flex-col gap-3.5">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <TicketCard ticket={t} />
                  </li>
                ))}
              </ul>
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
