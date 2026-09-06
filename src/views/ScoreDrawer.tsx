import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DispatchComposer } from './DispatchComposer';
import { Icon } from '../ui/Icon';
import { Bar, Button, ScoreBadge } from '../ui/primitives';
import { ProvenancePill } from '../ui/ProvenancePill';
import { StationAssets } from './StationAssets';
import {
  BIKE_FAULT_LABEL,
  LOW_CHARGE,
  bikesAt,
  docksAt,
  statusFromRow,
  summarize,
  summarizeDocks,
} from '../sim/fleet';
import { applyTriage, awaitingTriage, faultTally } from '../model/pickup';
import { TONE, type Tone } from '../ui/tone';
import {
  CAPACITY_WEIGHT_CAP,
  CATEGORY_LABEL,
  CRITICAL_THRESHOLD,
  NEEDS_VEHICLE_THRESHOLD,
  STALENESS_GRACE_MINUTES,
  type ScoreBreakdown,
} from '../model/score';
import { CATEGORY_TONE } from '../data/adapt';
import { verdictFor, type VerdictKind } from '../data/verdict';
import { laneOf } from '../model/triage';
import { formatAgo, formatClock, formatReportedAge } from '../lib/time';
import { DURATION_CAP, DURATION_PER_HOUR, applyDuration, type Duration } from '../data/duration';
import { SCORE_NOTE, factorsFor } from '../mock/data';
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
  const gapNote = row.raw ? slotGapNote(row.raw) : null;
  const setDisposition = useConsole((s) => s.setDisposition);
  const [composing, setComposing] = useState(false);
  /** Which asset list to open, or null for closed. */
  const [assets, setAssets] = useState<'bikes' | 'docks' | null>(null);

  // The footer used to ask only "is this mechanical?", so a healthy station
  // clicked on the map got a full-width black Dispatch Vehicle Here directly
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

  return (
    <>
      {/* Dim-and-dismiss, matching the dispatch composer and method sheet.
          The receipt used to float over a fully live board with no way out
          except the Close button — the one dialog in the app that ignored the
          gesture everybody tries first. */}
      <button
        type="button"
        aria-label="Close station triage"
        onClick={onClose}
        className="fade-in fixed inset-0 z-[38] cursor-default bg-[rgb(43_38_33/34%)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${row.name} — station triage`}
        className="drawer-in hide-scroll fixed inset-y-0 right-0 z-40 flex w-[330px] max-w-full flex-col overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-surface)] shadow-[-2px_0_28px_rgb(43_38_33/18%)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-ink)] outline-none"
          >
            <Icon name="clipboard-list" size={15} className="text-[var(--color-ink-2)]" />
            Station triage
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close station triage"
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

          {/* The whole verdict, first and in one card: the score and where it
              sits on the scale, the instruction that follows from it, and the
              broken hardware a vehicle cannot touch. This used to be three
              stacked blocks — a grey score box, a "no vehicle needed" card, a
              tinted action card — saying one connected thing in three visual
              languages, above the evidence that a coordinator only needs after
              they have the instruction. */}
          {row.breakdown ? (
            <ActionCard row={row} verdict={verdict} />
          ) : (
            <div className="mt-3.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] p-3">
              <div className="flex items-center gap-3">
                <ScoreBadge score={row.score} size="lg" />
                <div className="min-w-0 flex-1">
                  {row.score === null ? (
                    <>
                      <p className="text-[11px] font-medium text-[var(--color-ink-2)]">Not scored</p>
                      <div className="mt-1.5">
                        <Bar value={row.fill} tone={row.fillTone} height={6} />
                      </div>
                    </>
                  ) : (
                    <ScoreBand score={row.score} compact />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Its own section now, not three small numbers riding under the
              score badge — the measured facts get the same weight the score
              itself gets, stated before any of the judgement below them. A
              measured number and a modelled one should not share a size and a
              colour: this is a fixture-free fact about a rack in Brooklyn, and
              94 is an opinion about it. */}
          {row.bikes !== null && (
            <section className="mt-4 border-t border-[var(--color-line)] pt-3.5">
              <p className="eyebrow text-[9px]">What the feed measured</p>
              <dl className="mt-2.5 grid grid-cols-3 gap-2">
                <Reading value={row.bikes} label="bikes to rent" />
                <Reading value={row.openDocks ?? row.docks} label="docks free" />
                <Reading
                  value={row.fill === null ? '—' : `${Math.round(row.fill * 100)}%`}
                  label="full"
                  tone={row.fillTone}
                />
              </dl>
              {row.raw && gapNote && (
                <p className="mt-2.5 text-[10px] leading-relaxed text-[var(--color-ink-3)]">
                  {gapNote}
                </p>
              )}
            </section>
          )}

          {row.breakdown ? (
            <>
              {/* What is physically at the station, above the receipt that
                  scores it — the tangible answer used to arrive last, and only
                  if you scrolled. The instruction that acts on it now leads the
                  drawer, up by the station name. */}
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

        {/* Both actions together, one row: the thing to do and the thing to
            defer, side by side rather than the verdict card carrying one and
            the chrome carrying the other. Escape and the header's × already
            close the drawer, so a third "Close" button here was one button too
            many for what it added. */}
        <div className="sticky bottom-0 flex gap-2 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          {row.action?.kind === 'mechanic' ? (
            <Button variant="outline" icon="wrench" className="flex-1" onClick={onClose}>
              Needs a mechanic
            </Button>
          ) : (
            <Button
              variant={unwanted ? 'outline' : 'dark'}
              icon="vehicle"
              className="flex-1"
              onClick={() => setComposing(true)}
              title={
                verdict === 'unverified'
                  ? 'This station has not reported recently. You would be dispatching on counts nobody can vouch for.'
                  : verdict === 'below'
                    ? 'This station is below the dispatch threshold. The board does not think this trip is worth a run.'
                    : undefined
              }
            >
              {verdict === 'unverified'
                ? 'Dispatch anyway'
                : unwanted
                  ? 'Dispatch anyway'
                  : 'Dispatch vehicle'}
            </Button>
          )}
          <Button
            variant="outline"
            className="shrink-0 px-3.5"
            onClick={() => {
              setDisposition(row.id, row.name, 'snoozed');
              onClose();
            }}
          >
            Snooze
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
  const { fill } = breakdown;

  return (
    <section className="mt-5">
      {/* The heading and the three boxes under it — Bikes, Open docks,
          Reported — are gone. They restated the trio in the masthead, which is
          now labelled "What the feed measured" and sits above the score it
          produced; the age was already the Staleness line on the receipt just
          above this. Saying the same three numbers twice in one panel taught a
          reader that the second telling was not worth reading, which is a bad
          habit to teach on the section that also holds the audit trail.

          The denominator explanation moved the same way. "N of M docks out of
          service, so full is measured against what works" now leads the drawer,
          in "What the feed measured", right where the numbers that don't add up
          are. It used to live down here too, in two more framings off the same
          fields — and a reader who got this far had already been told. What is
          left is the plain reading and the raw dump. */}
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-ink-2)]">
        {fill.bikes} of {raw.usableSlots} working slots hold a bike
        {fill.ratio !== null && <> — {Math.round(fill.ratio * 100)}% full</>}.
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
          because most of it is broken, and only one of those is a vehicle job.
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
 * The line that makes the masthead's numbers add up.
 *
 * A reader sees "84 bikes to rent", "0 docks free", "100% full" and, in the
 * title right above, "97 docks" — and nothing accounts for the 13 that went
 * missing between them. They are docks that are not usable right now: dead, or
 * holding a broken bike that GBFS counts as neither a rentable bike nor an open
 * dock. The fill % is measured against what works (84 slots), never against the
 * nameplate (97), so a full station reads 100% and not 87%.
 *
 * Only the gap itself — capacity minus usable slots — is authoritative; the
 * operator's `capacity` figure drifts, so the parenthetical cause is shown
 * only when the disabled counts account for the whole gap exactly. Returns
 * null when the nameplate and the usable count already agree.
 */
function slotGapNote(raw: NonNullable<StationRow['raw']>): string | null {
  const gap = raw.capacity - raw.usableSlots;
  if (gap <= 0) return null;
  const causes = [
    raw.bikesDisabled > 0 && `${raw.bikesDisabled} holding broken bikes`,
    raw.docksDisabled > 0 && `${raw.docksDisabled} dead`,
  ].filter(Boolean) as string[];
  const why =
    causes.length > 0 && raw.bikesDisabled + raw.docksDisabled === gap
      ? ` (${causes.join(', ')})`
      : '';
  return `${gap} of this station's ${raw.capacity} docks are out of service${why} — the fill % is measured against the ${raw.usableSlots} that still work, not the nameplate.`;
}

/**
 * One measured reading: the number large, the word for it underneath.
 *
 * Ink by default — these are facts, not yet a judgement. `tone` is the one
 * exception, and only for the fill reading: colouring "99% full" repeats what
 * the Status pill and the row's own fill bar already conclude, it does not
 * invent a new one.
 */
function Reading({
  value,
  label,
  tone = 'ink',
}: {
  value: ReactNode;
  label: string;
  tone?: Tone;
}) {
  return (
    <div>
      <dd className="num text-[26px] leading-none font-bold" style={{ color: TONE[tone].fg }}>
        {value}
      </dd>
      <dt className="mt-1.5 text-[10px] leading-tight text-[var(--color-ink-3)]">{label}</dt>
    </div>
  );
}

/**
 * The whole verdict, in one card.
 *
 * It was three stacked blocks that a coordinator had to assemble in their head:
 * a grey box with the score badge and the urgency scale, a separate "no vehicle
 * needed" card, and a tinted card with the instruction and the broken-hardware
 * list. One connected judgement — how urgent, what to do, what a vehicle cannot
 * touch — told in three visual languages, one after another.
 *
 * Now: score and scale at the top, the instruction beside the badge, broken
 * hardware below a hairline. One tone for the card — the station's own fill
 * colour when a vehicle is the answer, grey when the answer is "leave it",
 * near-black when it is a mechanic's job. The `Mechanic` block stays red inside
 * any of them, because that half always goes to a different crew.
 *
 * Below the dispatch line the instruction is "No vehicle needed" and the scale
 * carries the rest; the big red imperative that would contradict it is never
 * built. Broken hardware, which a low score does not excuse, still shows.
 */
function ActionCard({ row, verdict }: { row: StationRow; verdict: VerdictKind | null }) {
  const triage = useConsole((s) => s.triage);
  const status = useMemo(() => statusFromRow(row), [row]);
  const bikes = useMemo(
    () => (status ? applyTriage(bikesAt(status, Date.now()), triage) : []),
    [status, triage],
  );

  const confirmed = useMemo(() => faultTally(bikes, true), [bikes]);
  const unchecked = useMemo(() => awaitingTriage(bikes, triage).length, [bikes, triage]);
  const broken = useMemo(
    () => bikes.filter((b) => b.condition === 'out-of-service'),
    [bikes],
  );

  const dead = broken.length;
  const hasHardware = dead > 0 || unchecked > 0;

  /*
   * Frame numbers while the list is short enough to be worth reading.
   *
   * Naming the machine is what turns this from a statistic into something a
   * mechanic can act on without opening another panel — "#38472 brakes not
   * working" is a job, "2 broken" is a number. Past three it stops helping: a
   * rack with nine dead bikes is a site visit, not a list of frames, and nine
   * five-digit numbers would push the card taller than the reasoning above it.
   */
  const named = dead > 0 && dead <= 3;

  const lane = row.breakdown ? laneOf(row.breakdown) : null;
  const head = headlineFor(row, verdict, lane);

  const ct = TONE[head.tone];
  // `flood-soft` is the palest tone in the palette by design; bold text in it
  // fails contrast on its own tint, so a flood-soft headline borrows the harder
  // blue. The instruction is only tinted when there is an instruction — a
  // "leave it" or "not scored" headline stays plain ink.
  const headFg = head.tone === 'flood-soft' ? TONE.flood.fg : ct.fg;

  // The hardware half — a vehicle cannot touch any of it, so it is always
  // mechanic-red regardless of the card's own tone.
  const hardware = hasHardware && (
    <>
      <p className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-ink)]">
        <span
          className="shrink-0 rounded px-1.5 py-[2px] text-[9px] font-bold tracking-[0.06em] uppercase"
          style={{ backgroundColor: TONE.empty.fg, color: TONE.empty.onFg }}
        >
          Mechanic
        </span>
        {dead > 0
          ? `${dead} broken bike${dead === 1 ? '' : 's'} on the rack`
          : `${unchecked} bike${unchecked === 1 ? '' : 's'} awaiting inspection`}
      </p>
      {dead > 0 && (
        <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--color-ink-2)]">
          {named
            ? broken.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ', '}
                  <span className="num rounded bg-[var(--color-sunken)] px-1 py-px text-[10px]">
                    {b.id}
                  </span>{' '}
                  {BIKE_FAULT_LABEL[b.fault!].toLowerCase()}
                </span>
              ))
            : confirmed.map((f) => phrase(f.count, BIKE_FAULT_LABEL[f.fault])).join(', ')}
          {dead > 0 && unchecked > 0 && (
            <span className="text-[var(--color-ink-3)]"> · {unchecked} more not yet checked</span>
          )}
        </p>
      )}
    </>
  );

  // Stale counts: the drawer's raw numbers are hidden and the badge shows no
  // score, so a hardware list built from the same untrusted feed would be the
  // one place claiming to know something.
  const showHardware = verdict !== 'unverified';

  return (
    <section
      className="mt-4 overflow-hidden rounded-lg border"
      style={{ backgroundColor: ct.bg, borderColor: ct.line, borderLeft: `4px solid ${headFg}` }}
    >
      <div className="px-3.5 py-3">
        <div className="flex items-start gap-3">
          <ScoreBadge score={row.score} size="lg" />
          <div className="min-w-0 flex-1">
            <p
              className="text-[13.5px] leading-tight font-bold"
              style={{ color: head.tinted ? headFg : 'var(--color-ink)' }}
            >
              {head.action}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-ink-2)]">
              {head.reason}
            </p>
          </div>
        </div>

        {row.score !== null && (
          <div className="mt-3">
            <ScoreBand score={row.score} compact />
          </div>
        )}
      </div>

      {showHardware && (
        <div className="border-t px-3.5 py-2.5" style={{ borderColor: ct.line }}>
          {hasHardware ? (
            hardware
          ) : (
            <p className="text-[10.5px] text-[var(--color-ink-3)]">No broken bikes on the rack.</p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The instruction, its one-line reason, and the tone the card takes — one
 * function so the four verdict cases read side by side rather than as scattered
 * branches. `tinted` marks the cases that are a live instruction (drop/collect):
 * those get the fill colour, the rest stay plain ink.
 */
interface Headline {
  action: string;
  reason: string;
  tone: Tone;
  tinted: boolean;
}

function headlineFor(
  row: StationRow,
  verdict: VerdictKind | null,
  lane: ReturnType<typeof laneOf> | null,
): Headline {
  if (verdict === 'unverified') {
    const age = row.breakdown ? formatReportedAge(row.breakdown.staleness.ageMinutes) : 'a while';
    return {
      action: 'Not scored',
      reason: `Silent for ${age}, so its counts cannot be trusted. It would score ${
        row.breakdown?.score ?? '—'
      } if they could — shown for audit only.`,
      tone: 'mute',
      tinted: false,
    };
  }

  if (verdict === 'below') {
    const healthy = lane === 'quiet';
    return {
      action: healthy ? 'Nothing wrong here' : 'No vehicle needed',
      reason: healthy
        ? 'Serving riders on both sides — bikes to rent and docks to return to. Not on the queue; you are seeing it from the map.'
        : 'Drifting but still serving both sides. Sending a vehicle now spends a run that something above the line needs more — the footer still lets you send one.',
      tone: 'mute',
      tinted: false,
    };
  }

  const a = row.action;

  if (a?.kind === 'mechanic') {
    const noSlots = (row.raw?.usableSlots ?? 1) === 0;
    return {
      action: 'Send a mechanic',
      reason: noSlots
        ? 'No usable slots — every dock is dead or holding a broken bike, so a vehicle has nothing to work with.'
        : 'The operator has closed this station — moving bikes will not reopen it.',
      tone: 'ink',
      tinted: false,
    };
  }

  const reason =
    row.status === 'Empty'
      ? 'No bikes to rent — nobody can start a trip here.'
      : row.status === 'Full'
        ? 'No open docks — nobody can end a trip here.'
        : row.status === 'Low'
          ? 'Down to the last few bikes.'
          : row.status === 'Flooded'
            ? 'Down to the last few open docks.'
            : 'Stocked about right.';

  if (!a || a.kind === 'none') {
    return { action: 'Nothing to send', reason, tone: row.fillTone, tinted: false };
  }

  return {
    action: `${a.kind === 'drop' ? 'Drop' : 'Collect'} ${a.bikes} bike${a.bikes === 1 ? '' : 's'}`,
    reason,
    tone: row.fillTone,
    tinted: true,
  };
}

/** "2 × bent wheel" reads as a spec sheet; "2 bent wheels" reads as a sentence. */
function phrase(count: number, label: string): string {
  const lower = label.toLowerCase();
  return count === 1 ? lower : `${count} × ${lower}`;
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
 * This used to read `needsVehicle`, which is not the same question. That flag is
 * false whenever a station is not reporting — however high it scores — so an
 * unverified station rendered "Urgency score 100 / 100" directly above "Below
 * the 55-point threshold. No vehicle needed yet." Two true statements about two
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
        nobody can vouch for. It is shown for audit, not as a claim, and no vehicle will be sent on
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
        <strong className="font-semibold">A vehicle cannot fix this.</strong> The station is
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
/**
 * One bar, one line. Three colour-coded segments used to draw the same scale;
 * this fills a single track to the score itself and marks the one number that
 * actually decides anything — the dispatch line — with a tick, matching how
 * the reference gauge reads it: how far the fill has come, against one mark
 * for where "send a vehicle" begins.
 */
function ScoreBand({ score, compact = false }: { score: number; compact?: boolean }) {
  const tone: Tone =
    score >= CRITICAL_THRESHOLD ? 'empty' : score >= NEEDS_VEHICLE_THRESHOLD ? 'warn' : 'ok';
  const label =
    score >= CRITICAL_THRESHOLD ? 'Critical' : score >= NEEDS_VEHICLE_THRESHOLD ? 'Worth a trip' : 'Drifting';
  const current = score >= CRITICAL_THRESHOLD ? 2 : score >= NEEDS_VEHICLE_THRESHOLD ? 1 : 0;
  const pct = Math.min(100, Math.max(0, score));

  return (
    <section className="mt-3">
      <div className="relative">
        <span
          aria-hidden="true"
          className="block h-[8px] w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--color-line-soft)' }}
        >
          <span
            className="block h-full rounded-full transition-[width]"
            style={{ width: `${pct}%`, backgroundColor: TONE[tone].fg }}
          />
        </span>

        {/* The one number that decides anything: where "send a vehicle" starts. */}
        <span
          aria-hidden="true"
          className="absolute -top-[4px] h-[16px] w-[2px] rounded-full bg-white"
          style={{
            left: `calc(${NEEDS_VEHICLE_THRESHOLD}% - 1px)`,
            boxShadow: '0 0 0 1px var(--color-ink-3)',
          }}
        />
      </div>

      {!compact && (
        <div className="num mt-1.5 flex justify-between text-[9px] text-[var(--color-ink-3)]">
          <span>0</span>
          <span>{NEEDS_VEHICLE_THRESHOLD} · dispatch line</span>
          <span>100</span>
        </div>
      )}

      <p
        className={cn(
          'leading-relaxed text-[var(--color-ink-2)]',
          compact ? 'mt-1.5 text-[10px]' : 'mt-2 text-[10.5px]',
        )}
      >
        <strong className="font-semibold" style={{ color: TONE[tone].fg }}>
          {label}.
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
