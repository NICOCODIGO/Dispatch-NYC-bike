import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DispatchComposer } from './DispatchComposer';
import { Icon } from '../ui/Icon';
import { Bar, Button, ScoreBadge, StatusPill } from '../ui/primitives';
import { ProvenancePill } from '../ui/ProvenancePill';
import { CONDITION_LABEL, LOW_CHARGE, bikesAt, summarize } from '../sim/fleet';
import { TONE, type Tone } from '../ui/tone';
import {
  CAPACITY_WEIGHT_CAP,
  CATEGORY_LABEL,
  CRITICAL_THRESHOLD,
  NEEDS_TRUCK_THRESHOLD,
  STALENESS_GRACE_MINUTES,
  type ScoreBreakdown,
} from '../model/score';
import { verdictFor } from '../data/verdict';
import { laneOf } from '../model/triage';
import { formatAgo, formatClock, formatReportedAge } from '../lib/time';
import { DURATION_CAP, DURATION_PER_HOUR, applyDuration, type Duration } from '../data/duration';
import { SCORE_NOTE, TRUCKS, factorsFor } from '../mock/data';
import type { StationRow } from '../data/stationRow';
import { useConsole } from '../state/useConsole';
import { cn } from '../lib/cn';

/**
 * The receipt, as a drawer over the board.
 *
 * The queue stays on screen behind it: checking why a station scored what it
 * did should not cost you your place in the list. Escape closes, focus moves in
 * on open and is trapped until it does, and the opener gets focus back.
 */
export function ScoreDrawer({ row, onClose }: { row: StationRow; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const factors = factorsFor(row);
  const [composing, setComposing] = useState(false);

  // The footer used to ask only "is this mechanical?", so a healthy station
  // clicked on the map got a full-width black Dispatch Truck Here directly
  // under a panel saying nothing was wrong with it.
  const verdict = row.breakdown ? verdictFor(row.breakdown, row.score ?? 0) : null;
  const unwanted = verdict === 'below' || verdict === 'unverified';

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const total = factors.reduce((sum, f) => sum + f.points, 0);
  // Straight from the model's ratio, which divides by slots actually reported
  // usable — never recomputed here against the unreliable nameplate.
  const pct = row.fill === null ? null : Math.round(row.fill * 100);

  return (
    <>
      {/* Dim-and-dismiss, matching the dispatch composer and method sheet.
          The receipt used to float over a fully live board with no way out
          except the Close button — the one dialog in the app that ignored the
          gesture everybody tries first. */}
      <button
        type="button"
        aria-label="Close score breakdown"
        onClick={onClose}
        className="fade-in fixed inset-0 z-[38] cursor-default bg-[rgb(43_38_33/34%)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${row.name} — score breakdown`}
        className="drawer-in hide-scroll fixed inset-y-0 right-0 z-40 flex w-[330px] max-w-full flex-col overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-surface)] shadow-[-2px_0_28px_rgb(43_38_33/18%)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-ink)] outline-none"
          >
            <Icon name="clipboard-list" size={15} className="text-[var(--color-ink-2)]" />
            Score Breakdown
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close score breakdown"
            className="text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex-1 px-4 py-4">
          <h3 className="text-[14px] leading-tight font-semibold text-[var(--color-ink)]">
            {row.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
            {row.borough} · <span className="num">{row.docks}</span> docks
          </p>

          <div className="mt-3.5 flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] p-3">
            <ScoreBadge score={row.score} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-[var(--color-ink-2)]">
                Station fill level
              </p>
              <div className="mt-1.5">
                <Bar value={row.fill} tone={row.fillTone} height={6} />
              </div>
              <p className="num mt-1.5 text-[10px] text-[var(--color-ink-3)]">
                {pct === null ? 'unknown' : `${pct}% full`} · {row.bikes === null ? '—' : row.bikes}{' '}
                bikes / {row.openDocks ?? row.docks} open
              </p>
            </div>
          </div>

          {row.breakdown ? (
            <>
              <Readiness row={row} />
              <LiveReceipt
                breakdown={row.breakdown}
                duration={row.duration ?? null}
                raw={row.raw}
              />
              <OnTheRack row={row} />
            </>
          ) : (
            factors.length > 0 && (
              <>
                <h4 className="eyebrow mt-5">How this score was calculated</h4>

                <ul className="mt-3 flex flex-col gap-3.5">
                  {factors.map((f) => (
                    <li key={f.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[11px] leading-snug text-[var(--color-ink-2)]">
                          {f.label}
                        </span>
                        <span
                          className="num shrink-0 text-[11px] font-semibold"
                          style={{ color: TONE[f.tone].fg }}
                        >
                          +{f.points} <span className="font-normal">pts</span>
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Bar value={f.share} tone={f.tone} height={4} />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-3">
                  <span className="text-[11px] text-[var(--color-ink-2)]">
                    All factors combined
                  </span>
                  <span className="num text-[13px] font-semibold text-[var(--color-ink)]">
                    = {total} / 100
                  </span>
                </div>
                <p className="mt-2 text-[10px] text-[var(--color-ink-3)] italic">
                  Fixture station — these contributions are illustrative.
                </p>
              </>
            )
          )}

          <p className="mt-4 rounded-lg bg-[var(--color-sunken)] p-3 text-[10px] leading-relaxed text-[var(--color-ink-3)]">
            {SCORE_NOTE}
          </p>
        </div>

        {composing && <DispatchComposer row={row} onClose={() => setComposing(false)} />}

        <div className="sticky bottom-0 flex flex-col gap-1 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          {/* Nothing to dispatch to a station a truck cannot fix. */}
          {row.action?.kind === 'mechanic' ? (
            <Button variant="outline" icon="wrench" className="w-full" onClick={onClose}>
              Needs a mechanic — see Maintenance Ops
            </Button>
          ) : unwanted ? (
            /* Demoted, not removed. The board's opinion is that this trip is
               not worth a run, and the button should stop looking like the
               recommended action — but a dispatcher with local knowledge the
               feed does not have is still allowed to overrule it, and a
               console that silently disables the override just gets worked
               around. */
            <Button
              variant="outline"
              icon="truck"
              className="w-full"
              onClick={() => setComposing(true)}
              title={
                verdict === 'unverified'
                  ? 'This station has not reported recently — you would be dispatching on counts nobody can vouch for.'
                  : 'This station is below the dispatch threshold. The board does not think this trip is worth a run.'
              }
            >
              {verdict === 'unverified' ? 'Dispatch anyway — counts unverified' : 'Dispatch anyway'}
            </Button>
          ) : (
            <Button
              variant="dark"
              icon="truck"
              className="w-full"
              onClick={() => setComposing(true)}
            >
              Dispatch Truck Here
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------
   The real receipt.

   Rendered straight from the ScoreBreakdown that ranked the queue — same
   object, same numbers, no recomputation. Note the shape: the score is not a
   sum of three equal contributions, it is

       base x capacityWeight + stalenessPenalty

   so the capacity line is a multiplier shown by the points it moved, not an
   independent factor. Every value is already rounded to its displayed
   precision by the model, which is what lets the column add up exactly.
--------------------------------------------------------------------------- */

/**
 * What the feed reported, before anyone interpreted it.
 *
 * The receipt below this is a chain of judgements — a base score somebody
 * chose, a multiplier somebody tuned, a duration weight I invented last week.
 * These are not that. Bikes and docks are counts a station transmitted, and
 * keeping them visually separate is what lets a reader disagree with the score
 * without having to disbelieve the data.
 *
 * The raw dump underneath is collapsed because it is an audit trail, not a
 * reading experience — but it exists, because a verdict with no way to check
 * its inputs is just an assertion.
 */
function Measured({
  raw,
  breakdown,
}: {
  raw: NonNullable<StationRow['raw']>;
  breakdown: ScoreBreakdown;
}) {
  const [open, setOpen] = useState(false);
  const { fill, staleness } = breakdown;
  const nameplateDisagrees = raw.usableSlots !== raw.capacity;

  return (
    <section className="mt-5">
      <h4 className="eyebrow">What the feed reported</h4>

      <dl className="mt-2 grid grid-cols-3 gap-2">
        <Fact label="Bikes" value={fill.bikes} />
        <Fact label="Open docks" value={fill.docks} />
        <Fact
          label="Reported"
          value={staleness.ageMinutes === null ? 'never' : formatReportedAge(staleness.ageMinutes)}
          small
        />
      </dl>

      <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-ink-2)]">
        {fill.bikes} of {raw.usableSlots} working slots hold a bike
        {fill.ratio !== null && <> — {Math.round(fill.ratio * 100)}% full</>}.
        {nameplateDisagrees && (
          <>
            {' '}
            The nameplate claims {raw.capacity} docks, so {Math.abs(raw.capacity - raw.usableSlots)}{' '}
            {Math.abs(raw.capacity - raw.usableSlots) === 1 ? 'is' : 'are'} not reporting as usable
            — fill is measured against what works, not what was installed.
          </>
        )}
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--color-ink-3)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
        {open ? 'Hide raw values' : 'Show data'}
      </button>

      {open && (
        <dl className="fade-in mt-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-2">
          <Raw term="Operator flags">
            {raw.isRenting ? 'renting' : 'NOT renting'} ·{' '}
            {raw.isReturning ? 'returning' : 'NOT returning'} ·{' '}
            {raw.isInstalled ? 'installed' : 'NOT installed'}
          </Raw>
          <Raw term="Disabled">
            {raw.bikesDisabled} bikes · {raw.docksDisabled} docks
          </Raw>
          <Raw term="E-bikes available">{raw.ebikesAvailable}</Raw>
          <Raw term="Usable slots">
            {raw.usableSlots} of {raw.capacity} nameplate
          </Raw>
          <Raw term="Last reported">
            {raw.lastReportedMs === null ? 'no timestamp' : formatClock(raw.lastReportedMs)}
          </Raw>
          <Raw term="Station id" last>
            <span className="break-all">{raw.stationId}</span>
          </Raw>
        </dl>
      )}
    </section>
  );
}

function Fact({
  label,
  value,
  small = false,
}: {
  label: string;
  value: number | string | null;
  small?: boolean;
}) {
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5">
      <dt className="eyebrow text-[10px]">{label}</dt>
      <dd
        className={cn(
          'num mt-1 leading-none font-semibold text-[var(--color-ink)]',
          small ? 'text-[11px]' : 'text-[15px]',
        )}
      >
        {value ?? '—'}
      </dd>
    </div>
  );
}

function Raw({
  term,
  children,
  last = false,
}: {
  term: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3 py-1.5 text-[10px]',
        !last && 'border-b border-[var(--color-line-soft)]',
      )}
    >
      <dt className="text-[var(--color-ink-3)]">{term}</dt>
      <dd className="num text-right text-[var(--color-ink)]">{children}</dd>
    </div>
  );
}

/**
 * The bikes actually standing at this station.
 *
 * GBFS is station-level arithmetic — twelve bikes, three electric, two broken —
 * and never says which twelve. Everything a mechanic or a swap crew touches is
 * an individual frame, so this panel models them.
 *
 * It is labelled `Simulated` at the top and every claim in it is sized by a
 * real count, which is the only reason it is defensible to show at all. See
 * `src/sim/fleet.ts` for the rule and the tests that hold it.
 *
 * Rendered from `raw` rather than from a store because it is a pure function of
 * the station status: the same counts always produce the same rack, so there is
 * nothing to keep in state.
 */
function OnTheRack({ row }: { row: StationRow }) {
  const [open, setOpen] = useState(false);
  const raw = row.raw;

  const bikes = useMemo(() => {
    // `row.bikes` is null exactly when the station is unverified — the lane
    // whose counts the app has already decided not to trust. Elaborating a rack
    // of individual frames on top of numbers the board refuses to rank on would
    // be the one place this panel could do real harm.
    if (!raw || row.bikes === null) return [];

    return bikesAt(
      {
        stationId: raw.stationId,
        bikesAvailable: row.bikes,
        ebikesAvailable: raw.ebikesAvailable,
        docksAvailable: row.openDocks ?? 0,
        bikesDisabled: raw.bikesDisabled,
        docksDisabled: raw.docksDisabled,
        isInstalled: raw.isInstalled,
        isRenting: raw.isRenting,
        isReturning: raw.isReturning,
        lastReportedMs: raw.lastReportedMs,
      },
      // One clock for the whole panel, and one taken per rebuild rather than
      // per render — bikes on a single screen must not disagree about how long
      // they have been standing, and the charges should move at the 60s poll,
      // not on every keystroke that rerenders the drawer.
      Date.now(),
    );
  }, [raw, row.bikes, row.openDocks]);

  const fleet = useMemo(() => summarize(bikes, raw?.stationId ?? ''), [bikes, raw?.stationId]);
  if (!raw || row.bikes === null) return null;

  return (
    <section className="mt-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="eyebrow">On the rack</h4>
        <ProvenancePill
          provenance="simulated"
          detail="GBFS carries counts, never individual bikes. Frame numbers, charge and condition are modelled — but the number of bikes, how many are electric and how many are broken all come from the live feed, so this list can never disagree with the counts above it."
        />
      </div>

      {bikes.length === 0 ? (
        <p className="mt-2 text-[11px] text-[var(--color-ink-2)]">
          Nothing on the rack — the station reports no bikes available.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-2)]">
            <span className="num font-semibold text-[var(--color-ink)]">{fleet.electric}</span>{' '}
            electric ·{' '}
            <span className="num font-semibold text-[var(--color-ink)]">{fleet.classic}</span>{' '}
            classic
            {fleet.meanCharge !== null && (
              <>
                {' '}
                · mean charge{' '}
                <span className="num font-semibold text-[var(--color-ink)]">
                  {fleet.meanCharge}%
                </span>
              </>
            )}
            {fleet.gridConnected && (
              <>
                {' '}
                ·{' '}
                <span style={{ color: TONE.ok.fg }}>
                  <Icon name="plug-zap" size={10} /> docks charge
                </span>
              </>
            )}
          </p>

          {fleet.lowCharge > 0 && (
            <p className="mt-1 text-[11px]" style={{ color: TONE.warn.fg }}>
              {fleet.lowCharge} e-bike{fleet.lowCharge === 1 ? '' : 's'} under {LOW_CHARGE}% — a
              swap run, not a rebalance.
            </p>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--color-ink-3)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
            {open ? 'Hide bikes' : `Show all ${bikes.length}`}
          </button>

          {open && (
            <ul className="fade-in mt-2 flex flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-1">
              {bikes.map((b, i) => (
                <li
                  key={b.id}
                  className={cn(
                    'flex items-center gap-2 py-1.5 text-[10px]',
                    i < bikes.length - 1 && 'border-b border-[var(--color-line-soft)]',
                  )}
                >
                  <span className="num w-[26px] shrink-0 text-[var(--color-ink-3)]">
                    {b.dock}
                  </span>
                  <span className="num w-[54px] shrink-0 font-semibold text-[var(--color-ink)]">
                    {b.id}
                  </span>
                  <span className="w-[52px] shrink-0 text-[var(--color-ink-2)]">
                    {b.kind === 'electric' ? 'E-bike' : 'Classic'}
                  </span>
                  <span className="w-[46px] shrink-0">
                    {b.charge === null ? (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    ) : (
                      <span
                        className="num font-semibold"
                        style={{ color: b.charge < LOW_CHARGE ? TONE.warn.fg : TONE.ok.fg }}
                      >
                        {b.charge}%
                      </span>
                    )}
                  </span>
                  <span className="ml-auto text-right">
                    {b.condition === 'ok' ? (
                      <span className="text-[var(--color-ink-3)]">
                        {CONDITION_LABEL[b.condition]}
                      </span>
                    ) : (
                      <StatusPill label={CONDITION_LABEL[b.condition]} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Can this actually be dispatched, and should it be?
 *
 * The Dispatch button was always available and always looked equally sensible,
 * which made it a button rather than a decision. These are the four things a
 * coordinator checks in their head before committing a vehicle; putting them
 * on screen means the awkward cases — no free truck, an order bigger than one
 * load — are visible before the click instead of discovered after it.
 */
function Readiness({ row }: { row: StationRow }) {
  const assignments = useConsole((s) => s.assignments);

  const lane = row.breakdown ? laneOf(row.breakdown) : null;
  const fresh = row.breakdown?.staleness.reason === 'current';
  const ordered = row.action?.bikes ?? 0;
  const biggestTruck = Math.max(...TRUCKS.map((t) => t.capacity));
  const free = TRUCKS.filter((t) => t.state === 'idle' && !assignments[t.id]).length;
  const score = row.score ?? 0;

  /**
   * "Nothing to do here" is a state, not the absence of one.
   *
   * Without this the gate happily reported "Ready to dispatch" for a station
   * scoring 30 — every operational check passed, because none of them asked
   * the first question, which is whether the station needs a truck at all. A
   * board that cannot tell you to leave something alone will send you to it.
   */
  /*
   * Gated on the verdict, not the lane.
   *
   * This used to read `lane === 'truck' && score < threshold`, which is only
   * one of the two ways a station can not need a truck. A healthy station sits
   * in the `quiet` lane, so it slipped past the guard entirely and got the full
   * readiness panel — "2 reasons to weigh this first" and a Dispatch Truck Here
   * button, on a station scoring 6 out of 100.
   *
   * Unreachable while the drawer only opened from the queue, which pools the
   * truck lane. Putting 2,509 stations on a map made every one of them
   * clickable and the hole became the common case.
   */
  if (row.breakdown && verdictFor(row.breakdown, score) === 'below') {
    const healthy = lane === 'quiet';
    return (
      <section
        className="mt-4 rounded-lg border p-3"
        style={{ borderColor: TONE.mute.line, backgroundColor: TONE.mute.bg }}
      >
        <div className="flex items-center gap-2">
          {/* Grey, not green. "Ready to dispatch" and "no truck needed" are
              both fine outcomes but they call for opposite actions, and in the
              same green they read as the same verdict at a glance. Green means
              go; this means stand down. */}
          <Icon name="minus-circle" size={13} style={{ color: TONE.mute.fg }} />
          <h4 className="text-[11.5px] font-semibold text-[var(--color-ink)]">
            {healthy ? 'Nothing wrong here' : 'No truck needed'}
          </h4>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-ink-2)]">
          Scores {score}, below the {NEEDS_TRUCK_THRESHOLD}-point dispatch threshold.{' '}
          {healthy ? (
            <>
              This station is serving riders on both sides — it has bikes to rent and docks to
              return to. It is not on the queue at all; you are seeing it because you clicked it on
              the map.
            </>
          ) : (
            <>
              This station is drifting but still serving riders on both sides — it stays on the
              board so you can watch it, not because it wants a vehicle.
            </>
          )}{' '}
          Sending a truck now spends a run that{' '}
          <strong className="font-semibold text-[var(--color-ink)]">
            something above the line needs more
          </strong>
          .
        </p>
      </section>
    );
  }

  // Ordered worst-first: the first failure is the one that decides the answer,
  // which is what lets the headline name a blocker instead of counting them.
  const checks = [
    {
      ok: lane === 'truck',
      blocker: 'a truck cannot fix this',
      label: 'A truck can fix it',
      detail:
        lane === 'truck'
          ? 'Distribution problem — moving bikes resolves it.'
          : 'Mechanical or unreadable. A truck changes nothing here.',
    },
    {
      ok: fresh,
      blocker: 'the reading is stale',
      label: 'Reading is current',
      detail: fresh
        ? `Reported ${formatReportedAge(row.breakdown?.staleness.ageMinutes ?? null)}, inside the ${STALENESS_GRACE_MINUTES}-minute grace window.`
        : `Reported ${formatReportedAge(row.breakdown?.staleness.ageMinutes ?? null)} — old enough that the counts may have moved since.`,
    },
    {
      ok: free > 0,
      blocker: 'nothing is free to send',
      label: 'A truck is free',
      detail:
        free > 0
          ? `${free} idle and unassigned.`
          : 'Nothing idle — sending one means re-tasking a vehicle already committed to another station.',
    },
    {
      ok: ordered > 0 && ordered <= biggestTruck,
      // This check fails two opposite ways — nothing to move, or too much to
      // move — so the phrase has to say which. It read "bigger than one load"
      // on mechanical stations, whose order is zero.
      blocker: ordered === 0 ? 'there is nothing to move' : 'it is bigger than one load',
      label: 'Fits one load',
      detail:
        ordered === 0
          ? 'No quantity to move.'
          : ordered <= biggestTruck
            ? `${ordered} bikes against ${biggestTruck} of truck capacity.`
            : `${ordered} bikes exceeds a single ${biggestTruck}-bike load — this needs two runs, or accept a partial fix.`,
    },
  ];

  const failed = checks.filter((c) => !c.ok);
  const blocked = failed.length;
  const tone: Tone = blocked === 0 ? 'ok' : blocked === 1 ? 'warn' : 'empty';

  /**
   * Name the blocker, do not merely count them.
   *
   * Four checks rendered at equal weight makes the reader do the diagnosis.
   * The checks are ordered worst-first, so the first failure is the one that
   * actually decides the answer, and the headline says which — and, when one
   * criterion passes handsomely while another fails, says that too.
   */
  const headline =
    blocked === 0
      ? 'Ready to dispatch'
      : blocked === 1
        ? `Dispatchable — but ${failed[0]!.blocker}`
        : `${blocked} reasons to weigh this first`;

  // When the station itself is fine and only the fleet is in the way, say so —
  // that is a different decision from "this station is not worth serving".
  const subhead =
    blocked === 1 && checks[0]!.ok && checks[1]!.ok
      ? `The station is not the problem — ${failed[0]!.blocker}.`
      : blocked > 1
        ? `${failed.map((f) => f.blocker).join(', and ')}.`
        : null;

  return (
    <section
      className="mt-4 rounded-lg border p-3"
      style={{ borderColor: TONE[tone].line, backgroundColor: TONE[tone].bg }}
    >
      <div className="flex items-center gap-2">
        <Icon
          name={blocked === 0 ? 'truck' : 'alert-triangle'}
          size={13}
          style={{ color: TONE[tone].fg }}
        />
        <h4 className="text-[11.5px] font-semibold text-[var(--color-ink)]">{headline}</h4>
      </div>

      {subhead && (
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-ink-2)]">{subhead}</p>
      )}

      <ul className="mt-2 flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-1.5">
            {/* A tick and a warning triangle, not two circles — pass and fail
                were sharing the info glyph, so the list read as four bullets. */}
            <span
              aria-hidden="true"
              className="mt-[3px] shrink-0"
              style={{ color: c.ok ? TONE.ok.fg : TONE.warn.fg }}
            >
              <Icon name={c.ok ? 'check-circle' : 'alert-triangle'} size={11} />
            </span>
            <span className="min-w-0">
              <span className="text-[10px] font-semibold text-[var(--color-ink)]">{c.label}</span>
              <span className="block text-[10px] leading-snug text-[var(--color-ink-2)]">
                {c.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LiveReceipt({
  breakdown,
  duration,
  raw,
}: {
  breakdown: ScoreBreakdown;
  duration: Duration | null;
  raw?: StationRow['raw'];
}) {
  const { capacity, staleness } = breakdown;
  const adjusted = applyDuration(breakdown, duration ?? undefined);
  const durationPts = duration?.confident ? duration.points : 0;

  if (!breakdown.scored) {
    return (
      <p className="mt-5 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] p-3 text-[11px] leading-relaxed text-[var(--color-ink-2)]">
        This station is not installed, so it is excluded from the ranking entirely.
      </p>
    );
  }

  return (
    <>
      {raw && <Measured raw={raw} breakdown={breakdown} />}

      <h4 className="eyebrow mt-5">How this board weighted it</h4>
      <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-ink-3)]">
        Everything above is what the feed reported. Everything below is a
        judgement this board made about it — see the method sheet for where each
        constant came from.
      </p>

      <dl className="mt-3">
        <Line
          label="Base"
          sub={CATEGORY_LABEL[breakdown.category]}
          detail={breakdown.baseRule}
          value={breakdown.base}
        />
        <Line
          label="Capacity weight"
          sub={`×${capacity.weight.toFixed(2)}${capacity.capped ? ` (capped at ${CAPACITY_WEIGHT_CAP})` : ''}`}
          detail={
            capacity.contribution >= 0
              ? `Serves ${capacity.capacity} docks against a network 90th percentile of ${capacity.p90Capacity}, so the same failure strands more riders.`
              : `Smaller than the typical station (${capacity.capacity} docks vs ${capacity.p90Capacity}), so the same failure strands fewer riders.`
          }
          value={capacity.contribution}
          signed
        />
        <Line
          label="Staleness"
          sub={
            staleness.ageMinutes === null
              ? 'never reported'
              : formatReportedAge(staleness.ageMinutes)
          }
          detail={
            staleness.reason === 'current'
              ? `Reported inside the ${STALENESS_GRACE_MINUTES}-minute grace window, so the counts are taken at face value.`
              : staleness.reason === 'never-reported'
                ? 'The feed carries no usable timestamp, so these counts cannot be vouched for at all.'
                : `Past the ${STALENESS_GRACE_MINUTES}-minute grace window. Staleness adds uncertainty, not severity — a station we cannot see might be fine, but it is worth a look.`
          }
          value={staleness.penalty}
          signed
        />

        {duration?.confident && (
          <Line
            label="Duration"
            sub={formatAgo(duration.minutes * 60_000)}
            detail={`Failing since ${formatClock(duration.failingSince).slice(0, 5)}. Each hour above the threshold adds ${DURATION_PER_HOUR} points, capped at +${DURATION_CAP} — a station nobody has served in hours is a worse failure than one that just tipped over.`}
            value={durationPts}
            signed
          />
        )}

        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-[var(--color-ink)] pt-3">
          <dt className="text-[12px] font-semibold text-[var(--color-ink)]">Urgency score</dt>
          <dd className="num text-[16px] leading-none font-semibold text-[var(--color-ink)]">
            {adjusted.score}
            <span className="text-[11px] font-normal text-[var(--color-ink-3)]"> / 100</span>
          </dd>
        </div>
        <p className="num mt-1.5 text-right text-[10px] text-[var(--color-ink-3)]">
          {breakdown.weighted} + {staleness.penalty}
          {durationPts > 0 && ` + ${durationPts}`}, rounded and clamped to 0–100
        </p>
      </dl>

      <Verdict breakdown={breakdown} score={adjusted.score} />
    </>
  );
}

/**
 * What the score means, derived from the score shown above it.
 *
 * This used to read `needsTruck`, which is not the same question. That flag is
 * false whenever a station is not reporting — however high it scores — so an
 * unverified station rendered "Urgency score 100 / 100" directly above "Below
 * the 55-point threshold. No truck needed yet." Two true statements about two
 * different values, sitting together as a flat contradiction.
 *
 * A station whose counts cannot be trusted has no verdict to give. Saying so
 * is the honest third case.
 */
function Verdict({ breakdown, score }: { breakdown: ScoreBreakdown; score: number }) {
  const verdict = verdictFor(breakdown, score);

  if (verdict === 'unverified') {
    return (
      <p
        className="mt-3 rounded-lg p-2.5 text-[10px] leading-relaxed"
        style={{ backgroundColor: TONE.mute.bg, color: TONE.mute.fg }}
      >
        <strong className="font-semibold">Excluded from scoring.</strong> This is what the station
        would score if its counts could be trusted — it has not reported in{' '}
        {formatReportedAge(breakdown.staleness.ageMinutes)}, so the arithmetic above runs on numbers
        nobody can vouch for. It is shown for audit, not as a claim, and no truck will be sent on
        it.
      </p>
    );
  }

  if (verdict === 'mechanic') {
    return (
      <p
        className="mt-3 rounded-lg p-2.5 text-[10px] leading-relaxed"
        style={{ backgroundColor: TONE.empty.bg, color: TONE.empty.fg }}
      >
        <strong className="font-semibold">A truck cannot fix this.</strong> The station is
        mechanically out of service, so moving bikes changes nothing. It is routed to Maintenance
        Operations instead of the queue.
      </p>
    );
  }

  return (
    <p className="mt-3 text-[10px] leading-relaxed text-[var(--color-ink-2)]">
      {verdict === 'critical' ? (
        <>
          At or above the {CRITICAL_THRESHOLD}-point critical line —{' '}
          <strong className="font-semibold text-[var(--color-ink)]">
            this one goes ahead of the rest of the queue.
          </strong>{' '}
          Everything from {NEEDS_TRUCK_THRESHOLD} up is worth a trip; this band is what you send
          first when you cannot send everything.
        </>
      ) : verdict === 'dispatch' ? (
        <>
          At or above the {NEEDS_TRUCK_THRESHOLD}-point dispatch threshold —{' '}
          <strong className="font-semibold text-[var(--color-ink)]">
            this station needs a truck.
          </strong>
        </>
      ) : (
        <>Below the {NEEDS_TRUCK_THRESHOLD}-point dispatch threshold. No truck needed yet.</>
      )}
    </p>
  );
}

/** One line of the receipt: the rule, its inputs, and what it contributed. */
function Line({
  label,
  sub,
  detail,
  value,
  signed = false,
}: {
  label: string;
  sub: string;
  detail: string;
  value: number;
  signed?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-[var(--color-line-soft)] py-2.5">
      <dt className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">{label}</span>
          <span className="num text-[10px] text-[var(--color-ink-3)]">{sub}</span>
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-[var(--color-ink-3)]">
          {detail}
        </span>
      </dt>
      <dd
        className={cn(
          'num self-start text-right text-[13px]',
          value === 0 ? 'text-[var(--color-ink-3)]' : 'font-semibold text-[var(--color-ink)]',
        )}
      >
        {signed && value > 0 ? '+' : ''}
        {value}
      </dd>
    </div>
  );
}
