import { useId, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon, type IconName } from './Icon';
import { TONE, type Tone } from './tone';

/* ---------------------------------------------------------------------------
   Finding — the sentence at the top of a screen that says what the numbers
   below it mean.

   A console full of counts makes the reader do the interpreting. This states
   the conclusion in words, then shows the figures it was drawn from, so the
   page leads with a claim it is willing to defend rather than a wall of data.

   The claim and the figures are always visible; the reasoning between them
   folds away behind the chevron. A dispatcher who already knows why Broadway
   is red should not have to read the paragraph again on every poll, and one
   who doesn't is one click from it. Open by default — the explanation is the
   point of the banner, so hiding it has to be the reader's choice.

   `eyebrow` and `actions` are opt-in: a plain screen banner passes neither and
   looks the way it always did, while the situation headline on the queue passes
   a one-word category ("UNSERVED") and a button, which is the whole of what
   makes it read as an alert rather than a caption, along with `hero` — the one
   figure large enough to win against the KPI row above it. The card also
   carries a light wash of its tone. None of it is free height: the wash and the
   eyebrow cost nothing, and `hero` costs one line, spent only where the alert
   turns on a single number.
--------------------------------------------------------------------------- */

export interface FindingStat {
  label: string;
  value: ReactNode;
  tone?: Tone;
}

export function Finding({
  tone = 'ink',
  icon,
  eyebrow,
  hero,
  heroNote,
  headline,
  detail,
  stats,
  actions,
  compact = false,
}: {
  tone?: Tone;
  icon: IconName;
  /** One-word category, uppercased in the tone colour above the headline. */
  eyebrow?: string;
  /**
   * The one figure the alert is actually about, set large in the tone colour.
   *
   * Without it the banner lost a shouting match with its own KPI row: 22px
   * stat values above a 12px sentence saying a station had been dead for an
   * hour, so the furniture read as more urgent than the emergency. Only the
   * scariest number belongs here — a duration, not a score, because "how long
   * has nobody gone" is the part that should make somebody move.
   */
  hero?: ReactNode;
  /** The small line under `hero`, naming what it measures. */
  heroNote?: string;
  headline: ReactNode;
  detail?: ReactNode;
  stats?: FindingStat[];
  /** Buttons or links for the footer row, opposite the stats. */
  actions?: ReactNode;
  /**
   * One line, for a finding you cannot act on from the screen you are reading.
   *
   * Severity ranking is right — a network-wide hardware failure genuinely is
   * the worst thing happening, whoever is looking at it. What was wrong is that
   * an alert *pointing somewhere else* was drawn at the same 153px weight as
   * one describing the work in front of you, so a rebalancing dispatcher opened
   * their board and the first thing on it said go to Hardware. Same ranking,
   * same words, a fifth of the height: told, not redirected.
   *
   * Drops the hero, the detail and the stats — every one of those is depth on a
   * subject this reader is not going to act on. The headline and the way there
   * survive, because those are the whole message.
   */
  compact?: boolean;
}) {
  const t = TONE[tone];
  const [open, setOpen] = useState(true);
  const detailId = useId();

  if (compact) {
    return (
      <section
        className="flex items-center gap-2.5 overflow-hidden rounded-lg border px-3 py-1.5"
        style={{ backgroundColor: t.bg, borderColor: t.line, borderLeft: `4px solid ${t.fg}` }}
      >
        <span
          aria-hidden="true"
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: t.fg, color: t.onFg }}
        >
          <Icon name={icon} size={11} />
        </span>
        {eyebrow && (
          <span
            className="shrink-0 text-[9px] leading-none font-bold tracking-[0.09em] uppercase"
            style={{ color: t.fg }}
          >
            {eyebrow}
          </span>
        )}

        {/* `hero` + `heroNote` where there is one, not the headline.
            The pair is already a complete sentence — "676 dead docks - 0.9% of
            the network" — and it is the figure the alert exists to report. The
            headline is the elaboration, which is the part a one-liner spends.
            Falling back to the headline keeps the mode usable for a finding
            that has no single number. */}
        <p className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-ink)]">
          {hero ? (
            <>
              <span className="num text-[13px] font-bold" style={{ color: t.fg }}>
                {hero}
              </span>{' '}
              <span className="font-medium">{heroNote}</span>
            </>
          ) : (
            <span className="font-medium">{headline}</span>
          )}
        </p>
        {actions && <span className="shrink-0">{actions}</span>}
      </section>
    );
  }

  const showDetail = Boolean(detail) && open;
  const hasFooter = (stats && stats.length > 0) || Boolean(actions);

  return (
    <section
      className="overflow-hidden rounded-lg border"
      style={{ backgroundColor: t.bg, borderColor: t.line, borderLeft: `4px solid ${t.fg}` }}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-2.5">
        <span
          aria-hidden="true"
          className="mt-px flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded"
          style={{ backgroundColor: t.fg, color: t.onFg }}
        >
          <Icon name={icon} size={12} />
        </span>

        {/* The claim, and it stays put — collapsing the detail must not move
            the sentence the reader is already on.

            Not linkified. `linkifyNode` is right in body prose, where a reader
            meeting "staleness" for the first time wants the definition, but an
            alert headline is four words and every domain noun in it picked up a
            dotted underline — "an hour full is an hour of riders turned away"
            came out with three underlined words and read like a wiki stub. In a
            block whose whole job is to be glanced at, the only thing that should
            look clickable is the thing you are meant to click. */}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p
              className="text-[9px] leading-none font-bold tracking-[0.09em] uppercase"
              style={{ color: t.fg }}
            >
              {eyebrow}
            </p>
          )}

          {hero && (
            <p className={cn('flex items-baseline gap-2', eyebrow && 'mt-1.5')}>
              <span
                className="num text-[26px] leading-none font-bold tracking-tight"
                style={{ color: t.fg }}
              >
                {hero}
              </span>
              {heroNote && (
                <span className="text-[11px] leading-none" style={{ color: t.fg }}>
                  {heroNote}
                </span>
              )}
            </p>
          )}

          <p
            className={cn(
              'text-[12px] leading-snug font-semibold text-[var(--color-ink)]',
              Boolean(eyebrow || hero) && 'mt-1.5',
            )}
          >
            {headline}
          </p>
        </div>

        {detail && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={open ? 'Hide the explanation' : 'Show the explanation'}
            className="-mr-1 shrink-0 rounded p-1 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
          >
            <Icon
              name="chevron-down"
              size={14}
              className={cn('transition-transform duration-200', !open && '-rotate-90')}
            />
          </button>
        )}
      </div>

      {/* Height is animated by the 0fr → 1fr grid row rather than a guessed
          max-height, so the curve is the same whether the reasoning is one line
          or five. `inert` keeps the folded-away link out of the tab order. The
          `.rail-ease` curve is the one the chrome rail unfolds on, and
          reduced-motion drops it in `index.css`. */}
      {detail && (
        <div
          id={detailId}
          className="rail-ease grid px-3.5 transition-[grid-template-rows]"
          style={{ gridTemplateRows: showDetail ? '1fr' : '0fr' }}
          aria-hidden={!showDetail}
          {...(!showDetail ? { inert: '' } : {})}
        >
          <div className="min-h-0 overflow-hidden">
            <p className="pb-2.5 pl-[30px] text-[12px] leading-normal text-[var(--color-ink-2)]">
              {detail}
            </p>
          </div>
        </div>
      )}

      {/* Left-packed, not `justify-between`. Flung to opposite ends of a 1200px
          card the button and the figures read as two unrelated controls;
          sitting together they read as one footer — the thing to do about it,
          and the evidence for it. */}
      {hasFooter && (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t px-3.5 py-1.5"
          style={{ borderColor: t.line }}
        >
          {actions && <div className="flex items-center gap-2">{actions}</div>}
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {(stats ?? []).map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <dd
                  className="num text-[12px] font-semibold"
                  style={{ color: TONE[s.tone ?? 'ink'].fg }}
                >
                  {s.value}
                </dd>
                <dt className="text-[10px] text-[var(--color-ink-3)]">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
