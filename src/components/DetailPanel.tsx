import { useEffect, useRef } from 'react';
import {
  CAPACITY_WEIGHT_CAP,
  CAPACITY_WEIGHT_FLOOR,
  CAPACITY_WEIGHT_SPAN,
  CATEGORY_LABEL,
  NEEDS_TRUCK_THRESHOLD,
  STALENESS_GRACE_MINUTES,
  STALENESS_MAX_MINUTES,
  STALENESS_MAX_PENALTY,
} from '../model/score';
import type { ScoredStation } from '../model/summary';
import { laneOf } from '../model/triage';
import type { Track } from '../model/verify';
import { ScorePlate } from './ScorePlate';
import { DockBar } from './DockBar';
import { CategoryTag } from './CategoryTag';
import { FillBand } from './FillBand';
import { Sparkline } from './Sparkline';
import { ReportedAge } from './ReportedAge';
import { formatClock, formatReportedAge } from '../lib/time';
import { cn } from '../lib/cn';

/**
 * The anti-black-box view, as a drawer over the queue rather than a page.
 *
 * Checking a station used to mean navigating away from the list, which broke
 * the only loop that matters: scan, check, scan again. The queue stays on
 * screen and interactive behind this panel, and prev/next walks the filtered
 * order, so a dispatcher can audit the top ten without ever losing their place.
 *
 * Everything rendered here comes straight from the `ScoreBreakdown` that ranked
 * the queue — same object, same numbers, no recomputation.
 */
export function DetailPanel({
  entry,
  index,
  total,
  onPrev,
  onNext,
  onClose,
  history,
}: {
  entry: ScoredStation;
  index: number;
  total: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  history?: Track | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus moves into the panel on open and is trapped while it is there; on
  // close the caller restores focus to the row that opened it.
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

      if (e.key === 'ArrowDown' && onNext) {
        e.preventDefault();
        onNext();
        return;
      }
      if (e.key === 'ArrowUp' && onPrev) {
        e.preventDefault();
        onPrev();
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
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, onNext, onPrev]);

  const { station, breakdown } = entry;
  const { capacity, staleness, fill } = breakdown;
  const lane = laneOf(breakdown);

  return (
    <div
      ref={panelRef}
      className="drawer"
      role="dialog"
      aria-modal="false"
      aria-label={`${station.name} — score detail`}
    >
      {/* Sticky header so prev/next stay reachable while the receipt scrolls. */}
      <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)] px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="num text-[12px] text-[var(--ink-soft)]">
            {index + 1} / {total}
          </span>
          <div className="flex items-center gap-1">
            <StepButton onClick={onPrev} label="Previous station" glyph="↑" />
            <StepButton onClick={onNext} label="Next station" glyph="↓" />
            <button
              type="button"
              onClick={onClose}
              className="ml-1 border border-[var(--line)] px-2.5 py-1 text-[13px] text-[var(--ink-soft)] hover:border-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              Close
              <span className="num ml-1.5 text-[11px] opacity-70">esc</span>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <ScorePlate
            score={breakdown.score}
            category={breakdown.category}
            size="md"
            variant={lane === 'unverified' ? 'outline' : 'fill'}
          />
          <div className="min-w-0 flex-1">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="display text-[19px] leading-tight text-[var(--ink)] outline-none"
            >
              {station.name}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--ink-soft)]">
              <span>{station.borough}</span>
              <Dot />
              <span className="num">{station.capacity} docks</span>
              <Dot />
              <CategoryTag category={breakdown.category} />
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 pb-8">
        <p className="text-[14px] leading-snug text-[var(--ink)]">
          {lane === 'unverified' ? (
            <>
              Scores {breakdown.score}, but its counts are too old to act on — it is{' '}
              <strong className="font-semibold">excluded from the truck count</strong> and shown
              under Unverified.
            </>
          ) : lane === 'mechanic' ? (
            <>
              Scores {breakdown.score}, but the failure is mechanical.{' '}
              <strong className="font-semibold">A truck cannot fix this</strong> — it is routed to
              the mechanic list.
            </>
          ) : breakdown.needsTruck ? (
            <>
              Scores {breakdown.score}, at or above the {NEEDS_TRUCK_THRESHOLD}-point threshold —{' '}
              <strong className="font-semibold">this station needs a truck.</strong>
            </>
          ) : breakdown.scored ? (
            <>
              Scores {breakdown.score}, below the {NEEDS_TRUCK_THRESHOLD}-point threshold. No truck
              needed yet.
            </>
          ) : (
            <>This station is not installed, so it is excluded from the ranking entirely.</>
          )}
        </p>

        {history && <HistoryBlock history={history} />}

        <h3 className="eyebrow mt-7">
          {history ? 'Receipt for the latest reading' : 'How this score was calculated'}
        </h3>

        <dl className="mt-3">
          <LineItem
            label="Base"
            sub={CATEGORY_LABEL[breakdown.category]}
            explanation={breakdown.baseRule}
            math={`${fill.bikes} bikes / ${fill.usableSlots} usable slots${
              fill.ratio === null ? '' : ` = ${Math.round(fill.ratio * 100)}% full`
            }`}
            value={breakdown.base}
            signed={false}
          />

          <LineItem
            label="Capacity weight"
            sub={`x${capacity.weight.toFixed(2)}${capacity.capped ? ' (capped)' : ''}`}
            explanation={
              capacity.contribution >= 0
                ? 'Bigger stations strand more riders when they fail, so severity scales with how many people the station serves.'
                : 'A smaller-than-typical station, so the same failure strands fewer riders and is scaled down.'
            }
            math={`${CAPACITY_WEIGHT_FLOOR} + ${CAPACITY_WEIGHT_SPAN} x (${capacity.capacity} / ${
              capacity.p90Capacity
            }) = ${(
              CAPACITY_WEIGHT_FLOOR +
              CAPACITY_WEIGHT_SPAN * (capacity.capacity / capacity.p90Capacity)
            ).toFixed(2)}${
              capacity.capped ? `, capped at ${CAPACITY_WEIGHT_CAP}` : ''
            } · ${breakdown.base} x ${capacity.weight.toFixed(2)} = ${breakdown.weighted}`}
            value={capacity.contribution}
            signed
          />

          <LineItem
            label="Staleness"
            sub={staleness.ageMinutes === null ? 'never reported' : `${staleness.ageMinutes} min old`}
            explanation={
              staleness.reason === 'current'
                ? `Reported within the ${STALENESS_GRACE_MINUTES}-minute grace window, so the counts are taken at face value.`
                : staleness.reason === 'never-reported'
                  ? 'The feed carries no usable timestamp for this station, so its counts cannot be vouched for at all.'
                  : 'Staleness adds uncertainty, not severity: a station we cannot see might be fine, but it is worth a look.'
            }
            math={
              staleness.reason === 'current'
                ? 'no penalty inside the grace window'
                : staleness.reason === 'never-reported'
                  ? `full uncertainty = +${STALENESS_MAX_PENALTY}`
                  : `${STALENESS_MAX_PENALTY} x (${staleness.ageMinutes} - ${STALENESS_GRACE_MINUTES}) / (${STALENESS_MAX_MINUTES} - ${STALENESS_GRACE_MINUTES}) = ${staleness.penalty}`
            }
            value={staleness.penalty}
            signed
          />

          <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-[var(--ink)] pt-3.5">
            <dt className="display text-[15px] text-[var(--ink)]">Urgency score</dt>
            <dd className="num text-[24px] leading-none font-bold tabular-nums text-[var(--ink)]">
              {breakdown.score}
            </dd>
          </div>
          <p className="mt-1.5 text-right text-[11px] text-[var(--ink-soft)]">
            {breakdown.weighted} + {staleness.penalty}, rounded and clamped to 0&ndash;100
          </p>
        </dl>

        {lane === 'unverified' && (
          <p className="mt-5 border-l-2 border-[var(--line)] py-2 pl-3 text-[13px] text-[var(--ink)]">
            {staleness.ageMinutes === null
              ? 'This station has never reported a timestamp, so there is no moment at which these counts were known to be true.'
              : `Last reported ${formatReportedAge(staleness.ageMinutes)}, past the ${STALENESS_MAX_MINUTES}-minute cutoff.`}{' '}
            The score above is arithmetic on numbers we cannot vouch for — it is shown for audit,
            not as a claim.
          </p>
        )}

        <h3 className="eyebrow mt-7">Where it sits right now</h3>
        <div className="mt-3 border border-[var(--line)] p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[13px] text-[var(--ink-soft)]">Bikes / open docks</span>
            <span className="num text-[16px] tabular-nums text-[var(--ink)]">
              {fill.bikes}
              <span className="text-[var(--ink-soft)]"> / {fill.docks}</span>
            </span>
          </div>
          <div className="mt-3">
            <DockBar
              bikes={fill.bikes}
              docks={fill.docks}
              signal={breakdown.signal}
              emphasize={breakdown.category !== 'healthy'}
            />
          </div>
          <div className="mt-5">
            <FillBand ratio={fill.ratio} signal={breakdown.signal} />
          </div>
          <p className="mt-3 text-[12px] leading-snug text-[var(--ink-soft)]">
            {fill.usableSlots === 0
              ? `This station reports no usable slots at all — its ${station.capacity}-dock nameplate is currently serving nobody.`
              : `Fill is measured against the ${fill.usableSlots} slots this station actually reports, not its ${station.capacity}-dock nameplate.`}
          </p>
        </div>

        <dl className="mt-5 text-[12px]">
          <Meta term="Reported">
            <ReportedAge ageMinutes={staleness.ageMinutes} className="text-[12px]" />
          </Meta>
          <Meta term="Operator flags">
            {station.status.isRenting ? 'renting' : 'NOT renting'} ·{' '}
            {station.status.isReturning ? 'returning' : 'NOT returning'} ·{' '}
            {station.status.isInstalled ? 'installed' : 'NOT installed'}
          </Meta>
          <Meta term="Disabled">
            <span className="num">
              {station.status.bikesDisabled} bikes · {station.status.docksDisabled} docks
            </span>
          </Meta>
          <Meta term="E-bikes">
            <span className="num">{station.status.ebikesAvailable}</span>
          </Meta>
          <Meta term="Station id">
            <span className="num break-all">{station.stationId}</span>
          </Meta>
        </dl>
      </div>
    </div>
  );
}

function HistoryBlock({ history }: { history: Track }) {
  const span = history.lastSeen - history.firstSeen;
  const minutes = Math.max(1, Math.round(span / 60_000));

  return (
    <section className="mt-6 border border-[var(--line)] p-4">
      <h3 className="eyebrow">This session&rsquo;s readings</h3>
      <div className="mt-3">
        <Sparkline
          points={history.scores}
          signal={history.signal}
          width={370}
          height={64}
          startLabel={formatClock(history.firstSeen)}
          endLabel={formatClock(history.lastSeen)}
        />
      </div>
      <p className="num mt-2 text-[11px] text-[var(--ink-soft)]">
        {minutes}m span · {history.readings.length} reading
        {history.readings.length === 1 ? '' : 's'}
      </p>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr>
            {['Time', 'Score', 'Failure', 'Bikes/docks'].map((h) => (
              <th key={h} className="eyebrow border-b border-[var(--line)] pb-1.5 text-left last:text-right">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...history.readings].reverse().map((r) => (
            <tr key={r.t} className="border-b border-[var(--line)] last:border-b-0">
              <td className="num py-1.5 text-[12px] text-[var(--ink-soft)]">{formatClock(r.t)}</td>
              <td className="num py-1.5 text-[12px] font-semibold text-[var(--ink)]">{r.score}</td>
              <td className="py-1.5">
                <CategoryTag category={r.category} className="text-[12px]" />
              </td>
              <td className="num py-1.5 text-right text-[12px] text-[var(--ink)]">
                {r.bikes === null ? '—' : `${r.bikes}/${r.docks}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StepButton({
  onClick,
  label,
  glyph,
}: {
  onClick: (() => void) | null;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick ?? undefined}
      disabled={!onClick}
      aria-label={label}
      className={cn(
        'num border border-[var(--line)] px-2.5 py-1 text-[13px]',
        onClick
          ? 'text-[var(--ink-soft)] hover:border-[var(--ink-soft)] hover:text-[var(--ink)]'
          : 'cursor-default text-[var(--line)]',
      )}
    >
      {glyph}
    </button>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-[var(--line)]">
      ·
    </span>
  );
}

/**
 * One line of the receipt: what the rule is, what went into it, and what it
 * contributed. Archivo for every explanation, Plex Mono for every number.
 */
function LineItem({
  label,
  sub,
  explanation,
  math,
  value,
  signed,
}: {
  label: string;
  sub: string;
  explanation: string;
  math: string;
  value: number;
  signed: boolean;
}) {
  const isZero = value === 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-[var(--line)] py-3">
      <dt className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[14px] font-semibold text-[var(--ink)]">{label}</span>
          <span className="num text-[11px] text-[var(--ink-soft)]">{sub}</span>
        </span>
        <span className="mt-1 block text-[12px] leading-snug text-[var(--ink-soft)]">
          {explanation}
        </span>
      </dt>
      <dd
        className={cn(
          'num self-start text-right text-[16px] tabular-nums',
          isZero ? 'text-[var(--ink-soft)]' : 'font-semibold text-[var(--ink)]',
        )}
      >
        {signed && value > 0 ? '+' : ''}
        {value}
      </dd>
      <dd className="num col-span-2 mt-1.5 text-[11px] leading-relaxed text-[var(--ink-soft)]">
        {math}
      </dd>
    </div>
  );
}

function Meta({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--line)] py-1.5">
      <dt className="text-[var(--ink-soft)]">{term}</dt>
      <dd className="text-right text-[var(--ink)]">{children}</dd>
    </div>
  );
}
