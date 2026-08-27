import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/primitives';
import { ProvenancePill } from '../ui/ProvenancePill';
import { TONE } from '../ui/tone';
import { CONSTANT_GROUPS, SCORING_CONSTANTS } from '../content/constants';
import { NEEDS_TRUCK_THRESHOLD } from '../model/score';
import { useDispatch } from '../store/useDispatch';
import { rebalanceDemand } from '../data/insights';
import { TRUCKS } from '../mock/data';

/**
 * Every constant the score is built from, and what moving one would do.
 *
 * The receipt already shows the arithmetic; this shows the *assumptions*. Most
 * of these numbers are judgements rather than measurements, and presenting
 * them as givens is how a scoring model quietly becomes unfalsifiable — the
 * board says 88, you disagree, and there is nowhere to take the argument.
 *
 * The consequence preview matters more than the editability. Being told that
 * moving the threshold from 55 to 60 takes 722 stations down to 604 is the
 * difference between an opinion and a decision.
 */


/**
 * Bounds for the preview slider, clamped to where moving it actually changes
 * something. See `maxScore` in the component for why 100 and 30 were dead ends.
 */
const SLIDER_MIN = 40;
const SLIDER_MAX = 85;

export function MethodSheet({ onClose }: { onClose: () => void }) {
  const scored = useDispatch((s) => s.scored);
  const lane = useDispatch((s) => s.lanes.truck);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Local only. Editing here previews a consequence; it does not rewrite the
  // model, because the scorer is a pure module the worker also imports and a
  // console session must not be able to fork it.
  const [threshold, setThreshold] = useState(NEEDS_TRUCK_THRESHOLD);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** How many stations the board would call urgent at each threshold. */
  const atCurrent = useMemo(
    () =>
      scored.filter(
        (s) =>
          s.breakdown.scored &&
          !s.breakdown.staleness.notReporting &&
          s.breakdown.signal !== 'outage' &&
          s.breakdown.score >= NEEDS_TRUCK_THRESHOLD,
      ).length,
    [scored],
  );

  const atProposed = useMemo(
    () =>
      scored.filter(
        (s) =>
          s.breakdown.scored &&
          !s.breakdown.staleness.notReporting &&
          s.breakdown.signal !== 'outage' &&
          s.breakdown.score >= threshold,
      ).length,
    [scored, threshold],
  );

  const changed = threshold !== NEEDS_TRUCK_THRESHOLD;

  /**
   * What the fleet can actually absorb.
   *
   * Computed exactly as Fleet Operations computes it — same demand function,
   * same capacity sum — because the point of putting it here is that the two
   * screens agree. A threshold preview that implied a different fleet than the
   * fleet page would be worse than no preview.
   */
  const demand = useMemo(() => rebalanceDemand(lane), [lane]);
  const activeCapacity = TRUCKS.filter((t) => t.state !== 'idle').reduce(
    (sum, t) => sum + t.capacity,
    0,
  );
  const runs = activeCapacity > 0 ? Math.ceil(demand.relocatable / activeCapacity) : 0;

  /**
   * The top of the slider's useful range.
   *
   * The capacity weight caps the model, so nothing actually reaches 100 — the
   * worst station in the network today scores 88. A slider that ran to 100
   * therefore spent its last two stops showing "0 stations", which reads as a
   * broken control rather than as a fact about the model. The floor is the same
   * problem mirrored: every station in the truck lane already clears 40, so
   * every position below it showed an identical number.
   */
  const maxScore = useMemo(
    () => lane.reduce((hi, s) => Math.max(hi, s.breakdown.score), 0),
    [lane],
  );

  return (
    <div className="fixed inset-0 z-[75] flex justify-end">
      <button
        type="button"
        aria-label="Close scoring method"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgb(43_38_33/34%)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Scoring method and assumptions"
        className="drawer-in hide-scroll relative flex w-[520px] max-w-full flex-col overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-surface)]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          <div>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-[13px] font-semibold text-[var(--color-ink)] outline-none"
            >
              Scoring method &amp; assumptions
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-2)]">
              Every constant behind the score, where it came from, and what moving it does.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="px-4 py-3.5">
          {/* The threshold gets its own block: it is the only constant whose
              effect a coordinator can feel immediately, and the one most worth
              arguing about. */}
          <section
            className="rounded-lg border p-3"
            style={{
              borderColor: changed ? TONE.warn.line : TONE.flood.line,
              backgroundColor: changed ? TONE.warn.bg : TONE.flood.bg,
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[12px] font-semibold text-[var(--color-ink)]">
                Dispatch threshold
              </h3>
              {/* The label carries the state permanently, not only once you have
                  moved something. The old copy said "preview only" in a line
                  that rendered when `changed` — so the reader who had not yet
                  dragged saw a live-looking number with no caveat, and the
                  reader who had was being told after the fact. */}
              <span className="flex items-baseline gap-2">
                <span
                  className="eyebrow"
                  style={{ color: changed ? TONE.warn.fg : 'var(--color-ink-3)' }}
                >
                  Preview
                </span>
                <span className="num text-[16px] font-semibold text-[var(--color-ink)]">
                  {threshold}
                </span>
              </span>
            </div>

            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={5}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              aria-label="Preview a different dispatch threshold"
              className="mt-2.5 w-full cursor-pointer accent-[var(--color-ink)]"
            />

            <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-ink-2)]">
              {changed ? (
                <>
                  Threshold {NEEDS_TRUCK_THRESHOLD} → {threshold}:{' '}
                  <strong className="font-semibold text-[var(--color-ink)]">
                    {atCurrent.toLocaleString('en-US')} stations needing a truck becomes{' '}
                    {atProposed.toLocaleString('en-US')}
                  </strong>
                  {atProposed < atCurrent
                    ? ` — ${(atCurrent - atProposed).toLocaleString('en-US')} fewer, but every one dropped is a station you have decided to let ride.`
                    : ` — ${(atProposed - atCurrent).toLocaleString('en-US')} more work than the fleet is currently sized for.`}
                </>
              ) : (
                <>
                  {atCurrent.toLocaleString('en-US')} stations currently sit at or above{' '}
                  {NEEDS_TRUCK_THRESHOLD}. Drag to see what a different line would cost.
                </>
              )}
            </p>

            {/* Why the slider stops where it does. An unexplained end-stop reads
                as a bug; both of these are facts about the data, not policy. */}
            {threshold >= SLIDER_MAX && (
              <p className="mt-2 text-[10px] text-[var(--color-ink-3)] italic">
                Stops at {SLIDER_MAX}. The worst station in the network right now scores{' '}
                <span className="num">{maxScore}</span>, so a line above this empties the queue
                entirely — that is a ceiling in the model, not a policy you could adopt.
              </p>
            )}
            {threshold <= SLIDER_MIN && (
              <p className="mt-2 text-[10px] text-[var(--color-ink-3)] italic">
                Stops at {SLIDER_MIN}. Every station already in the truck lane scores above this, so
                lowering the line further adds nobody — it just stops excluding anyone.
              </p>
            )}

            {/* The sentence that is true at every slider position, and the one
                thing a coordinator most needs before they spend an afternoon
                arguing about where the line goes. */}
            <p
              className="mt-2.5 border-t pt-2.5 text-[10px] leading-relaxed text-[var(--color-ink-2)]"
              style={{ borderColor: TONE.mute.line }}
            >
              <strong className="font-semibold text-[var(--color-ink)]">
                The line is not what limits you — capacity is.
              </strong>{' '}
              At {NEEDS_TRUCK_THRESHOLD}, {atCurrent.toLocaleString('en-US')} stations qualify, and
              clearing them means moving {demand.relocatable.toLocaleString('en-US')} bikes —{' '}
              <span className="num">{runs}</span> full runs for the {activeCapacity} bikes of active
              truck capacity. A shift does not contain {runs} runs. Anywhere between{' '}
              {NEEDS_TRUCK_THRESHOLD} and 80 the queue is longer than the fleet can reach either
              way, so moving the line changes the number you report, not the work that gets done.
              Past about 80 it finally binds — and that is the only range where this slider is a
              decision rather than a headline.
            </p>

            {/* An Apply that cannot be clicked, rather than no Apply at all. The
                absence of the control was itself ambiguous — a slider with no
                commit step could as easily mean "applies as you drag". */}
            <div className="mt-2.5 flex items-center gap-2.5">
              <button
                type="button"
                disabled
                title="The scorer is a pure module the scheduled worker also imports. A console session cannot fork it."
                className="cursor-not-allowed rounded-md border border-[var(--color-line)] bg-[var(--color-sunken)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-ink-3)]"
              >
                Apply
              </button>
              <p className="text-[10px] leading-snug text-[var(--color-ink-3)]">
                Not wired up. The live board ranks on {NEEDS_TRUCK_THRESHOLD} whatever this slider
                says. Changing it for real means editing{' '}
                <code className="num text-[10px]">src/model/score.ts</code>, which the scheduled
                worker imports too — so the console and the worker can never disagree about what
                urgent means.
              </p>
            </div>
          </section>

          {CONSTANT_GROUPS.map((group) => {
            const rows = SCORING_CONSTANTS.filter((c) => c.group === group.key);
            if (rows.length === 0) return null;

            return (
              <section key={group.key} className="mt-4">
                <h3 className="eyebrow text-[10px]">{group.label}</h3>
                <p className="mt-0.5 text-[10px] text-[var(--color-ink-3)]">{group.note}</p>

                <dl className="mt-2">
                  {rows.map((c) => (
                    <div
                      key={c.key}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-[var(--color-line-soft)] py-2.5 last:border-b-0"
                    >
                      <dt className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[11.5px] font-semibold text-[var(--color-ink)]">
                            {c.label}
                          </span>
                          <ProvenancePill provenance={c.provenance} />
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-[var(--color-ink-2)]">
                          {c.why}
                        </span>
                        <span className="num mt-0.5 block text-[10px] text-[var(--color-ink-3)]">
                          {c.key}
                        </span>
                      </dt>
                      <dd className="num self-start text-right text-[13px] font-semibold whitespace-nowrap text-[var(--color-ink)]">
                        {c.value}
                        {c.unit && (
                          <span className="ml-1 text-[10px] font-normal text-[var(--color-ink-3)]">
                            {c.unit}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}

          <p className="mt-4 rounded-lg bg-[var(--color-sunken)] p-3 text-[10px] leading-relaxed text-[var(--color-ink-3)]">
            Three of these are marked <strong>Guess</strong> — the dispatch threshold, and both
            duration weights. They were picked because a number was needed. Turning them into
            measurements requires the same thing: enough dispatch outcomes to see which line
            actually predicts recovery. That is what Dispatch History is accumulating.
          </p>
        </div>

        <div className="sticky bottom-0 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          <Button variant="dark" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
