import { CATEGORY_SIGNAL, type StationCategory } from '../model/score';
import type { BreakdownRow } from '../model/summary';
import { SIGNAL_COLOR } from './CategoryTag';
import { FillBand } from './FillBand';
import { cn } from '../lib/cn';

/**
 * "How they are failing" — the right rail, and the app's only categorical
 * filter. The chip row that used to sit above the table did the same job with a
 * different appearance; two controls for one action is a bug, not a feature.
 *
 * Organised by lane so the rail teaches the same split the page does: what a
 * truck fixes, then what it can't, then what needs nobody.
 */
export function FailureRail({
  truckRows,
  quietRows,
  mechanicCount,
  unverifiedCount,
  active,
  onToggle,
  onJump,
  networkFill,
  truckLane,
}: {
  truckRows: BreakdownRow[];
  quietRows: BreakdownRow[];
  mechanicCount: number;
  unverifiedCount: number;
  active: StationCategory[];
  onToggle: (c: StationCategory) => void;
  onJump: (section: 'mechanic' | 'unverified') => void;
  networkFill: number | null;
  truckLane: number;
}) {
  const max = Math.max(1, ...truckRows.map((r) => r.count));

  return (
    <aside className="flex flex-col gap-7" aria-label="Failure breakdown and filters">
      <section>
        <h2 className="eyebrow">Truck queue — filter</h2>
        <ul className="mt-3">
          {truckRows.map((row) => (
            <RailRow
              key={row.category}
              label={row.label}
              count={row.count}
              barShare={row.count / max}
              color={SIGNAL_COLOR[CATEGORY_SIGNAL[row.category]]}
              active={active.includes(row.category)}
              onClick={() => onToggle(row.category)}
            />
          ))}
        </ul>
        <p className="mt-2.5 text-[12px] text-[var(--ink-soft)]">
          {truckLane.toLocaleString('en-US')} stations a truck can fix. Select to filter; select
          again to clear.
        </p>
      </section>

      {/* Visually separated: these are not truck work, and they are not table
          filters — they scroll to their own sections. */}
      <section className="border-t border-[var(--line)] pt-5">
        <h2 className="eyebrow">Other crews</h2>
        <ul className="mt-3">
          <RailRow
            label="Needs a mechanic"
            count={mechanicCount}
            color={SIGNAL_COLOR.outage}
            onClick={() => onJump('mechanic')}
            jump
          />
          <RailRow
            label="Unverified"
            count={unverifiedCount}
            color="var(--ink-soft)"
            onClick={() => onJump('unverified')}
            jump
            outlineSwatch
          />
        </ul>
      </section>

      <section className="border-t border-[var(--line)] pt-5">
        <h2 className="eyebrow">Needs nobody</h2>
        <ul className="mt-3">
          {quietRows.map((row) => (
            <RailRow
              key={row.category}
              label={row.label}
              count={row.count}
              color={row.category === 'healthy' ? 'var(--signal-ok)' : 'var(--ink-soft)'}
              active={active.includes(row.category)}
              onClick={() => onToggle(row.category)}
            />
          ))}
        </ul>
      </section>

      <section className="border-t border-[var(--line)] pt-5">
        <h2 className="eyebrow">Network fill</h2>
        <p className="mt-2 text-[14px] text-[var(--ink-soft)]">
          {networkFill === null
            ? 'No usable slots reported.'
            : `${Math.round(networkFill * 100)}% of usable slots hold a bike.`}
        </p>
        <div className="mt-3">
          <FillBand ratio={networkFill} compact />
        </div>
        <p className="mt-2 text-[12px] text-[var(--ink-soft)]">
          A balanced network average hides local failures — which is the reason this board ranks
          stations one by one.
        </p>
      </section>
    </aside>
  );
}

function RailRow({
  label,
  count,
  barShare,
  color,
  active = false,
  onClick,
  jump = false,
  outlineSwatch = false,
}: {
  label: string;
  count: number;
  barShare?: number;
  color: string;
  active?: boolean;
  onClick: () => void;
  jump?: boolean;
  outlineSwatch?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={jump ? undefined : active}
        className={cn(
          'group grid w-full grid-cols-[3px_1fr_auto] items-baseline gap-x-3 border-b border-[var(--line)] py-2.5 text-left',
          'hover:bg-[var(--surface)]',
        )}
      >
        {/* Accent edge marks the app's own state — which filter is engaged —
            and is the only orange in the rail. */}
        <span
          aria-hidden="true"
          className="row-span-2 h-full w-[3px] self-stretch"
          style={{ backgroundColor: active ? 'var(--accent)' : 'transparent' }}
        />

        <span
          className={cn(
            'text-[14px]',
            active ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-soft)]',
            !active && 'group-hover:text-[var(--ink)]',
          )}
        >
          {label}
        </span>

        <span
          className={cn(
            'num text-[14px] tabular-nums',
            active ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink)]',
          )}
        >
          {jump ? (
            <>
              {count.toLocaleString('en-US')}
              <span className="ml-1.5 text-[var(--ink-soft)]" aria-hidden="true">
                ›
              </span>
            </>
          ) : (
            count.toLocaleString('en-US')
          )}
        </span>

        {barShare !== undefined ? (
          <span className="col-start-2 col-end-4 mt-2 block h-[4px] w-full bg-[var(--line)]">
            <span
              className="block h-full"
              style={{ width: `${Math.max(barShare * 100, count > 0 ? 2 : 0)}%`, backgroundColor: color }}
            />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="col-start-2 col-end-4 mt-2 block h-[4px] w-[26px]"
            style={
              outlineSwatch
                ? { boxShadow: `inset 0 0 0 1px ${color}` }
                : { backgroundColor: color }
            }
          />
        )}
      </button>
    </li>
  );
}
