import { forwardRef } from 'react';
import type { ScoredStation } from '../model/summary';
import { mechanicFault, unverifiedReason } from '../model/triage';
import { ScorePlate } from './ScorePlate';
import { ReportedAge } from './ReportedAge';
import { cn } from '../lib/cn';

/**
 * The two lanes a truck cannot serve.
 *
 * Collapsed to a single summary row by default. They are real work and must be
 * visible — a dispatcher who never learns a station is broken will keep
 * wondering why it never recovers — but they are not *this* board's work, and
 * they were previously occupying the top four ranks of a truck queue.
 *
 * A disclosure button, not a `<details>` element, so the open state can be
 * driven from the status strip and rail.
 */
export const LaneSection = forwardRef<
  HTMLElement,
  {
    id: string;
    kind: 'mechanic' | 'unverified';
    stations: ScoredStation[];
    open: boolean;
    onToggle: () => void;
    onSelect: (stationId: string) => void;
    selectedId: string | null;
  }
>(function LaneSection({ id, kind, stations, open, onToggle, onSelect, selectedId }, ref) {
  if (stations.length === 0) return null;

  const n = stations.length;
  const summary =
    kind === 'mechanic'
      ? `${n} station${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a mechanic, not a truck`
      : `${n} station${n === 1 ? '' : 's'} ${n === 1 ? 'has' : 'have'} counts too old to trust`;

  return (
    <section ref={ref} id={id} className="mt-6 border border-[var(--line)] bg-[var(--surface)]">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--paper)]"
        >
          <span
            aria-hidden="true"
            className={cn(
              'num text-[11px] text-[var(--ink-soft)] transition-transform',
              open && 'rotate-90',
            )}
          >
            ▸
          </span>
          <span className="flex-1 text-[14px] text-[var(--ink)]">{summary}</span>
          <span className="num text-[13px] text-[var(--ink-soft)]">{open ? 'Hide' : 'Show'}</span>
        </button>
      </h2>

      {open && (
        <div id={`${id}-body`} className="border-t border-[var(--line)]">
          <p className="px-4 pt-3 text-[12px] text-[var(--ink-soft)]">
            {kind === 'mechanic'
              ? 'Scored the same way, routed differently: moving bikes will not fix a station that is switched off or reporting no usable slots.'
              : 'Scored the same way, but the counts behind the score are stale, so the score is not evidence. Plates are drawn as outlines to say so.'}
          </p>
          <ul>
            {stations.map((s) => (
              <li key={s.station.stationId}>
                <button
                  type="button"
                  onClick={() => onSelect(s.station.stationId)}
                  className={cn(
                    'grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-[var(--line)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--paper)]',
                    'sm:grid-cols-[38px_minmax(0,1fr)_150px_110px]',
                  )}
                  style={
                    selectedId === s.station.stationId
                      ? { boxShadow: 'inset 3px 0 0 var(--accent)', background: 'var(--paper)' }
                      : undefined
                  }
                >
                  <ScorePlate
                    score={s.breakdown.score}
                    category={s.breakdown.category}
                    variant={kind === 'unverified' ? 'outline' : 'fill'}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-[var(--ink)]">
                      {s.station.name}
                    </span>
                    <span className="block text-[12px] text-[var(--ink-soft)]">
                      {s.station.borough}
                    </span>
                  </span>
                  <span className="text-[13px] text-[var(--ink-soft)]">
                    {kind === 'mechanic' ? mechanicFault(s) : unverifiedReason(s)}
                  </span>
                  <span className="justify-self-end">
                    <ReportedAge ageMinutes={s.breakdown.staleness.ageMinutes} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
});
