import type { ReactNode } from 'react';
import { ScoreBadge } from './primitives';
import { TipAction, TipBody, TipTitle, Tooltip } from './Tooltip';
import { TONE } from './tone';
import { CAPACITY_WEIGHT_CAP, type ScoreBreakdown } from '../model/score';
import { laneOf } from '../model/triage';
import { formatAgo, formatReportedAge } from '../lib/time';
import { applyDuration, type Duration } from '../data/duration';
import { VERDICT_LINE, VERDICT_TONE, verdictFor } from '../data/verdict';

/**
 * The score, with its reasoning one hover away.
 *
 * Opening a drawer to learn why a number is 88 is a fair price once. It is not
 * a fair price on the fourth row of a thousand, which is where a dispatcher
 * actually lives — so the arithmetic gets a hover layer and the drawer keeps
 * the click.
 *
 * The badge is the trigger for both. Wrapping a larger cell would mean the
 * tooltip fires while you are aiming past it, and the two layers would stop
 * describing the same thing.
 */

export function ScorePeek({
  breakdown,
  duration,
  size = 'md',
  onOpen,
  openLabel = 'Opens the score breakdown',
}: {
  breakdown: ScoreBreakdown | undefined;
  /** Must match what the row was ranked by, or the badge contradicts the order. */
  duration?: Duration | null;
  size?: 'sm' | 'md' | 'lg';
  /** Omit entirely when there is nowhere to go — see the note below. */
  onOpen?: () => void;
  openLabel?: string;
}) {
  // Fixture rows carry no breakdown. Rather than invent one, show the plain
  // badge: an affordance that leads nowhere is worse than no affordance.
  if (!breakdown) {
    return <ScoreBadge score={null} size={size} />;
  }

  const lane = laneOf(breakdown);
  const { capacity, staleness } = breakdown;

  // The badge has to show the number the queue sorted on. Rendering the raw
  // breakdown score here put a station at the top of the board wearing a lower
  // number than the row beneath it.
  const adjusted = applyDuration(breakdown, duration ?? undefined);
  const durationPts = duration?.confident ? duration.points : 0;
  const score = lane === 'unverified' || !breakdown.needsVehicle ? breakdown.score : adjusted.score;
  const verdict = verdictFor(breakdown, score);

  const badge = <ScoreBadge score={lane === 'unverified' ? null : score} size={size} />;

  const content = (
    <>
      <TipTitle>{lane === 'unverified' ? 'Not scored' : `Urgency ${score} of 100`}</TipTitle>

      {lane === 'unverified' ? (
        <TipBody>
          Silent for {formatReportedAge(staleness.ageMinutes)}, so its counts cannot be trusted.
          It would score {breakdown.score} if they could — shown for audit only.
        </TipBody>
      ) : (
        <>
          <dl className="mt-2 flex flex-col gap-1">
            <PeekLine label={breakdown.baseRule} value={breakdown.base} />
            <PeekLine
              label={`Capacity weight ×${capacity.weight.toFixed(2)}${capacity.capped ? ` (capped at ${CAPACITY_WEIGHT_CAP})` : ''}`}
              value={capacity.contribution}
              signed
            />
            <PeekLine
              label={
                staleness.reason === 'current'
                  ? 'Reading is fresh — no penalty'
                  : `Reading is ${formatReportedAge(staleness.ageMinutes)} old`
              }
              value={staleness.penalty}
              signed
            />
            {durationPts > 0 && duration && (
              <PeekLine
                label={`Failing for ${formatAgo(duration.minutes * 60_000)}`}
                value={durationPts}
                signed
              />
            )}
          </dl>

          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[var(--color-line-soft)] pt-1.5">
            <span className="text-[10px] text-[var(--color-ink-2)]">Total</span>
            <span className="num text-[11px] font-semibold text-[var(--color-ink)]">
              {score} / 100
            </span>
          </div>

          {/* Classified by the same function the drawer uses, so the eight-word
              version and the paragraph version cannot reach opposite verdicts
              about one station. */}
          <p
            className="mt-1.5 text-[10px] leading-snug"
            style={{ color: TONE[VERDICT_TONE[verdict]].fg }}
          >
            {VERDICT_LINE[verdict]}
          </p>
        </>
      )}

      {onOpen && <TipAction>{openLabel}</TipAction>}
    </>
  );

  // Hover-only when there is no click behaviour, so the cursor never promises
  // something that will not happen.
  if (!onOpen) {
    return (
      <Tooltip help content={content} width={280}>
        {badge}
      </Tooltip>
    );
  }

  return (
    <Tooltip content={content} width={280}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        aria-label={`Urgency ${score}. ${openLabel}.`}
        className="inline-flex cursor-pointer"
      >
        {badge}
      </button>
    </Tooltip>
  );
}

function PeekLine({
  label,
  value,
  signed = false,
}: {
  label: ReactNode;
  value: number;
  signed?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-[10px] leading-snug text-[var(--color-ink-2)]">{label}</dt>
      <dd
        className={`num shrink-0 text-[10px] ${value === 0 ? 'text-[var(--color-ink-3)]' : 'font-semibold text-[var(--color-ink)]'}`}
      >
        {signed && value > 0 ? '+' : ''}
        {value}
      </dd>
    </div>
  );
}
