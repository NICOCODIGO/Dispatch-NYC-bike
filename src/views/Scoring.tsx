import { useMemo, useState } from 'react';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Card } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { ConstantsTable } from './ConstantsTable';
import { PROVENANCE_LABEL, SCORING_CONSTANTS } from '../content/constants';
import { NEEDS_VEHICLE_THRESHOLD } from '../model/score';
import { rebalanceDemand } from '../data/insights';
import { useDispatch } from '../store/useDispatch';
import { VEHICLES } from '../mock/data';

/**
 * How the score is built, and how much of it is a judgement call.
 *
 * This was a modal, opened from a small underlined link under the table. It was
 * the wrong container twice over: a modal is for one decision and this is
 * several screens of reference, and a reader who wants to link to it, scroll it
 * or come back to it could do none of those. It is a page with a URL now.
 *
 * ## Reading order
 *
 * It used to open with fifteen constants and end, four screens down, with the
 * two things actually worth knowing. Those now lead:
 *
 * 1. **Capacity, not the threshold, is the constraint.** The queue is longer
 *    than the fleet can reach at any line you could plausibly draw, so arguing
 *    about where the line goes changes the number you report and not the work
 *    that gets done. It is the one genuinely operational insight on the page.
 * 2. **Several constants are guesses**, and here is what would turn each into a
 *    measurement. Saying so first is what makes the rest of the page credible.
 *
 * The threshold slider stayed, because being shown that 55 → 60 takes 722
 * stations to 604 is the difference between an opinion and a decision. The
 * paragraph next to it explaining which source file to edit did not: that was a
 * note to the person who wrote it, on a surface for the person using it.
 */

/**
 * Bounds for the preview slider, clamped to where moving it changes something.
 * Above the worst live score the queue empties; below the lane floor nothing is
 * excluded to begin with. Both end-stops explain themselves in the UI, because
 * an unexplained one reads as a bug.
 */
const SLIDER_MIN = 40;
const SLIDER_MAX = 85;

export function Scoring() {
  const lanes = useDispatch((s) => s.lanes);
  const [threshold, setThreshold] = useState(NEEDS_VEHICLE_THRESHOLD);

  const lane = lanes.vehicle;
  const demand = useMemo(() => rebalanceDemand(lane), [lane]);

  const scores = useMemo(() => lane.map((s) => s.breakdown.score), [lane]);
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const atCurrent = scores.filter((v) => v >= NEEDS_VEHICLE_THRESHOLD).length;
  const atProposed = scores.filter((v) => v >= threshold).length;
  const changed = threshold !== NEEDS_VEHICLE_THRESHOLD;

  const activeCapacity = VEHICLES.filter((v) => v.state !== 'idle').reduce(
    (sum, v) => sum + v.capacity,
    0,
  );
  const runs = activeCapacity > 0 ? Math.ceil(demand.relocatable / activeCapacity) : 0;

  const guesses = SCORING_CONSTANTS.filter((c) => c.provenance === 'guess');

  return (
    <>
      <PageHeader
        title="Scoring"
        subtitle="How a station gets its 0–100, and which of the numbers behind it are judgements rather than measurements."
      />

      <PageBody>
        {/* Lead. Both of these used to be buried — one inside a slider caption,
            the other four screens down. */}
        <div className="grid gap-3 xl:grid-cols-2">
          <Card className="p-4">
            <h2 className="text-[13px] leading-snug font-semibold text-[var(--color-ink)]">
              The line is not what limits you — capacity is.
            </h2>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
              At {NEEDS_VEHICLE_THRESHOLD},{' '}
              <strong className="font-semibold text-[var(--color-ink)]">
                {atCurrent.toLocaleString('en-US')} stations
              </strong>{' '}
              qualify, and clearing them means moving{' '}
              {demand.relocatable.toLocaleString('en-US')} bikes —{' '}
              <strong className="font-semibold text-[var(--color-ink)]">
                <span className="num">{runs}</span> full runs
              </strong>{' '}
              for the {activeCapacity} bikes of active vehicle capacity. A shift does not contain{' '}
              {runs} runs.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
              Anywhere between {NEEDS_VEHICLE_THRESHOLD} and 80 the queue is longer than the fleet
              can reach either way, so moving the line changes the number you report, not the work
              that gets done. Past about 80 it finally binds — and that is the only range where the
              threshold is a decision rather than a headline.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] leading-snug font-semibold text-[var(--color-ink)]">
              {guesses.length} of these constants are guesses.
            </h2>
            <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
              Every number the score is built from carries a label saying how much it is worth
              trusting. A <ProvWord kind="measured" /> came from the feed, a{' '}
              <ProvWord kind="reasoned" /> follows from something that did, and a{' '}
              <ProvWord kind="guess" /> is a judgement nobody has tested yet.
            </p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {guesses.map((g) => (
                <li key={g.key} className="flex gap-2 text-[11px] leading-snug">
                  <span className="num shrink-0 font-semibold text-[var(--color-ink)]">
                    {g.value}
                  </span>
                  <span className="text-[var(--color-ink-2)]">{g.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--color-ink-3)]">
              Turning any of them into a measurement needs the same thing: recovery data over weeks,
              matching what the board predicted against what actually happened after a vehicle went.
            </p>
          </Card>
        </div>

        {/* The interactive part, kept because it converts an opinion about the
            threshold into a number. */}
        <Card className="mt-3 p-4">
          <h2 className="eyebrow text-[10px]">Move the dispatch threshold</h2>
          <p className="num mt-1.5 text-[22px] leading-none font-semibold text-[var(--color-ink)]">
            {threshold}
          </p>
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            aria-label="Preview a different dispatch threshold"
            className="mt-2.5 w-full max-w-[520px] cursor-pointer accent-[var(--color-ink)]"
          />

          <p className="mt-2 max-w-[70ch] text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
            {changed ? (
              <>
                Threshold {NEEDS_VEHICLE_THRESHOLD} → {threshold}:{' '}
                <strong className="font-semibold text-[var(--color-ink)]">
                  {atCurrent.toLocaleString('en-US')} stations needing a vehicle becomes{' '}
                  {atProposed.toLocaleString('en-US')}
                </strong>
                {atProposed < atCurrent
                  ? ` — ${(atCurrent - atProposed).toLocaleString('en-US')} fewer, but every one dropped is a station you have decided to let ride.`
                  : ` — ${(atProposed - atCurrent).toLocaleString('en-US')} more work than the fleet is currently sized for.`}
              </>
            ) : (
              <>
                {atCurrent.toLocaleString('en-US')} stations currently sit at or above{' '}
                {NEEDS_VEHICLE_THRESHOLD}. Drag to see what a different line would cost.
              </>
            )}
          </p>

          {/* An unexplained end-stop reads as a bug; both of these are facts
              about the data rather than policy. */}
          {threshold >= SLIDER_MAX && (
            <p className="mt-2 text-[10px] text-[var(--color-ink-3)] italic">
              Stops at {SLIDER_MAX}. The worst station in the network right now scores{' '}
              <span className="num">{maxScore}</span>, so a line above this empties the queue
              entirely — a ceiling in the model, not a policy you could adopt.
            </p>
          )}
          {threshold <= SLIDER_MIN && (
            <p className="mt-2 text-[10px] text-[var(--color-ink-3)] italic">
              Stops at {SLIDER_MIN}. Every station in the vehicle lane already scores above this, so
              lowering the line further adds nobody.
            </p>
          )}

          <p
            className="mt-2.5 border-t pt-2.5 text-[10.5px] text-[var(--color-ink-3)]"
            style={{ borderColor: TONE.mute.line }}
          >
            Preview only. The board ranks on {NEEDS_VEHICLE_THRESHOLD}.
          </p>
        </Card>

        <Card className="mt-3 px-1 py-2">
          <ConstantsTable />
        </Card>

        {/* The provenance inventory — which fields are feed, derived, simulated
            or fixture — used to be a section here. In the app it reads as an
            apology for the parts that are modelled; in the repo it reads as
            knowing exactly where the real data stopped. It is in the README,
            and this is the way to it. The Simulated pills stay on the screens
            themselves, because those mark provenance on the thing itself. */}
        <p className="mt-3 text-[11px] text-[var(--color-ink-3)]">
          <a
            href="https://github.com/NICOCODIGO/Dispatch-NYC-bike#whats-real"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--color-ink-2)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
          >
            What&rsquo;s real in this demo →
          </a>{' '}
          — which fields come from the live feed and which are modelled.
        </p>
      </PageBody>
    </>
  );
}

/** The badge words, inline in a sentence, in their own colours. */
function ProvWord({ kind }: { kind: 'measured' | 'reasoned' | 'guess' }) {
  const tone = kind === 'measured' ? TONE.ok : kind === 'reasoned' ? TONE.flood : TONE.warn;
  return (
    <strong className="font-semibold" style={{ color: tone.fg }}>
      {PROVENANCE_LABEL[kind]}
    </strong>
  );
}
