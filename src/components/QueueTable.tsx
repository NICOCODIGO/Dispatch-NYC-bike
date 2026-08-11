import { Link } from 'react-router-dom';
import type { ScoredStation } from '../model/summary';
import type { SortKey } from '../store/useDispatch';
import { ScorePlate } from './ScorePlate';
import { DockBar } from './DockBar';
import { CategoryTag } from './CategoryTag';
import { ReportedAge } from './ReportedAge';
import { cn } from '../lib/cn';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'name', label: 'Station' },
  { key: 'fill', label: 'Bikes / docks' },
  { key: 'category', label: 'Failure' },
  { key: 'reported', label: 'Reported' },
];

export function QueueTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  register,
  selectedId,
  onSelect,
}: {
  rows: ScoredStation[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  register: (key: string) => (el: HTMLElement | null) => void;
  selectedId: string | null;
  onSelect: (stationId: string, opener: HTMLElement | null) => void;
}) {
  return (
    <table className="queue-table">
      <caption className="sr-only">
        Stations a truck can fix, ranked by urgency, worst first. Select a station to see how its
        score was calculated.
      </caption>
      <colgroup>
        <col style={{ width: 84 }} />
        <col />
        <col style={{ width: 186 }} />
        <col style={{ width: 112 }} />
        <col style={{ width: 106 }} />
      </colgroup>
      <thead>
        <tr>
          {COLUMNS.map((col) => {
            const active = sortKey === col.key;
            return (
              <th
                key={col.key}
                scope="col"
                aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={cn(
                    'eyebrow inline-flex items-center gap-1 hover:text-[var(--ink)]',
                    active && 'text-[var(--ink)]',
                  )}
                >
                  {col.label}
                  <span aria-hidden="true" className="num text-[10px]">
                    {active ? (sortDir === 'asc' ? '▲' : '▼') : '　'}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ station, breakdown }) => {
          const to = `/station/${encodeURIComponent(station.stationId)}`;
          const isSelected = selectedId === station.stationId;

          return (
            <tr
              key={station.stationId}
              className="queue-row group"
              data-selected={isSelected}
              ref={register(station.stationId)}
            >
              <td className="cell-plate">
                <ScorePlate
                  score={breakdown.score}
                  category={breakdown.category}
                  to={to}
                  tabIndex={-1}
                />
              </td>

              <td className="cell-name">
                <Link
                  to={to}
                  onClick={(e) => onSelect(station.stationId, e.currentTarget)}
                  aria-current={isSelected ? 'true' : undefined}
                  className="block min-w-0"
                >
                  <span className="block truncate text-[15px] text-[var(--ink)]">
                    {station.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[var(--ink-soft)]">
                    {station.borough}
                    <span className="num"> · {station.capacity} docks</span>
                  </span>
                </Link>

                {/* First level of "go deeper": the two biggest contributors, on
                    hover or keyboard focus. */}
                <FactorCard factors={breakdown.factors} />
              </td>

              <td className="cell-bar">
                <span className="flex items-center gap-3">
                  <DockBar
                    bikes={breakdown.fill.bikes}
                    docks={breakdown.fill.docks}
                    signal={breakdown.signal}
                    emphasize={breakdown.needsTruck}
                  />
                  {/* Aligned on the slash so a column of 0/28, 81/0, 77/0 reads
                      as two columns of numbers rather than ragged pairs. */}
                  <span className="slash-pair num w-[58px] shrink-0 text-[13px] tabular-nums text-[var(--ink)]">
                    <span>{breakdown.fill.bikes}</span>
                    <span className="px-px text-[var(--ink-soft)]">/</span>
                    <span className="text-[var(--ink-soft)]">{breakdown.fill.docks}</span>
                  </span>
                </span>
              </td>

              <td className="cell-category">
                <CategoryTag category={breakdown.category} />
              </td>

              <td className="cell-reported">
                <ReportedAge ageMinutes={breakdown.staleness.ageMinutes} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FactorCard({ factors }: { factors: ScoredStation['breakdown']['factors'] }) {
  if (factors.length === 0) return null;

  return (
    <div
      role="presentation"
      className={cn(
        'pointer-events-none absolute top-full left-0 z-20 mt-1 hidden w-[330px] max-w-[86vw]',
        'border border-[var(--line)] bg-[var(--surface)] p-3',
        'shadow-[0_1px_0_rgb(23_25_30/6%)]',
        'group-hover:block group-focus-within:block',
      )}
    >
      {factors.slice(0, 2).map((f) => (
        <p key={f.label} className="flex gap-3 py-1 text-[12px] leading-snug">
          <span className="num w-[42px] shrink-0 text-right font-semibold tabular-nums text-[var(--ink)]">
            {f.delta > 0 ? '+' : ''}
            {f.delta}
          </span>
          <span className="min-w-0 text-[var(--ink-soft)]">
            <span className="text-[var(--ink)]">{f.label}.</span> {f.detail}
          </span>
        </p>
      ))}
    </div>
  );
}
