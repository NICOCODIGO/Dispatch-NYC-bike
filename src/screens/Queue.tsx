import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BOROUGHS, type Borough } from '../data/boroughs';
import { CATEGORY_LABEL, NEEDS_TRUCK_THRESHOLD, type StationCategory } from '../model/score';
import { applyFilters, describeFilters, hasActiveFilters } from '../model/queue';
import { quietBreakdown, situationSentence, truckBreakdown } from '../model/summary';
import { QUIET_CATEGORIES, TRUCK_CATEGORIES } from '../model/triage';
import { FEED_STALE_MS, useDispatch } from '../store/useDispatch';
import { FailureRail } from '../components/FailureRail';
import { StatusStrip, type Stat } from '../components/StatusStrip';
import { QueueSkeleton } from '../components/Skeleton';
import { Banner } from '../components/Banner';
import { LaneSection } from '../components/LaneSection';
import { DetailPanel } from '../components/DetailPanel';
import { QueueTable } from '../components/QueueTable';
import { formatAgo, formatClock, formatClockWithZone, useTicker } from '../lib/time';
import { useFlip } from '../lib/flip';
import { cn } from '../lib/cn';

/** Rows rendered before "show more". A dispatch board is read from the top. */
const PAGE_SIZE = 100;

export function Queue() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  const phase = useDispatch((s) => s.phase);
  const lanes = useDispatch((s) => s.lanes);
  const byId = useDispatch((s) => s.byId);
  const summary = useDispatch((s) => s.summary);
  const filters = useDispatch((s) => s.filters);
  const setFilters = useDispatch((s) => s.setFilters);
  const resetFilters = useDispatch((s) => s.resetFilters);
  const toggleCategory = useDispatch((s) => s.toggleCategory);
  const error = useDispatch((s) => s.error);
  const fetchedAtMs = useDispatch((s) => s.fetchedAtMs);
  const feedUpdatedMs = useDispatch((s) => s.feedUpdatedMs);
  const revision = useDispatch((s) => s.revision);

  const queue = useMemo(() => applyFilters(lanes, filters), [lanes, filters]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openLane, setOpenLane] = useState<{ mechanic: boolean; unverified: boolean }>({
    mechanic: false,
    unverified: false,
  });
  const [mobileFilters, setMobileFilters] = useState(false);

  const mechanicRef = useRef<HTMLElement>(null);
  const unverifiedRef = useRef<HTMLElement>(null);
  // Remembers which row opened the panel, so closing returns focus there.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filters]);

  const register = useFlip(revision);
  const rows = queue.slice(0, visible);

  const selected = routeId ? (byId.get(routeId) ?? null) : null;
  const selectedIndex = selected
    ? queue.findIndex((s) => s.station.stationId === selected.station.stationId)
    : -1;

  const openStation = useCallback(
    (stationId: string, opener?: HTMLElement | null) => {
      if (opener) openerRef.current = opener;
      navigate(`/station/${encodeURIComponent(stationId)}`);
    },
    [navigate],
  );

  const closePanel = useCallback(() => {
    navigate('/');
    // Return focus to the row that opened the panel.
    const opener = openerRef.current;
    openerRef.current = null;
    requestAnimationFrame(() => opener?.focus());
  }, [navigate]);

  // Prev/next walk the filtered queue order. Replace rather than push so
  // arrowing through ten stations doesn't bury the queue ten entries deep.
  const step = useCallback(
    (delta: number) => {
      if (selectedIndex < 0) return;
      const next = queue[selectedIndex + delta];
      if (!next) return;
      navigate(`/station/${encodeURIComponent(next.station.stationId)}`, { replace: true });
    },
    [navigate, queue, selectedIndex],
  );

  const jumpTo = useCallback((section: 'mechanic' | 'unverified') => {
    setOpenLane((prev) => ({ ...prev, [section]: true }));
    requestAnimationFrame(() => {
      const el = section === 'mechanic' ? mechanicRef.current : unverifiedRef.current;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const stats: Stat[] = summary
    ? [
        {
          label: 'Needs a truck',
          value: summary.needsTruck.toLocaleString('en-US'),
          onClick: resetFilters,
          actionLabel: `${summary.needsTruck} stations need a truck. Clear all filters.`,
        },
        { label: 'Empty side', value: summary.emptySide.toLocaleString('en-US'), tone: 'empty' },
        { label: 'Full side', value: summary.fullSide.toLocaleString('en-US'), tone: 'full' },
        {
          label: 'Needs a mechanic',
          value: summary.mechanic.toLocaleString('en-US'),
          tone: 'outage',
          onClick: () => jumpTo('mechanic'),
          actionLabel: `${summary.mechanic} stations need a mechanic. Open that list.`,
        },
        {
          label: 'Unverified',
          value: summary.unverified.toLocaleString('en-US'),
          onClick: () => jumpTo('unverified'),
          actionLabel: `${summary.unverified} stations are unverified. Open that list.`,
        },
        {
          label: 'Network fill',
          value: summary.networkFill === null ? null : `${Math.round(summary.networkFill * 100)}%`,
        },
      ]
    : [
        'Needs a truck',
        'Empty side',
        'Full side',
        'Needs a mechanic',
        'Unverified',
        'Network fill',
      ].map((label) => ({ label, value: null }));

  const feedIsStale =
    feedUpdatedMs !== null && fetchedAtMs !== null && fetchedAtMs - feedUpdatedMs > FEED_STALE_MS;

  const activeFilters = describeFilters(filters, (c) => CATEGORY_LABEL[c]);
  const filtersOn = hasActiveFilters(filters);

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8">
      {(error || feedIsStale) && (
        <div className="mb-5 flex flex-col gap-2">
          {error && (
            <Banner tone="error">
              Feed unreachable ({error.message})
              {fetchedAtMs !== null && <> — showing data from {formatClock(fetchedAtMs)}</>}.
              Retrying automatically.
            </Banner>
          )}
          {feedIsStale && feedUpdatedMs !== null && (
            <Banner tone="warning">
              The operator&rsquo;s feed itself was last updated at {formatClock(feedUpdatedMs)}.
              Every count below is at least that old.
            </Banner>
          )}
        </div>
      )}

      {/* The readout: a dateline and a few sentences of plain report. */}
      <Dateline />
      {/* min-height reserves two lines so the strip and queue below do not jump
          when the first poll lands. */}
      <p className="mt-1.5 min-h-[54px] max-w-[65ch] text-[18px] leading-[1.35] font-semibold text-[var(--ink)] sm:text-[20px]">
        {summary ? (
          situationSentence(summary)
        ) : (
          <span className="font-normal text-[var(--ink-soft)]">Reading the live feed…</span>
        )}
      </p>

      <div className="mt-3.5">
        <StatusStrip stats={stats} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="queue-heading" className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="queue-heading" className="display text-[18px] text-[var(--ink)]">
              Ranked queue
            </h2>
            <p className="num text-[12px] text-[var(--ink-soft)]">
              {queue.length.toLocaleString('en-US')} shown ·{' '}
              <span
                tabIndex={0}
                title={`A station is counted as needing a truck at ${NEEDS_TRUCK_THRESHOLD} or above. Below that it is drifting but still serving riders.`}
                className="cursor-help underline decoration-dotted underline-offset-2"
              >
                threshold {NEEDS_TRUCK_THRESHOLD}
              </span>
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search stations</span>
              <input
                type="search"
                value={filters.search}
                onChange={(e) => setFilters({ search: e.target.value })}
                placeholder="Search station or borough"
                className="w-full min-w-[170px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--ink)] placeholder:text-[var(--ink-soft)] focus:border-[var(--ink-soft)]"
              />
            </label>

            <label>
              <span className="sr-only">Filter by borough</span>
              <select
                value={filters.borough}
                onChange={(e) => setFilters({ borough: e.target.value as Borough | 'all' })}
                className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--ink)]"
              >
                <option value="all">All boroughs</option>
                {BOROUGHS.filter((b) => b !== 'Unknown').map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>

            {/* The rail is off-screen below on mobile, so the same category
                list is reachable here. Same control, relocated. */}
            <button
              type="button"
              onClick={() => setMobileFilters(true)}
              className="border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--ink)] lg:hidden"
            >
              Failure
              {filters.categories.length > 0 && (
                <span className="num ml-1.5 text-[12px]">{filters.categories.length}</span>
              )}
            </button>
          </div>

          {filtersOn && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              <span className="num text-[var(--ink-soft)]">Filtered:</span>
              <span className="num text-[var(--ink)]">{activeFilters.join(' · ')}</span>
              <span className="num text-[var(--ink-soft)]">
                · {queue.length.toLocaleString('en-US')} station
                {queue.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="num ml-1 underline underline-offset-2"
                style={{ color: 'var(--accent-ink)' }}
              >
                ✕ Clear
              </button>
            </div>
          )}

          <div className="mt-3 border border-[var(--line)] bg-[var(--surface)]">
            {phase === 'loading' && lanes.truck.length === 0 ? (
              <QueueSkeleton />
            ) : queue.length === 0 ? (
              <EmptyState filters={activeFilters} onClear={resetFilters} />
            ) : (
              <QueueTable
                rows={rows}
                sortKey={filters.sortKey}
                sortDir={filters.sortDir}
                onSort={(key) =>
                  setFilters(
                    filters.sortKey === key
                      ? { sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' }
                      : { sortKey: key, sortDir: key === 'name' ? 'asc' : 'desc' },
                  )
                }
                register={register}
                selectedId={selected?.station.stationId ?? null}
                onSelect={openStation}
              />
            )}
          </div>

          {visible < queue.length && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="mt-3 border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[14px] text-[var(--ink)] hover:border-[var(--ink-soft)]"
            >
              Show {Math.min(PAGE_SIZE, queue.length - visible)} more
              <span className="num ml-2 text-[12px] text-[var(--ink-soft)]">
                {visible.toLocaleString('en-US')} / {queue.length.toLocaleString('en-US')}
              </span>
            </button>
          )}

          <LaneSection
            ref={mechanicRef}
            id="mechanic"
            kind="mechanic"
            stations={lanes.mechanic}
            open={openLane.mechanic}
            onToggle={() => setOpenLane((p) => ({ ...p, mechanic: !p.mechanic }))}
            onSelect={openStation}
            selectedId={selected?.station.stationId ?? null}
          />
          <LaneSection
            ref={unverifiedRef}
            id="unverified"
            kind="unverified"
            stations={lanes.unverified}
            open={openLane.unverified}
            onToggle={() => setOpenLane((p) => ({ ...p, unverified: !p.unverified }))}
            onSelect={openStation}
            selectedId={selected?.station.stationId ?? null}
          />
        </section>

        {summary && (
          <div className="hidden lg:block">
            <FailureRail
              truckRows={truckBreakdown(summary)}
              quietRows={quietBreakdown(summary)}
              mechanicCount={summary.mechanic}
              unverifiedCount={summary.unverified}
              active={filters.categories}
              onToggle={toggleCategory}
              onJump={jumpTo}
              networkFill={summary.networkFill}
              truckLane={summary.truckLane}
            />
          </div>
        )}
      </div>

      {mobileFilters && summary && (
        <FilterSheet
          counts={summary.categoryCounts}
          active={filters.categories}
          onToggle={toggleCategory}
          onClose={() => setMobileFilters(false)}
          onClear={resetFilters}
        />
      )}

      {selected && (
        <DetailPanel
          entry={selected}
          index={selectedIndex >= 0 ? selectedIndex : 0}
          total={selectedIndex >= 0 ? queue.length : 1}
          onPrev={selectedIndex > 0 ? () => step(-1) : null}
          onNext={selectedIndex >= 0 && selectedIndex < queue.length - 1 ? () => step(1) : null}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

/**
 * The dateline. One timestamp, in one place — this used to be duplicated in the
 * masthead. Its own ticker so the second-by-second update repaints this line
 * and not the queue behind it.
 */
function Dateline() {
  const fetchedAtMs = useDispatch((s) => s.fetchedAtMs);
  const error = useDispatch((s) => s.error);
  const now = useTicker(1000);

  return (
    <p className="eyebrow-mono">
      Situation
      {fetchedAtMs !== null && (
        <>
          <Sep />
          {formatClockWithZone(fetchedAtMs)}
          <Sep />
          {error ? 'last good feed ' : 'feed '}
          {formatAgo(now - fetchedAtMs)} ago
        </>
      )}
      {fetchedAtMs === null && (
        <>
          <Sep />
          connecting
        </>
      )}
    </p>
  );
}

function Sep() {
  return <span className="mx-1.5 opacity-50">·</span>;
}

function FilterSheet({
  counts,
  active,
  onToggle,
  onClose,
  onClear,
}: {
  counts: Record<StationCategory, number>;
  active: StationCategory[];
  onToggle: (c: StationCategory) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:hidden">
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="absolute inset-0 bg-[rgb(23_25_30/28%)]"
      />
      <div
        role="dialog"
        aria-label="Filter by failure"
        className="relative w-full border-t border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <h2 className="eyebrow">Filter by failure</h2>
        <ul className="mt-3">
          {[...TRUCK_CATEGORIES, ...QUIET_CATEGORIES].map((c) => (
            <li key={c}>
              <button
                type="button"
                onClick={() => onToggle(c)}
                aria-pressed={active.includes(c)}
                className="flex w-full items-center justify-between gap-3 border-b border-[var(--line)] py-3 text-left"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-[16px] w-[3px]"
                    style={{
                      backgroundColor: active.includes(c) ? 'var(--accent)' : 'transparent',
                    }}
                  />
                  <span
                    className={cn(
                      'text-[15px]',
                      active.includes(c)
                        ? 'font-semibold text-[var(--ink)]'
                        : 'text-[var(--ink-soft)]',
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </span>
                </span>
                <span className="num text-[14px] text-[var(--ink)]">{counts[c]}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="flex-1 border border-[var(--line)] px-4 py-2.5 text-[14px]"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-[14px] text-[var(--paper)]"
            style={{ backgroundColor: 'var(--accent-ink)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filters, onClear }: { filters: string[]; onClear: () => void }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-[15px] text-[var(--ink)]">
        No station a truck can fix matches{' '}
        {filters.length > 0 ? filters.join(' · ') : 'the current filters'}.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 px-4 py-2 text-[14px] text-[var(--paper)]"
        style={{ backgroundColor: 'var(--accent-ink)' }}
      >
        Clear all filters
      </button>
    </div>
  );
}
