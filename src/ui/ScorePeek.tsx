import { ScoreBadge } from './primitives';
import { TipAction, TipBody, TipTitle, Tooltip } from './Tooltip';
import { TONE, type Tone } from './tone';
import { type ScoreBreakdown, type Signal } from '../model/score';
import { laneOf } from '../model/triage';
import { formatReportedAge } from '../lib/time';
import { applyDuration, type Duration } from '../data/duration';
import { VERDICT_LINE, VERDICT_TONE, verdictFor } from '../data/verdict';

/** Operator-reported hardware faults at the station — passed in, not in the
 *  breakdown, because they shrink the fill denominator rather than scoring
 *  directly. Optional: a caller without the counts omits the Signals block. */
export interface PeekSignals {
  broken: number;
  dead: number;
}

const SIGNAL_TONE: Record<Signal, Tone> = {
  empty: 'empty',
  full: 'flood',
  outage: 'ink',
  ok: 'ok',
};

/** The one-line "why", warm for empty-side, cool for full-side. */
function supplyPhrase(b: ScoreBreakdown): string {
  const pct = b.fill.ratio === null ? null : Math.round(b.fill.ratio * 100);
  switch (b.category) {
    case 'empty':
      return 'Empty — no bikes anyone can rent';
    case 'full':
      return 'Full — no docks anyone can return to';
    case 'starving':
      return pct === null ? 'Almost out of bikes' : `Almost out of bikes — ${pct}% full`;
    case 'flooded':
      return pct === null ? 'Almost out of docks' : `Almost out of docks — ${pct}% full`;
    case 'outage':
      return 'Outage — the operator has closed one direction';
    case 'unusable':
      return 'A brick — not renting and not returning';
    case 'healthy':
      return pct === null ? 'Roughly balanced' : `Roughly balanced — ${pct}% full`;
    default:
      return '';
  }
}

/**
 * The score, with the quick read one hover away.
 *
 * Opening a drawer to learn why a number is 88 is a fair price once. It is not
 * a fair price on the fourth row of a thousand — so the hover carries the parts
 * a dispatcher scans for (which way it failed, what hardware is down, whether
 * to go now) and the click opens the full derivation.
 *
 * The badge is the trigger for both. Wrapping a larger cell would mean the
 * tooltip fires while you are aiming past it, and the two layers would stop
 * describing the same thing.
 */
export function ScorePeek({
  breakdown,
  duration,
  signals,
  size = 'md',
  onOpen,
  openLabel = 'Opens the full score breakdown',
}: {
  breakdown: ScoreBreakdown | undefined;
  /** Must match what the row was ranked by, or the badge contradicts the order. */
  duration?: Duration | null;
  /** Operator-reported broken hardware — shows as the Signals block. */
  signals?: PeekSignals;
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
  const { staleness } = breakdown;

  // The badge has to show the number the queue sorted on. Rendering the raw
  // breakdown score here put a station at the top of the board wearing a lower
  // number than the row beneath it.
  const adjusted = applyDuration(breakdown, duration ?? undefined);
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
          {/* Which way it failed. The full arithmetic that turns this into a
              number lives behind the click — a dispatcher scanning the column
              needs the direction and the verdict, not the derivation. */}
          <p
            className="mt-1 text-[11px] leading-snug font-semibold"
            style={{ color: TONE[SIGNAL_TONE[breakdown.signal]].fg }}
          >
            {supplyPhrase(breakdown)}
          </p>

          {/* The Signals column, moved into the hover: broken hardware is a
              mechanic's problem, not a scoring input, so it reads better beside
              the "why" than in a column of its own. */}
          {signals && (
            <div className="mt-2 border-t border-[var(--color-line-soft)] pt-2">
              <p className="eyebrow text-[9px]">Signals</p>
              {signals.broken > 0 || signals.dead > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {signals.broken > 0 && (
                    <PeekChip label={`${signals.broken} broken`} tone="mute" />
                  )}
                  {signals.dead > 0 && <PeekChip label={`${signals.dead} dead`} tone="empty" />}
                  <span className="text-[9.5px] text-[var(--color-ink-3)]">operator-reported</span>
                </div>
              ) : (
                <p className="mt-1 text-[10px] text-[var(--color-ink-3)]">
                  No broken bikes or dead docks reported.
                </p>
              )}
            </div>
          )}

          {/* Classified by the same function the drawer uses, so the eight-word
              version and the paragraph version cannot reach opposite verdicts
              about one station. */}
          <p
            className="mt-2 border-t border-[var(--color-line-soft)] pt-2 text-[10px] leading-snug"
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

/** A small bordered count chip, matching the Signals column's own pills. */
function PeekChip({ label, tone }: { label: string; tone: Tone }) {
  const t = TONE[tone];
  return (
    <span
      className="num whitespace-nowrap rounded border px-1.5 py-px text-[9.5px] font-medium"
      style={{ color: t.fg, backgroundColor: t.bg, borderColor: t.line }}
    >
      {label}
    </span>
  );
}
