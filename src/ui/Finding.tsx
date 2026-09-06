import { useId, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon, type IconName } from './Icon';
import { TONE, type Tone } from './tone';
import { linkifyNode } from '../content/definitions';

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
   makes it read as an alert rather than a caption. The card carries a light
   wash of its tone now so it is noticed without a bigger footprint — the giant
   hero number a redesign reached for is exactly the height this cannot spend.
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
  headline,
  detail,
  stats,
  actions,
}: {
  tone?: Tone;
  icon: IconName;
  /** One-word category, uppercased in the tone colour above the headline. */
  eyebrow?: string;
  headline: ReactNode;
  detail?: ReactNode;
  stats?: FindingStat[];
  /** Buttons or links for the footer row, opposite the stats. */
  actions?: ReactNode;
}) {
  const t = TONE[tone];
  const [open, setOpen] = useState(true);
  const detailId = useId();
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
            the sentence the reader is already on. Jargon is densest here, so
            `linkifyNode` teaches the prose in place. */}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p
              className="text-[9px] leading-none font-bold tracking-[0.09em] uppercase"
              style={{ color: t.fg }}
            >
              {eyebrow}
            </p>
          )}
          <p
            className={cn(
              'text-[12px] leading-snug font-semibold text-[var(--color-ink)]',
              eyebrow && 'mt-1',
            )}
          >
            {linkifyNode(headline)}
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
              {linkifyNode(detail)}
            </p>
          </div>
        </div>
      )}

      {hasFooter && (
        <div
          className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 border-t px-3.5 py-1.5"
          style={{ borderColor: t.line }}
        >
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
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
    </section>
  );
}
