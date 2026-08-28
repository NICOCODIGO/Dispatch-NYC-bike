import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DispatchComposer } from './DispatchComposer';
import { Icon } from '../ui/Icon';
import { Bar, Button, ScoreBadge } from '../ui/primitives';
import { ProvenancePill } from '../ui/ProvenancePill';
import { StationAssets } from './StationAssets';
import {
  LOW_CHARGE,
  bikesAt,
  docksAt,
  statusFromRow,
  summarize,
  summarizeDocks,
} from '../sim/fleet';
import { TONE, type Tone } from '../ui/tone';
import {
  CAPACITY_WEIGHT_CAP,
  CATEGORY_LABEL,
  CRITICAL_THRESHOLD,
  NEEDS_TRUCK_THRESHOLD,
  STALENESS_GRACE_MINUTES,
  type ScoreBreakdown,
} from '../model/score';
import { CATEGORY_TONE } from '../data/adapt';
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
  /** Which asset list to open, or null for closed. */
  const [assets, setAssets] = useState<'bikes' | 'docks' | null>(null);

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

          {/* The scale, not a second fill bar.
              This card used to draw fill again, three lines under the fill bar
              already in the row you clicked to get here, while the number in the
              badge beside it went unexplained. Swapping in the urgency scale
              means the headline figure is located the moment you arrive, and the
              fill reading stays as the text underneath where it is still worth
              having. */}
          <div className="mt-3.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] p-3">
            <div className="flex items-center gap-3">
              <ScoreBadge score={row.score} size="lg" />
              <div className="min-w-0 flex-1">
                {row.score === null ? (
                  <>
                    <p className="text-[11px] font-medium text-[var(--color-ink-2)]">
                      Not scored
                    </p>
                    <div className="mt-1.5">
                      <Bar value={row.fill} tone={row.fillTone} height={6} />
                    </div>
                  </>
                ) : (
                  <ScoreBand score={row.score} compact />
                )}
              </div>
            </div>

            <p className="num mt-2.5 text-[10px] text-[var(--color-ink-3)]">
              {pct === null ? 'fill unknown' : `${pct}% full`} ·{' '}
              {row.bikes === null ? '—' : row.bikes} bikes / {row.openDocks ?? row.docks} open
            </p>
          </div>

          {row.breakdown ? (
            <>
              <Readiness row={row} />
              {/* Above the receipt, not below it. What is physically at the
                  station is the most concrete thing in this drawer, and it was
                  sitting under two sections of explanation — so the tangible
                  answer arrived last and only if you scrolled for it.
                  Readiness stays first because it is the decision. */}
              <OnTheRack row={row} onOpenAssets={setAssets} />
              <LiveReceipt
                breakdown={row.breakdown}
                duration={row.duration ?? null}
                raw={row.raw}
              />
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
                  Fixture station. These contributions are illustrative.
                </p>
              </>
            )
          )}

          <p className="mt-4 rounded-lg bg-[var(--color-sunken)] p-3 text-[10px] leading-relaxed text-[var(--color-ink-3)]">
            {SCORE_NOTE}
          </p>
        </div>

        {composing && <DispatchComposer row={row} onClose={() => setComposing(false)} />}

        {/* Layered over the drawer rather than replacing it, so closing the
            list puts you back exactly where you were instead of at the top of
            a rebuilt panel. */}
        {assets && (
          <StationAssets row={row} initial={assets} onClose={() => setAssets(null)} />
        )}

        <div className="sticky bottom-0 flex flex-col gap-1 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          {/* Nothing to dispatch to a station a truck cannot fix. */}
          {row.action?.kind === 'mechanic' ? (
            <Button variant="outline" icon="wrench" className="w-full" onClick={onClose}>
              Needs a mechanic. Open Maintenance Ops
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
                  ? 'This station has not reported recently. You would be dispatching on counts nobody can vouch for.'
                  : 'This station is below the dispatch threshold. The board does not think this trip is worth a run.'
              }
            >
              {verdict === 'unverified' ? 'Dispatch anyway, counts unverified' : 'Dispatch anyway'}
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
        {/* Why the denominator is what it is. This lived in two places: here as
            "the nameplate disagrees", and again at the bottom of the drawer as
            "N of M docks out of service" — two framings of one fact, computed
            from different fields, so they could print different dock counts for
            the same station. Worse, the more precise of the two sat inside the
            section labelled Simulated, which made `num_docks_disabled` — a real
            number the operator publishes — look invented.

            It is said once, here, where the feed's own figures are. */}
        {raw.docksDisabled === 0 && nameplateDisagrees && (
          <>
            {' '}
            The nameplate claims {raw.capacity} docks, so{' '}
            {Math.abs(raw.capacity - raw.usableSlots)}{' '}
            {Math.abs(raw.capacity - raw.usableSlots) === 1 ? 'is' : 'are'} not reporting as usable
            so fill is measured against what works, not what was installed.
          </>
        )}
      </p>

      {/* Lifted out of the paragraph above. Broken hardware is the one thing
          here that changes which vehicle you send, so it should not have to be
          found mid-sentence. */}
      {raw.docksDisabled > 0 && (
        <Callout tone="empty" label="What the feed found">
          <strong className="font-semibold text-[var(--color-ink)]">
            {raw.docksDisabled} dock{raw.docksDisabled === 1 ? ' is' : 's are'} out of service
          </strong>
          , so fill is measured against the {raw.usableSlots} that work rather than the{' '}
          {raw.capacity} on the nameplate. A station can read as full because it is full, or
          because most of it is broken, and only one of those is a truck job.
        </Callout>
      )}

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
function OnTheRack({ row, onOpenAssets }: { row: StationRow; onOpenAssets: (tab: 'bikes' | 'docks') => void }) {
  const status = useMemo(() => statusFromRow(row), [row]);
  const bikes = useMemo(() => (status ? bikesAt(status, Date.now()) : []), [status]);
  const docks = useMemo(() => (status ? docksAt(status) : []), [status]);
  const fleet = useMemo(() => summarize(bikes, row.id), [bikes, row.id]);
  const dockStats = useMemo(() => summarizeDocks(docks), [docks]);

  if (!status) return null;

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="eyebrow">On the rack</h4>
        <ProvenancePill
          provenance="simulated"
          detail="GBFS carries counts, never individual bikes. Frame numbers, charge and fault reasons are modelled. The number of bikes, how many are electric and how many are broken all come from the live feed."
        />
      </div>

      {/* Two tiles, not two lists. The lists live in their own panel now: at a
          large station they ran to sixty bikes and a hundred docks, and
          unfolding them here buried every other section under a thousand pixels
          of scroll. What belongs in the drawer is the count and a way in. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <AssetTile
          label="Bikes present"
          value={fleet.total}
          tone={fleet.outOfService > 0 ? 'warn' : 'ink'}
          foot={
            fleet.total === 0
              ? 'nothing to collect'
              : `${fleet.electric} electric · ${fleet.flagged + fleet.outOfService} faulted`
          }
          onClick={() => onOpenAssets('bikes')}
          disabled={fleet.total === 0}
        />
        <AssetTile
          label="Docks out"
          value={dockStats.dead}
          tone={dockStats.dead > 0 ? 'empty' : 'ok'}
          foot={
            dockStats.dead === 0
              ? `all ${dockStats.total} reporting`
              : `of ${dockStats.total} · ${dockStats.siteFaults} look site-wide`
          }
          onClick={() => onOpenAssets('docks')}
          disabled={dockStats.dead === 0}
        />
      </div>

      {fleet.meanCharge !== null && (
        <p className="mt-2 text-[10.5px] text-[var(--color-ink-2)]">
          Mean charge{' '}
          <span className="num font-semibold text-[var(--color-ink)]">{fleet.meanCharge}%</span>
          {fleet.lowCharge > 0 && (
            <span style={{ color: TONE.warn.fg }}>
              {' '}
              · {fleet.lowCharge} under {LOW_CHARGE}%, a swap run rather than a rebalance
            </span>
          )}
          {fleet.gridConnected && (
            <span style={{ color: TONE.ok.fg }}> · docks charge what is parked in them</span>
          )}
        </p>
      )}

      {dockStats.siteFaults > 0 && (
        <Callout tone="warn" label="Fault pattern">
          <strong className="font-semibold text-[var(--color-ink)]">
            {dockStats.siteFaults} of the dead docks
          </strong>{' '}
          read as power or comms rather than mechanical. That pattern is a site visit, not a dock
          repair, and if it spreads the station stops reporting altogether.
        </Callout>
      )}
    </section>
  );
}

/** A count with a way into the detail behind it. */
function AssetTile({
  label,
  value,
  foot,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  value: number;
  foot: string;
  tone: Tone;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border border-[var(--color-line)] px-3 py-2 text-left transition-colors',
        disabled
          ? 'cursor-default bg-[var(--color-sunken)]'
          : 'cursor-pointer bg-[var(--color-surface)] hover:border-[var(--color-ink-3)]',
      )}
    >
      <span className="eyebrow text-[10px]">{label}</span>
      <span className="mt-1 flex items-baseline justify-between gap-2">
        <span className="num text-[19px] leading-none font-semibold" style={{ color: TONE[tone].fg }}>
          {value}
        </span>
        {!disabled && <Icon name="chevron-right" size={13} />}
      </span>
      <span className="mt-1 block text-[10px] leading-snug text-[var(--color-ink-3)]">{foot}</span>
    </button>
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
  /*
   * Each check carries three separate strings, because they are read in three
   * different places and collapsing them is what made this panel repeat itself.
   *
   * `detail` explains the check where it sits in the list. `blocker` is a short
   * noun phrase for naming it in the headline. `consequence` is what the reader
   * should do about it, and it is the only one that belongs in the subhead —
   * the previous version put `blocker` in both the headline and the line under
   * it, so a blocked station announced "Dispatchable, but it is bigger than one
   * load" and then immediately explained that it was bigger than one load.
   */
  const checks = [
    {
      ok: lane === 'truck',
      blocker: 'a truck cannot fix it',
      consequence: 'Maintenance owns this one. Moving bikes will not change it.',
      label: 'A truck can fix it',
      detail:
        lane === 'truck'
          ? 'This is a distribution problem. Moving bikes resolves it.'
          : 'Mechanical or unreadable, so moving bikes changes nothing.',
    },
    {
      ok: fresh,
      blocker: 'the reading is stale',
      consequence: 'Worth confirming the counts before committing a vehicle.',
      label: 'Reading is current',
      detail: fresh
        ? `Reported ${formatReportedAge(row.breakdown?.staleness.ageMinutes ?? null)}, inside the ${STALENESS_GRACE_MINUTES}-minute grace window.`
        : `Reported ${formatReportedAge(row.breakdown?.staleness.ageMinutes ?? null)}, old enough that the counts may have moved since.`,
    },
    {
      ok: free > 0,
      blocker: 'no truck is free',
      consequence: 'Sending one means pulling it off a station already waiting.',
      label: 'A truck is free',
      detail:
        free > 0
          ? `${free} idle and unassigned.`
          : 'Every vehicle is committed to another station.',
    },
    {
      ok: ordered > 0 && ordered <= biggestTruck,
      // This check fails two opposite ways, nothing to move or too much to
      // move, so the phrase has to say which. It read "bigger than one load"
      // on mechanical stations, whose order is zero.
      blocker: ordered === 0 ? 'there is nothing to move' : 'it is larger than one truckload',
      consequence:
        ordered === 0
          ? 'There is no order to fill here.'
          : `Plan two runs, or send one and accept a partial fix.`,
      label: 'Fits one load',
      detail:
        ordered === 0
          ? 'No quantity to move.'
          : `${ordered} bikes against ${biggestTruck} of truck capacity.`,
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
  const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const headline =
    blocked === 0
      ? 'Ready to dispatch'
      : blocked === 1
        ? `Dispatchable, with one caveat`
        : `Not ready: ${blocked} things to weigh first`;

  /*
   * The subhead advances the reader rather than restating the headline.
   *
   * One blocker gets its consequence, which is the actionable half. Several get
   * named, because with more than one the reader needs to know which before any
   * single instruction makes sense.
   */
  const subhead =
    blocked === 1
      ? `${sentenceCase(failed[0]!.blocker)}. ${failed[0]!.consequence}`
      : blocked > 1
        ? `${sentenceCase(failed.map((f) => f.blocker).join(', and '))}.`
        : null;

  return (
    <section
      className="mt-4 rounded-lg border p-3"
      style={{ borderColor: TONE[tone].line, backgroundColor: TONE[tone].bg }}
    >
      {/* Icon and text are siblings in a flex row, so the subhead hangs under
          the headline rather than under the icon. It previously sat outside
          this row entirely and started at the card's left edge, which read as a
          separate paragraph rather than as the headline's own second line. */}
      <div className="flex items-start gap-2">
        <span className="mt-[1px] shrink-0" style={{ color: TONE[tone].fg }}>
          <Icon name={blocked === 0 ? 'truck' : 'alert-triangle'} size={13} />
        </span>
        <div className="min-w-0">
          <h4 className="text-[11.5px] leading-snug font-semibold text-[var(--color-ink)]">
            {headline}
          </h4>
          {subhead && (
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-ink-2)]">{subhead}</p>
          )}
        </div>
      </div>

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

  // Bars are scaled against the largest term on *this* receipt, not against
  // 100. The question they answer is "which of these moved the score", and
  // against a fixed 100 every modifier would be a stub beside the base.
  const widest = Math.max(
    Math.abs(breakdown.base),
    Math.abs(capacity.contribution),
    Math.abs(staleness.penalty),
    Math.abs(durationPts),
  );

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
          scale={widest}
          tone={CATEGORY_TONE[breakdown.category]}
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
          scale={widest}
          tone="flood"
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
          scale={widest}
          tone="mute"
          signed
        />

        {duration?.confident && (
          <Line
            label="Duration"
            sub={formatAgo(duration.minutes * 60_000)}
            detail={`Failing since ${formatClock(duration.failingSince).slice(0, 5)}. Each hour above the threshold adds ${DURATION_PER_HOUR} points, capped at +${DURATION_CAP} — a station nobody has served in hours is a worse failure than one that just tipped over.`}
            value={durationPts}
            scale={widest}
            tone="warn"
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
        <p className="num mt-1 text-right text-[10px] text-[var(--color-ink-3)]">
          {breakdown.weighted} + {staleness.penalty}
          {durationPts > 0 && ` + ${durationPts}`}, rounded
        </p>
      </dl>

      {/* The scale is drawn once, at the top of the drawer beside the badge.
          Repeating it under the arithmetic would be the third statement of the
          same fact, which is what this section was rebuilt to stop doing. */}

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

  // critical / dispatch / below are the three bands the scale draws directly.
  // Saying them again in a paragraph was the third restatement of one fact.
  return null;
}

/**
 * Where this score sits on the scale, as a picture.
 *
 * The number and its two thresholds used to be three separate sentences: the
 * total, an arithmetic line, and a paragraph explaining which side of 55 and 70
 * it fell on. All three said the same thing in different notation, and the
 * reader had to hold two constants in their head to decode any of it.
 *
 * Drawn instead, the bands are self-explaining: the segments are proportional
 * to their real ranges, so the eye lands on the marker and reads the verdict
 * off the colour it is standing in. One sentence is then enough to say what to
 * do about it.
 */
function ScoreBand({ score, compact = false }: { score: number; compact?: boolean }) {
  const bands = [
    { to: NEEDS_TRUCK_THRESHOLD, label: 'Drifting', tone: 'ok' as Tone },
    { to: CRITICAL_THRESHOLD, label: 'Worth a trip', tone: 'warn' as Tone },
    { to: 100, label: 'Critical', tone: 'empty' as Tone },
  ];

  const current =
    score >= CRITICAL_THRESHOLD ? 2 : score >= NEEDS_TRUCK_THRESHOLD ? 1 : 0;
  const here = bands[current]!;

  return (
    <section className="mt-3">
      <div className="relative">
        <span aria-hidden="true" className="flex h-[18px] w-full gap-[2px] overflow-hidden">
          {bands.map((b, i) => {
            const from = i === 0 ? 0 : bands[i - 1]!.to;
            const active = i === current;
            return (
              <span
                key={b.label}
                className={cn(
                  'flex items-center justify-center rounded-[3px] text-[8.5px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase transition-colors',
                  i === 0 && 'rounded-l-full',
                  i === bands.length - 1 && 'rounded-r-full',
                )}
                style={{
                  width: `${b.to - from}%`,
                  backgroundColor: active ? TONE[b.tone].fg : TONE[b.tone].bg,
                  color: active ? TONE[b.tone].onFg : TONE[b.tone].fg,
                }}
              >
                {active && b.label}
              </span>
            );
          })}
        </span>

        {/* Sits on the scale rather than under a label, so "91" is located
            rather than merely stated. */}
        <span
          aria-hidden="true"
          className="absolute -top-[3px] h-[24px] w-[2px] rounded-full bg-[var(--color-ink)]"
          style={{ left: `calc(${Math.min(100, Math.max(0, score))}% - 1px)` }}
        />
      </div>

      {/* The tick labels are for the receipt, where the scale is being taught.
          At the top of the drawer the band is a locator, and four numerals
          under a 200px strip is noise beside a badge already printing the
          score. */}
      {!compact && (
        <div className="num mt-1.5 flex justify-between text-[9px] text-[var(--color-ink-3)]">
          <span>0</span>
          <span>{NEEDS_TRUCK_THRESHOLD}</span>
          <span>{CRITICAL_THRESHOLD}</span>
          <span>100</span>
        </div>
      )}

      <p
        className={cn(
          'leading-relaxed text-[var(--color-ink-2)]',
          compact ? 'mt-1.5 text-[10px]' : 'mt-2 text-[10.5px]',
        )}
      >
        <strong className="font-semibold" style={{ color: TONE[here.tone].fg }}>
          {here.label}.
        </strong>{' '}
        {current === 2
          ? `Send this before anything scoring under ${CRITICAL_THRESHOLD}.`
          : current === 1
            ? `Worth a vehicle when one is free, after anything above ${CRITICAL_THRESHOLD}.`
            : `Still serving riders. Watch it rather than driving to it.`}
      </p>
    </section>
  );
}

/**
 * A finding, stated as a conclusion rather than as commentary.
 *
 * The drawer used to say everything in one weight of grey prose, which meant
 * the sentence that changes your decision — *most of this station is broken* —
 * sat at the same volume as the sentence explaining what a denominator is. A
 * tinted block with a colored edge is the cheapest way to mark the difference,
 * and it costs no extra height because the words were already there.
 */
function Callout({
  tone,
  label,
  children,
}: {
  tone: Tone;
  label: string;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className="mt-2 rounded-lg px-3 py-2"
      style={{ backgroundColor: t.bg, borderLeft: `3px solid ${t.fg}` }}
    >
      <p className="eyebrow text-[10px]" style={{ color: t.fg }}>
        {label}
      </p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--color-ink-2)]">{children}</p>
    </div>
  );
}

/**
 * One line of the receipt: the rule, its inputs, and what it contributed.
 *
 * The contribution gets a bar as well as a number. Four stacked figures — 70,
 * +17.5, 0, +4 — are readable but not *comparable*: seeing that capacity is the
 * second-biggest lever meant comparing digits in your head, on a panel whose
 * entire job is to make the arithmetic obvious. The bar is scaled against the
 * largest term on this receipt rather than against 100, because the question it
 * answers is "which of these moved the score", not "how close to full is it".
 *
 * A negative contribution draws leftward from the same origin, so a capacity
 * weight that *reduces* urgency reads as pulling the other way instead of as a
 * short positive bar with a minus sign.
 */
function Line({
  label,
  sub,
  detail,
  value,
  scale,
  tone = 'ink',
  signed = false,
}: {
  label: string;
  sub: string;
  detail: string;
  value: number;
  /** Largest absolute contribution on the receipt, for the bar's full width. */
  scale: number;
  tone?: Tone;
  signed?: boolean;
}) {
  const share = scale > 0 ? Math.min(1, Math.abs(value) / scale) : 0;
  const negative = value < 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-[var(--color-line-soft)] py-2.5">
      <dt className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">{label}</span>
          <span className="num text-[10px] text-[var(--color-ink-3)]">{sub}</span>
        </span>

        {/* Origin sits at the centre so negatives have somewhere to go. */}
        <span
          aria-hidden="true"
          className="mt-1.5 flex h-[4px] w-full overflow-hidden rounded-full bg-[var(--color-line-soft)]"
        >
          <span className="flex w-1/2 justify-end">
            {negative && (
              <span
                className="block h-full rounded-full"
                style={{ width: `${share * 100}%`, backgroundColor: TONE[tone].fg }}
              />
            )}
          </span>
          <span className="flex w-1/2 justify-start">
            {!negative && share > 0 && (
              <span
                className="block h-full rounded-full"
                style={{ width: `${share * 100}%`, backgroundColor: TONE[tone].fg }}
              />
            )}
          </span>
        </span>

        <span className="mt-1 block text-[10px] leading-snug text-[var(--color-ink-3)]">
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
