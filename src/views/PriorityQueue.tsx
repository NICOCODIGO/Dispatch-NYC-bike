import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Donut, Legend } from '../ui/charts';
import {
  ArrivalBanner,
  Bar,
  Banner,
  Button,
  Card,
  CardHead,
  Dot,
  FilterChip,
  Finding,
  Pagination,
  SearchInput,
  Select,
  SkeletonRows,
  StatCard,
  StatusPill,
  Td,
  Th,
} from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { ScorePeek } from '../ui/ScorePeek';
import { OutcomeChip } from './DispatchHistory';
import { latestRunFor, outcomeOf, type DispatchRun } from '../data/dispatchRun';
import { DispatchComposer } from './DispatchComposer';
import { MethodSheet } from './MethodSheet';
import { COLUMN_HELP } from '../content/columns';
import { matchesOutsideQueue } from '../data/insights';
import { DISPOSITION_LABEL, useConsole, type Disposition } from '../state/useConsole';
import { toStationRow } from '../data/adapt';
import type { StationRow } from '../data/stationRow';
import { BOROUGHS, type Borough } from '../data/boroughs';
import { mechanicFault } from '../model/triage';
import { NEEDS_TRUCK_THRESHOLD, type StationCategory } from '../model/score';
import { applyFilters } from '../model/queue';
import { FEED_STALE_MS, useDispatch, type SortKey } from '../store/useDispatch';
import { formatAgo, formatClock, formatReportedAge } from '../lib/time';
import { durationIndex } from '../data/duration';
import { useSessionHistory } from '../state/useHistory';
import { focusHref, useArrival, useScrollToFocus } from '../state/useFocus';
import { TRUCKS, TRUCK_STATE_LABEL, TRUCK_STATE_TONE } from '../mock/data';
import { cn } from '../lib/cn';

/**
 * The board, on live data.
 *
 * Rows come from the truck lane in `useDispatch` through the adapter — the
 * stations a truck can actually fix, worst first. Mechanical failures and
 * unreadable stations are not filtered out here; they were routed to their own
 * screens by `triage.ts` before this component ever sees them.
 *
 * The rail's Active Trucks card is still fixtures: GBFS has no vehicles, and
 * nothing in the feed can populate it.
 */

/**
 * Rows per page.
 *
 * Sized so a page and its pager fit a 900px viewport without scrolling — the
 * board is read from the top, and a page you have to scroll to finish is a page
 * you lose your place in.
 *
 * Twelve rather than the original ten because the rows are shorter now: cell
 * padding went from `py-2` to `py-1.5`, which is about 4px a row, and two rows'
 * worth of that is a whole extra row back. The arithmetic, on a 900px viewport:
 * roughly 390px goes to the page header, the six stat cards, the filter strip,
 * the table head, the footer and the gaps between them, leaving ~510px; a row
 * is ~42px normally and ~56px when it carries both a duration line and a
 * dispatch outcome chip.
 */
const PAGE_SIZE = 12;

/**
 * The chip row.
 *
 * Four real filters over the truck lane's four categories, and one link.
 * "Unverified" cannot filter this table — those stations are excluded from the
 * truck lane by definition — so it goes where they actually live.
 */
const CHIPS: { key: StationCategory; label: string; tone: Tone }[] = [
  { key: 'empty', label: 'Empty', tone: 'empty' },
  { key: 'starving', label: 'Low stock', tone: 'warn' },
  { key: 'flooded', label: 'Flooded', tone: 'flood-soft' },
  { key: 'full', label: 'Full', tone: 'flood' },
];

const COLUMNS: {
  /**
   * Omitted for a column that is read but not ordered by. Two headers sharing
   * one key is not a shortcut — both light up as active, both carets go solid,
   * and clicking between them toggles the direction instead of switching
   * column, so the header ends up claiming two sort columns at once.
   */
  key?: SortKey;
  label: string;
  width?: number;
  align?: 'right';
  help?: keyof typeof COLUMN_HELP;
}[] = [
  // Each width has to hold its own *header*, not just its data. Several were
  // sized for the numbers underneath and then wrapped their labels onto two
  // lines — "Bikes" sitting above "Open" reads as two columns, not one.
  //
  // Under `table-layout: fixed` these stopped being hints and became the actual
  // widths, so anything sized only for its data now clips its own label instead
  // of quietly borrowing space from a neighbour. Each one below allows for the
  // label, the sort caret (which holds its space even when transparent) and the
  // help icon. Being generous is free: the container scrolls sideways, and on a
  // wide screen the slack all lands in Station, which is the column that wants
  // it.
  { key: 'score', label: 'Score', width: 84, help: 'score' },
  { key: 'name', label: 'Station' },
  // Readable, not orderable — and it took two passes to get here. It first
  // sorted by 'category', i.e. by failure severity, which is the one thing the
  // word "Borough" does not mean; that got fixed by giving it a real borough
  // sort. The second question is the one that settles it: given the borough
  // dropdown sitting directly above this table, what is grouping a worst-first
  // triage queue by borough actually for? It destroys the ordering the queue
  // exists to provide, to do a narrowing job the dropdown already does better.
  //
  // The 'borough' key stays in `SortKey` and in `valueFor` — it is correct, it
  // is tested, and reinstating this is one word if a borough-first reading ever
  // turns out to be wanted.
  // 104, not 92: "Staten Island" is the longest borough and fixed layout will
  // no longer widen the column to fit it.
  { label: 'Borough', width: 104 },
  // Counts and Fill are the same ordering — fill *is* bikes over slots — so
  // only one of them gets to be the control.
  { label: 'Bikes / Open', width: 118, help: 'bikesOpen' },
  { key: 'fill', label: 'Fill', width: 104, help: 'fill' },
  { key: 'category', label: 'Status', width: 112, help: 'status' },
  { key: 'reported', label: 'Updated', width: 108, help: 'updated' },
];

/** Columns whose values are words: A→Z is the useful first click, not Z→A. */
const ALPHABETICAL: SortKey[] = ['name', 'borough'];

/** Appended after the derived columns — see DispositionCell. */
const DISPOSITION_COL_WIDTH = 124;

/** Station is the one column with no declared width, so it absorbs whatever is
 *  left over. This is the least it may be squeezed to before the table stops
 *  shrinking and the container scrolls sideways instead. */
const STATION_MIN_WIDTH = 200;

/** Summed rather than written down, so adding a column cannot silently leave
 *  the table too narrow for its own fixed layout. */
const TABLE_MIN_WIDTH =
  COLUMNS.reduce((total, c) => total + (c.width ?? 0), 0) +
  DISPOSITION_COL_WIDTH +
  STATION_MIN_WIDTH;

export function PriorityQueue() {
  const phase = useDispatch((s) => s.phase);
  const lanes = useDispatch((s) => s.lanes);
  const summary = useDispatch((s) => s.summary);
  const filters = useDispatch((s) => s.filters);
  const setFilters = useDispatch((s) => s.setFilters);
  const resetFilters = useDispatch((s) => s.resetFilters);
  const toggleCategory = useDispatch((s) => s.toggleCategory);
  const error = useDispatch((s) => s.error);
  const fetchedAtMs = useDispatch((s) => s.fetchedAtMs);
  const feedUpdatedMs = useDispatch((s) => s.feedUpdatedMs);

  const openStation = useConsole((s) => s.openStation);
  const openStationId = useConsole((s) => s.openStationId);
  const dispositions = useConsole((s) => s.dispositions);
  const runs = useConsole((s) => s.runs);
  const dispatched = useConsole((s) => s.dispatched);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [mine, setMine] = useState<'all' | 'unhandled' | Disposition>('all');
  const [composing, setComposing] = useState<StationRow | null>(null);
  const [method, setMethod] = useState(false);

  const { tracks } = useSessionHistory();
  const durations = useMemo(() => durationIndex(tracks), [tracks]);

  const filtered = useMemo(() => applyFilters(lanes, filters), [lanes, filters]);

  /**
   * Rows carry their duration-adjusted score, so the whole filtered lane is
   * re-ranked before paging. Adjusting only the visible page would mean a
   * station long overdue on page four never climbs onto page one — which is
   * precisely the failure duration was added to fix.
   */
  const allRows: StationRow[] = useMemo(() => {
    const mapped = filtered.map((entry) =>
      toStationRow(entry, durations.get(entry.station.stationId)),
    );

    if (filters.sortKey !== 'score') return mapped;

    /**
     * Response state changes the *order*, never the score.
     *
     * A station somebody is already driving to is not less broken, so folding
     * this into urgency would be the same category error as putting dead
     * stations in a rebalancing queue. But it is less *actionable* — and a
     * station where a truck already went and failed is more so, because the
     * obvious fix has been tried and did not work.
     */
    const nudge = (r: StationRow) => {
      const run = latestRunFor(runs, r.id);
      if (!run) return 0;
      if (!run.after) return -1; // in flight — somebody is on it
      return outcomeOf(run) === 'recovered' ? 0 : 1; // tried and failed — escalate
    };

    // `b - a` is already descending, so 'desc' must multiply by +1. Getting
    // this backwards silently reordered the entire board worst-last, which is
    // the one thing this screen exists not to do.
    const dir = filters.sortDir === 'desc' ? 1 : -1;
    return [...mapped].sort((a, b) => {
      const byResponse = nudge(b) - nudge(a);
      if (byResponse !== 0) return byResponse;
      return dir * ((b.score ?? -1) - (a.score ?? -1));
    });
  }, [filtered, durations, runs, filters.sortKey, filters.sortDir]);

  // Snoozing is a decision to stop being shown something. Hiding it is the
  // whole point — but silently, with no count and no way back, it becomes a
  // way to lose stations, so the footer always says how many are out of sight.
  const snoozedCount = useMemo(
    () => allRows.filter((r) => dispositions[r.id] === 'snoozed').length,
    [allRows, dispositions],
  );
  const queue = useMemo(() => {
    const visible = showSnoozed
      ? allRows
      : allRows.filter((r) => dispositions[r.id] !== 'snoozed');
    if (mine === 'all') return visible;
    if (mine === 'unhandled') return visible.filter((r) => !dispositions[r.id]);
    return visible.filter((r) => dispositions[r.id] === mine);
  }, [allRows, dispositions, showSnoozed, mine]);

  // Stations the search matched that this queue cannot structurally contain.
  const elsewhere = useMemo(
    () => matchesOutsideQueue(lanes, filters.search, filters.borough),
    [lanes, filters.search, filters.borough],
  );

  const [page, setPage] = useState(0);

  // Any change to the filters invalidates the page number.
  useEffect(() => setPage(0), [filters]);

  const arrival = useArrival();
  const focusedRow = arrival.focus ? queue.find((r) => r.id === arrival.focus) : undefined;
  const focusIndex = arrival.focus ? queue.findIndex((r) => r.id === arrival.focus) : -1;

  // A link into a paginated list has to land on the right page, or it has not
  // arrived anywhere. Runs once per focus id so later paging is not fought.
  const jumped = useRef<string | null>(null);
  useEffect(() => {
    if (!arrival.focus || focusIndex < 0 || jumped.current === arrival.focus) return;
    jumped.current = arrival.focus;
    setPage(Math.floor(focusIndex / PAGE_SIZE));
  }, [arrival.focus, focusIndex]);

  const pageCount = Math.max(1, Math.ceil(queue.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = useMemo(
    () => queue.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [queue, safePage],
  );

  useScrollToFocus(arrival.focus, rows.length > 0);

  // Worst-first is the queue's order, so the head of it that nobody has
  // touched is the answer to "where does the next truck go".
  const nextUp = useMemo(
    () => queue.find((r) => !dispositions[r.id] && r.action && r.action.kind !== 'mechanic'),
    [queue, dispositions],
  );

  // Mechanical faults never reach this board at all — triage.ts routes them
  // to Maintenance before the queue ever sees them, on the reasoning that a
  // truck full of bikes cannot fix a dead dock. Correct, but it means a
  // station stuck for hours can sit off-screen with nothing here pointing at
  // it. This is the one thing that surfaces that gap back onto the page
  // everyone actually watches.
  const unflaggedFaults = useMemo(
    () => lanes.mechanic.filter((f) => !dispatched.includes(f.station.stationId)),
    [lanes.mechanic, dispatched],
  );
  const worstFault = useMemo(
    () =>
      unflaggedFaults.length === 0
        ? null
        : unflaggedFaults.reduce((oldest, f) =>
            (f.breakdown.staleness.ageMinutes ?? 0) > (oldest.breakdown.staleness.ageMinutes ?? 0)
              ? f
              : oldest,
          ),
    [unflaggedFaults],
  );

  const sort = (key: SortKey) =>
    setFilters(
      filters.sortKey === key
        ? { sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' }
        : { sortKey: key, sortDir: ALPHABETICAL.includes(key) ? 'asc' : 'desc' },
    );

  const feedIsStale =
    feedUpdatedMs !== null && fetchedAtMs !== null && fetchedAtMs - feedUpdatedMs > FEED_STALE_MS;
  const firstLoad = phase === 'loading' && lanes.truck.length === 0;

  return (
    <>
      <PageHeader
        title="Priority Queue"
        subtitle={
          summary
            ? `Every station a truck can fix, ranked by urgency — worst first. ${summary.total.toLocaleString('en-US')} stations monitored, refreshed every 60 seconds.`
            : 'Reading the live feed…'
        }
      />

      <PageBody>
        {arrival.focus && arrival.from && (
          <ArrivalBanner
            from={arrival.from}
            back={arrival.back}
            detail={
              focusedRow
                ? `showing ${focusedRow.name}`
                : 'that station is not in the current queue view — it may be filtered out, snoozed, or not currently above the threshold'
            }
            onDismiss={arrival.dismiss}
          />
        )}

        {(error || feedIsStale) && (
          <div className="mb-3 flex flex-col gap-2">
            {error && (
              <Banner tone="empty" icon="alert-triangle">
                Feed unreachable ({error.message})
                {fetchedAtMs !== null && <> — showing data from {formatClock(fetchedAtMs)}</>}.
                Retrying automatically.
              </Banner>
            )}
            {feedIsStale && feedUpdatedMs !== null && (
              <Banner tone="warn" icon="info">
                The operator&rsquo;s own feed was last updated at {formatClock(feedUpdatedMs)}. Every
                count below is at least that old.
              </Banner>
            )}
          </div>
        )}

        {worstFault && (
          <div className="mb-3">
            <Finding
              icon="wrench"
              tone="empty"
              headline={
                unflaggedFaults.length === 1
                  ? '1 station needs a mechanic, not a truck — nobody has flagged it yet.'
                  : `${unflaggedFaults.length} stations need a mechanic, not a truck — none flagged yet.`
              }
              detail={
                <>
                  Worst is {worstFault.station.name} ({worstFault.station.borough}) —{' '}
                  {mechanicFault(worstFault).toLowerCase()}, reported{' '}
                  {formatReportedAge(worstFault.breakdown.staleness.ageMinutes)}. Stations like this
                  never appear in the board below; a truck full of bikes cannot fix a dead dock.{' '}
                  <Link
                    to={focusHref('/mechanics', worstFault.station.stationId, 'Priority Queue', '/')}
                    className="font-medium underline underline-offset-2"
                    style={{ color: TONE.empty.fg }}
                  >
                    Open in Maintenance →
                  </Link>
                </>
              }
            />
          </div>
        )}

        <StatRow summary={summary} onClear={resetFilters} onOnly={(c) => setFilters({ categories: [c] })} />

        {/* `items-start` matters: grid rows stretch their children by default,
            so the table card grew to match the taller rail beside it and ended
            with a slab of empty white under the pagination. Cards should be as
            tall as what is in them; leftover room is canvas, not card.

            The rail was 168px in the comp, sized around three-digit fixtures.
            Live figures are four digits and the score-band labels are real
            sentences, so it needs the room. */}
        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
          {/* One strip. Everything that narrows the table, plus the action you
              take once it is narrowed, in the order you use them: find it,
              scope it, then dispatch. The "Filter by status" eyebrow the comp
              carried is gone — five dotted chips with counts do not need
              labelling, and dropping it is what fits the row on one line. */}
          {/* Column one, same as the board. It used to span both columns, which
              put its right edge — and so the Dispatch Truck button — 240px past
              the table it filters, out beyond the rail. A control bar wider than
              the thing it controls reads as belonging to the page rather than to
              the table, which is the wrong claim: every control in here narrows
              the rows below and nothing else on the screen.

              Placed explicitly rather than wrapped in a flex column, so the rail
              can still span both rows beside it. */}
          <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 xl:col-start-1 xl:row-start-1">
            <SearchInput
              value={filters.search}
              onChange={(v) => setFilters({ search: v })}
              placeholder="Search station or address…"
              width={220}
            />
            <Select
              label="Filter by borough"
              value={filters.borough}
              onChange={(v) => setFilters({ borough: v as Borough | 'all' })}
              options={[
                { value: 'all', label: 'All Boroughs' },
                ...BOROUGHS.filter((b) => b !== 'Unknown').map((b) => ({ value: b, label: b })),
              ]}
            />

            <span aria-hidden="true" className="h-[18px] w-px bg-[var(--color-line)]" />

            {/* The comp's "Filter by status" eyebrow was cut to fit this row on
                one line, and cutting it is what made the chips read as tabs —
                five dotted counts with no verb in front of them. "Show:" is the
                verb at a fifth of the width. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium text-[var(--color-ink-3)]">Show:</span>
              {CHIPS.map((c) => (
                <FilterChip
                  key={c.key}
                  label={c.label}
                  count={summary?.categoryCounts[c.key] ?? 0}
                  tone={c.tone}
                  active={filters.categories.includes(c.key)}
                  onClick={() => toggleCategory(c.key)}
                />
              ))}
              <Link
                to="/unverified"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-[5px] text-[11px] font-medium text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              >
                <Dot tone="mute" size={5} />
                Unverified
                <span className="num rounded-full bg-[var(--color-sunken)] px-1.5 py-px text-[10px] text-[var(--color-ink-3)]">
                  {summary?.unverified ?? 0}
                </span>
              </Link>
            </div>

            {/* Your own decisions are a filter too — working a list of 700
                means being able to hide what you have already dealt with.

                Every option names the column it filters. It previously said
                "Any disposition" while the column header said something else, so
                two labels described one thing and neither pointed at the
                other. */}
            <Select
              label="Filter by your decision on each station"
              value={mine}
              onChange={(v) => setMine(v as typeof mine)}
              options={[
                { value: 'all', label: 'Decision: any' },
                { value: 'unhandled', label: 'Decision: not set' },
                ...(Object.keys(DISPOSITION_LABEL) as Disposition[]).map((d) => ({
                  value: d,
                  label: `Decision: ${DISPOSITION_LABEL[d].toLowerCase()}`,
                })),
              ]}
            />

            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-[10px] whitespace-nowrap text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              >
                <Icon name="rotate-ccw" size={11} />
                Clear
              </button>
              {/* "Dispatch at ≥ 55" used to sit here, opening the method sheet.
                  It had been fought twice already — divided off from Clear,
                  its icon changed from a funnel to a document — and still read
                  as a setting, because both patches treated the symptom. The
                  cause was that one control was doing two unrelated jobs: it
                  stated a fact about how the board ranks, and it was the door
                  to a reference document. Neither is a filter, and this row is
                  filters.

                  Both moved to the footer, where the other facts about the
                  board live, and split apart: the threshold is now text, and
                  the door is named after the room it opens. */}
              {/* Dispatches the worst station nobody has acted on yet — the
                  answer to "just tell me where to send the next truck". */}
              <Button
                variant="dark"
                icon="truck"
                size="sm"
                onClick={() => nextUp && setComposing(nextUp)}
                title={
                  nextUp
                    ? `Dispatch a truck to ${nextUp.name} — the worst station not yet actioned`
                    : 'Nothing outstanding to dispatch'
                }
              >
                Dispatch Truck
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden xl:col-start-1 xl:row-start-2">
            <div className="overflow-x-auto">
              {/* `table-fixed` stays, even though paging no longer strictly
                  needs it.

                  Under the default `table-layout: auto` the browser sizes each
                  column from the rows currently in the DOM, so the widths are
                  really a property of the page you happen to be on: turning to
                  a page holding a long station name reflows the whole grid.
                  Windowing made that violent enough to see as flashing, but it
                  was always there, just quieter — one jump per page turn
                  instead of one per scroll.

                  Fixed layout takes the widths from the `<th>`s alone, so the
                  grid is decided before a single row renders and holds across
                  every page. `minWidth` keeps the columns from crushing on a
                  narrow viewport; the container scrolls sideways instead. */}
              <table
                className="w-full table-fixed border-collapse text-left"
                style={{ minWidth: TABLE_MIN_WIDTH }}
              >
                <caption className="sr-only">
                  Stations a truck can fix, ranked by urgency, worst first. Select a row to see how
                  its score was calculated.
                </caption>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => {
                      const key = col.key;
                      return (
                        <Th
                          key={col.label}
                          width={col.width}
                          align={col.align}
                          onSort={key ? () => sort(key) : undefined}
                          active={key !== undefined && filters.sortKey === key}
                          dir={filters.sortDir}
                          help={col.help ? COLUMN_HELP[col.help] : undefined}
                        >
                          {col.label}
                        </Th>
                      );
                    })}
                    <Th width={DISPOSITION_COL_WIDTH} help={COLUMN_HELP.disposition}>
                      Decision
                    </Th>
                  </tr>
                </thead>

                {firstLoad ? (
                  <SkeletonRows rows={8} cols={COLUMNS.length} />
                ) : (
                  <tbody>
                    {rows.map((row) => (
                      <QueueRow
                        key={row.id}
                        row={row}
                        selected={openStationId === row.id}
                        focused={arrival.focus === row.id}
                        run={latestRunFor(runs, row.id) ?? undefined}
                        onOpen={() => openStation(row.id)}
                      />
                    ))}
                  </tbody>
                )}
              </table>
            </div>

            {!firstLoad && queue.length === 0 && (
              <div className="border-t border-[var(--color-line)] px-4 py-10 text-center">
                <p className="text-[12px] text-[var(--color-ink-2)]">
                  No station a truck can fix matches the current filters.
                </p>
                <Button className="mt-3" onClick={resetFilters}>
                  Clear all filters
                </Button>
              </div>
            )}

            <OffQueueHits matches={elsewhere} search={filters.search} />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] px-3 py-2.5">
              <p className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-[var(--color-ink-3)]">
                Showing {rows.length} of {queue.length.toLocaleString('en-US')} stations ·{' '}
                <span style={{ color: TONE.warn.fg }}>
                  {(summary?.needsTruck ?? 0).toLocaleString('en-US')} need a truck now
                </span>
                {snoozedCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setShowSnoozed((v) => !v)}
                      className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                    >
                      {showSnoozed
                        ? `hide ${snoozedCount} snoozed`
                        : `${snoozedCount} snoozed — show`}
                    </button>
                  </>
                )}

                {/* The rule this board ranks on, stated as a fact among the
                    other facts — not as a control that can be mistaken for a
                    filter, which is what it looked like up in the strip. */}
                <span aria-hidden="true">·</span>
                <span>
                  dispatch at ≥ <span className="num">{NEEDS_TRUCK_THRESHOLD}</span>
                </span>

                {/* Named after what it opens. The old trigger was labelled with
                    the threshold, so it announced a number and delivered a
                    document about ten of them. */}
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setMethod(true)}
                  title="Every constant behind the score, where it came from, and what moving it does."
                  className="inline-flex cursor-pointer items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                >
                  <Icon name="file-text" size={11} />
                  How scoring works
                </button>
              </p>
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
            </div>
          </Card>

          {/* The Score Guide card used to sit here. It was a second, hand-kept
              copy of the bands the Score column's ⓘ already published, so it is
              now only in the ⓘ — one list, derived from the two constants. */}
          <aside
            className="flex flex-col gap-3 xl:col-start-2 xl:row-start-1 xl:row-span-2"
            aria-label="Fleet and score reference"
          >
            <ActiveTrucks />
            <FillDistribution />
          </aside>
        </div>
      </PageBody>

      {composing && (
        <DispatchComposer row={composing} onClose={() => setComposing(null)} />
      )}
      {method && <MethodSheet onClose={() => setMethod(false)} />}
    </>
  );
}

/* -------------------------------------------------------------------------- */

type Summary = NonNullable<ReturnType<typeof useDispatch.getState>['summary']>;

/**
 * The six headline numbers.
 *
 * Every card carries three layers, because a number alone is a quiz: the
 * label says what it is in plain words, the footer says what it means for a
 * rider, and the hint says why the line is drawn where it is. None of them say
 * "empty side" or "score ≥ 55" — that is the model's vocabulary, and a
 * dispatcher should not have to learn it to read their own board.
 */
function StatRow({
  summary,
  onClear,
  onOnly,
}: {
  summary: Summary | null;
  onClear: () => void;
  onOnly: (c: StationCategory) => void;
}) {
  const dash = (n: number | undefined) => (summary ? (n ?? 0).toLocaleString('en-US') : '—');
  const share = (n: number | undefined) =>
    summary && summary.total > 0 ? `${Math.round(((n ?? 0) / summary.total) * 100)}% of the network` : '—';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Needs a truck"
        value={dash(summary?.needsTruck)}
        tone="empty"
        foot={share(summary?.needsTruck)}
        onClick={onClear}
        actionLabel="Clear all status filters."
        hint={`Stations urgent enough to send a vehicle to — urgency ${NEEDS_TRUCK_THRESHOLD} or above out of 100. Below that a station is drifting but still serving riders, so it stays on the list without demanding a trip.`}
      />
      <StatCard
        label="Short on bikes"
        value={dash(summary?.emptySide)}
        tone="empty"
        foot="riders may find none to take"
        onClick={() => onOnly('empty')}
        actionLabel="Show only stations short on bikes."
        hint="Empty, or nearly. Somebody walking up wants a bike and there may not be one. A truck fixes this by dropping bikes off."
      />
      <StatCard
        label="Short on docks"
        value={dash(summary?.fullSide)}
        tone="flood"
        foot="riders may find nowhere to park"
        onClick={() => onOnly('full')}
        actionLabel="Show only stations short on docks."
        hint="Full, or nearly. Somebody arriving with a bike may have nowhere to leave it and has to ride on. A truck fixes this by picking bikes up — the opposite trip."
      />
      <StatCard
        label="Trucks out"
        value="5/8"
        foot="3 idle at depots"
        to="/trucks"
        actionLabel="Open fleet operations."
        hint="Vehicles currently on the road out of the total fleet. Fixture — the public feed carries no vehicles."
      />
      <StatCard
        label="Not reporting"
        value={dash(summary?.unverified)}
        tone={summary && summary.unverified > 0 ? 'warn' : 'ink'}
        foot="silent over an hour"
        to="/unverified"
        actionLabel="Open unverified stations."
        hint="Stations that have not checked in for more than an hour. Their bike counts cannot be trusted, so they are left out of the ranking entirely rather than sending a truck on a stale reading."
      />
      <StatCard
        label="Network fill"
        value={summary?.networkFill == null ? '—' : Math.round(summary.networkFill * 100)}
        unit={summary?.networkFill == null ? undefined : '%'}
        foot="50% is balanced"
        bar={{ value: summary?.networkFill ?? 0, tone: 'ok' }}
        to="/analytics"
        actionLabel="Open network performance."
        hint="Share of usable slots across the city that currently hold a bike. At 50% the network has roughly as many bikes to lend as spaces to park. Well above means docks are scarce; well below means bikes are."
      />
    </div>
  );
}

function QueueRow({
  row,
  selected,
  focused = false,
  run,
  onOpen,
}: {
  row: StationRow;
  selected: boolean;
  focused?: boolean;
  run?: DispatchRun;
  onOpen: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      data-focus-id={row.id}
      className={cn(
        'group cursor-pointer border-b border-[var(--color-line-soft)] transition-colors last:border-b-0',
        selected || focused ? 'bg-[var(--color-sunken)]' : 'hover:bg-[var(--color-sunken)]',
      )}
      style={
        focused ? { boxShadow: `inset 3px 0 0 ${TONE.flood.fg}` } : undefined
      }
    >
      <Td>
        <ScorePeek breakdown={row.breakdown} duration={row.duration} onOpen={onOpen} />
      </Td>

      <Td>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block min-w-0 cursor-pointer text-left"
        >
          <span
            className={cn(
              'block truncate text-[12px] font-semibold',
              row.score === null ? 'text-[var(--color-ink-2)]' : 'text-[var(--color-ink)]',
            )}
          >
            {row.name}
          </span>
          {row.warning ? (
            <span className="mt-px flex items-center gap-1 text-[10px]" style={{ color: TONE.empty.fg }}>
              <Icon name="info" size={10} />
              {row.warning}
            </span>
          ) : (
            <span className="mt-px block text-[10px] text-[var(--color-ink-3)]">
              {row.borough} · <span className="num">{row.docks}</span> docks
            </span>
          )}
        </button>
      </Td>

      <Td className="text-[11px] text-[var(--color-ink-2)]">{row.borough}</Td>

      <Td>
        <span className="slash-pair num w-[72px] text-[11px] text-[var(--color-ink)]">
          <span>{row.bikes === null ? '—' : row.bikes}</span>
          <span className="px-1 text-[var(--color-ink-3)]">/</span>
          <span className="text-[var(--color-ink-2)]">{row.openDocks ?? row.docks}</span>
        </span>
      </Td>

      <Td>
        <Bar value={row.fill} tone={row.fillTone} height={4} />
        {row.fillLabel && (
          <span className="num mt-1 block text-[10px] text-[var(--color-ink-3)]">{row.fillLabel}</span>
        )}
      </Td>

      <Td>
        <StatusPill label={row.status} />
        <ActionHint row={row} />
      </Td>

      {/* Two different facts, deliberately not stacked as equals: when the
          station last spoke, and how long it has been broken. A station can be
          reporting perfectly and four hours empty. */}
      <Td>
        <span className="num block text-[10px] text-[var(--color-ink-3)]">{row.updated}</span>
        {row.duration?.confident && (
          <span
            className="num mt-1 block text-[10px] font-medium"
            style={{ color: TONE.warn.fg }}
          >
            {row.status} {formatAgo(row.duration.minutes * 60_000)}
          </span>
        )}
      </Td>

      <Td>
        <DispositionCell row={row} />
        {run && (
          <span className="mt-1 block">
            <OutcomeChip run={run} />
          </span>
        )}
      </Td>
    </tr>
  );
}

/**
 * "It exists, just not here."
 *
 * A search that quietly returns nothing cannot be distinguished from a search
 * for a station that does not exist. These are real matches the queue is not
 * allowed to show — a truck cannot fix them — so rather than leak them into
 * the rebalancing list, the queue names them and points at the screen that
 * owns them.
 */
function OffQueueHits({
  matches,
  search,
}: {
  matches: ReturnType<typeof matchesOutsideQueue>;
  search: string;
}) {
  const openStation = useConsole((s) => s.openStation);
  if (!search.trim() || matches.total === 0) return null;

  const groups = [
    {
      rows: matches.mechanic,
      label: 'need a mechanic',
      why: 'out of service — a truck cannot fix these',
      to: '/mechanics',
      linkLabel: 'Maintenance Ops',
      tone: 'empty' as Tone,
    },
    {
      rows: matches.unverified,
      label: 'are not reporting',
      why: 'silent too long to score',
      to: '/unverified',
      linkLabel: 'Unverified Stations',
      tone: 'warn' as Tone,
    },
    {
      rows: matches.quiet,
      label: 'are healthy',
      why: 'nothing wrong with them',
      to: null,
      linkLabel: null,
      tone: 'ok' as Tone,
    },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="border-t border-[var(--color-line)] bg-[var(--color-sunken)] px-3 py-2.5">
      <p className="text-[10px] text-[var(--color-ink-2)]">
        <strong className="font-semibold text-[var(--color-ink)]">
          {matches.total} more match{matches.total === 1 ? '' : 'es'}
        </strong>{' '}
        for “{search.trim()}” outside this queue:
      </p>

      <ul className="mt-1.5 flex flex-col gap-1.5">
        {groups.map((g) => (
          <li key={g.label} className="flex flex-wrap items-baseline gap-x-2 text-[10px]">
            <span className="num font-semibold" style={{ color: TONE[g.tone].fg }}>
              {g.rows.length}
            </span>
            <span className="text-[var(--color-ink-2)]">
              {g.label} — {g.why}
            </span>
            {g.to && (
              <Link
                to={g.to}
                className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                style={{ color: TONE[g.tone].fg }}
              >
                open {g.linkLabel}
              </Link>
            )}
            <span className="text-[var(--color-ink-3)]">
              ·{' '}
              {g.rows.slice(0, 2).map((s, i) => (
                <button
                  key={s.station.stationId}
                  type="button"
                  onClick={() => openStation(s.station.stationId)}
                  className="cursor-pointer underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                >
                  {i > 0 && ', '}
                  {s.station.name}
                </button>
              ))}
              {g.rows.length > 2 && ` and ${g.rows.length - 2} more`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The one editable cell on the board.
 *
 * A native select, deliberately: every other cell in this table is a derived
 * value rendered as text or a badge, so an input has to look like an input or
 * it will be read as another thing the feed decided.
 *
 * Quiet styling was not enough. A screenful of dropdowns reading "Not set" is a
 * column of chrome saying nothing, competing with the station names for the
 * eye — so an undecided row shows a dash and grows its control on hover.
 *
 * The select stays mounted and focusable underneath rather than being swapped
 * in on hover, and the reveal keys on `focus-within` as well as `hover`. Hiding
 * a form control behind a pointer event is how a table stops being reachable by
 * keyboard, and this is the only cell here anyone can actually change.
 */
function DispositionCell({ row }: { row: StationRow }) {
  const dispositions = useConsole((s) => s.dispositions);
  const setDisposition = useConsole((s) => s.setDisposition);
  const current = dispositions[row.id];

  return (
    <span className="relative block">
      {!current && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center px-1.5 text-[11px] text-[var(--color-ink-3)] transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
        >
          —
        </span>
      )}
      <select
        value={current ?? ''}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          setDisposition(row.id, row.name, (e.target.value || null) as Disposition | null);
        }}
        aria-label={`Your decision for ${row.name}`}
        className={cn(
          'w-full cursor-pointer rounded-md border px-1.5 py-1 text-[10px] transition-[opacity,color,border-color]',
          current
            ? 'border-[var(--color-line)] bg-[var(--color-sunken)] font-medium text-[var(--color-ink)]'
            : 'border-dashed border-[var(--color-line)] bg-transparent text-[var(--color-ink-3)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:border-[var(--color-ink-3)] focus:opacity-100',
        )}
      >
        <option value="">Not set</option>
        {(Object.keys(DISPOSITION_LABEL) as Disposition[]).map((d) => (
          <option key={d} value={d}>
            {DISPOSITION_LABEL[d]}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * The instruction under the diagnosis.
 *
 * The fleet panel has always said "drop 60 bikes"; the queue — the screen
 * somebody actually works from — said only "Empty", leaving the reader to
 * infer both the direction and the amount. Same computation, surfaced where
 * the work happens.
 */
function ActionHint({ row }: { row: StationRow }) {
  const action = row.action;
  if (!action || action.kind === 'none') return null;

  if (action.kind === 'mechanic') {
    return (
      <Link
        to="/mechanics"
        onClick={(e) => e.stopPropagation()}
        className="mt-1 block text-[10px] underline-offset-2 hover:underline"
        style={{ color: TONE.empty.fg }}
      >
        no truck can fix
      </Link>
    );
  }

  const drop = action.kind === 'drop';
  return (
    <span
      className="num mt-1 block text-[10px]"
      style={{ color: drop ? TONE.empty.fg : TONE.flood.fg }}
    >
      {drop ? 'drop' : 'collect'} ~{action.bikes}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   The rail.
--------------------------------------------------------------------------- */

function RailLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
    >
      <Icon name="chevron-right" size={13} />
    </Link>
  );
}

/** Fixtures: the feed carries no vehicles. Labelled as such on the card. */
const RAIL_TRUCK_IDS = ['#4', '#7', '#2'];

function ActiveTrucks() {
  const shown = RAIL_TRUCK_IDS.map((id) => TRUCKS.find((t) => t.id === id)!).filter(Boolean);

  return (
    <Card>
      <CardHead title="Active trucks" right={<RailLink to="/trucks" label="Open fleet operations" />} />
      <ul className="px-3.5 pb-2">
        {shown.map((truck, i) => (
          <li
            key={truck.id}
            className={cn('py-2.5', i > 0 && 'border-t border-[var(--color-line-soft)]')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="num text-[12px] font-semibold text-[var(--color-ink)]">
                Truck {truck.id}
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-medium whitespace-nowrap"
                style={{ color: TONE[TRUCK_STATE_TONE[truck.state]].fg }}
              >
                <Dot tone={TRUCK_STATE_TONE[truck.state]} size={5} />
                {TRUCK_STATE_LABEL[truck.state]}
              </span>
            </div>
            <p className="mt-1 text-[10.5px] leading-snug text-[var(--color-ink-2)]">
              {truck.where}
            </p>
            {truck.when && (
              <p className="num mt-0.5 text-[10px] text-[var(--color-ink-3)]">{truck.when}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="border-t border-[var(--color-line-soft)] px-3.5 py-2 text-[10px] leading-snug text-[var(--color-ink-3)] italic">
        Fixture — the feed carries no vehicles.
      </p>
    </Card>
  );
}

function FillDistribution() {
  const summary = useDispatch((s) => s.summary);

  const slices = summary
    ? [
        { label: 'Healthy', value: summary.categoryCounts.healthy, tone: 'ok' as Tone },
        { label: 'Low stock', value: summary.categoryCounts.starving, tone: 'warn' as Tone },
        { label: 'Empty', value: summary.categoryCounts.empty, tone: 'empty' as Tone },
        { label: 'Flooded', value: summary.categoryCounts.flooded, tone: 'flood-soft' as Tone },
        { label: 'Full', value: summary.categoryCounts.full, tone: 'flood' as Tone },
        { label: 'Unverified', value: summary.unverified, tone: 'mute' as Tone },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <Card>
      <CardHead
        title="Fill distribution"
        right={<RailLink to="/analytics" label="Open network performance" />}
      />
      <div className="flex items-center gap-3 px-3.5 pb-4">
        {slices.length > 0 ? (
          <>
            <Donut
              slices={slices}
              size={92}
              thickness={16}
              centerValue={(summary?.total ?? 0).toLocaleString('en-US')}
              centerLabel="STATIONS"
            />
            <Legend slices={slices} direction="column" size={10} />
          </>
        ) : (
          <p className="py-4 text-[10px] text-[var(--color-ink-3)]">Waiting for the first poll…</p>
        )}
      </div>
    </Card>
  );
}

