import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import {
  ArrivalBanner,
  Banner,
  Button,
  Card,
  Dot,
  FilterChip,
  Pagination,
  SearchInput,
  Select,
  SkeletonRows,
  StatusPill,
  Td,
  Th,
} from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { ScorePeek } from '../ui/ScorePeek';
import { OutcomeChip } from './DispatchHistory';
import { latestRunFor, outcomeOf, type DispatchRun } from '../data/dispatchRun';
import { COLUMN_HELP } from '../content/columns';
import { SituationFinding } from '../content/situation';
import { matchesOutsideQueue, networkDocks } from '../data/insights';
import { assessSituation } from '../model/situation';
import { backlog } from '../model/workOrder';
import { hardwareLoad, hardwareTotals } from '../data/hardware';
import { DISPOSITION_LABEL, useConsole, type Disposition } from '../state/useConsole';
import { toStationRow } from '../data/adapt';
import type { StationRow } from '../data/stationRow';
import { BOROUGHS, type Borough } from '../data/boroughs';
import type { StationCategory } from '../model/score';
import { applyFilters } from '../model/queue';
import { QueueStats } from './QueueStats';
import { FEED_STALE_MS, useDispatch, type SortKey } from '../store/useDispatch';
import { formatClock } from '../lib/time';
import { durationIndex } from '../data/duration';
import { TREND_RANK, trendIndex, type Trend } from '../model/verify';
import { useSessionHistory } from '../state/useHistory';
import { useArrival, useScrollToFocus } from '../state/useFocus';
import { cn } from '../lib/cn';

/**
 * The board, on live data.
 *
 * Rows come from the vehicle lane in `useDispatch` through the adapter — the
 * stations a vehicle can actually fix, worst first. Mechanical failures and
 * unreadable stations are not filtered out here; they were routed to their own
 * screens by `triage.ts` before this component ever sees them.
 *
 * The 240px summary rail is gone and the table has the full page. Every card on
 * it — Shift, Active vehicles, Maintenance, Fill distribution — restated a
 * screen that already owns the number at full size, so they went back to Fleet
 * and Maintenance; the fill donut was dropped rather than moved, being a shape
 * nobody acts on from a worst-first queue.
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
 * Four real filters over the vehicle lane's four categories, and one link.
 * "Unverified" cannot filter this table — those stations are excluded from the
 * vehicle lane by definition — so it goes where they actually live.
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
  // "Urgency", not "Score". A bare score conventionally means higher-is-better
  // — a credit score, a test result — so a column headed SCORE showing 91 on
  // the worst station in the network reads backwards, and the fix is the word
  // rather than the scale. Nobody misreads high urgency as good news.
  //
  // Every column carries a width now, Station included. Leaving one blank made
  // it the sole absorber of leftover space, so on a wide screen the entire
  // surplus — nearly 400px — piled up between a station name and the borough
  // beside it while every other column stayed cramped. Widths that sum under
  // the table's own width get scaled up together by the fixed-layout algorithm,
  // which spreads that slack across all eight instead of dumping it in one.
  //
  // 112 rather than 92: the header is the widest thing in this column, and
  // "URGENCY" plus a sort caret plus a help icon ran the full 92 with nothing
  // left, so the label sat flush against STATION.
  { key: 'score', label: 'Urgency', width: 150, help: 'score' },
  // Widest column, because it holds the longest strings — and it carries the
  // borough now too, in the "{borough} · N docks" line under the name. A
  // dedicated Borough column was a full stack of the word "Manhattan" doing a
  // narrowing job the dropdown above the table already does; the `borough` sort
  // key stays in `SortKey` / `valueFor` if a borough-first reading is ever
  // wanted back.
  { key: 'name', label: 'Station', width: 300 },
  // Counts and Fill were two columns sharing one order — "Fill *is* bikes over
  // slots" — which made them two headers for one sort. Now one column: the
  // "bikes / open" pair, sorted by fill. The bar that used to sit beside the
  // numbers was dropped — the pair already tells the balance story. Headed
  // "Docks" (which of the two numbers is the open one is left to the ⓘ) rather
  // than "Bikes / Open", which read as a two-word label for one column.
  { key: 'fill', label: 'Bikes / Free', width: 150, help: 'docks' },
  // The instruction, not the diagnosis. Read but not orderable: sorting by "how
  // many bikes" would rank a 40-bike surplus above a station with nothing at
  // all, which is the opposite of worst-first.
  { label: 'Move', width: 130, help: 'move' },
  // Just the status pill now — the "collect ~50" instruction that used to share
  // this cell moved to the drawer. 200px for a 60px pill left a canyon between
  // this header and the next; sized for the header now.
  { key: 'category', label: 'Status', width: 116, help: 'status' },
  // Just the feed heartbeat now — a coloured dot and "3m ago". The failing
  // duration that used to share this cell moved to the score receipt.
  { key: 'reported', label: 'Updated', width: 112, help: 'updated' },
];

/** Columns whose values are words: A→Z is the useful first click, not Z→A. */
const ALPHABETICAL: SortKey[] = ['name'];

/** Appended after the derived columns — see DispositionCell. */
const DISPOSITION_COL_WIDTH = 124;

/**
 * The width below which the container scrolls sideways instead of squeezing.
 *
 * Summed rather than written down, so adding a column cannot silently leave the
 * table too narrow for its own fixed layout. Every column declares a width now,
 * so this is simply their total: above it the fixed-layout algorithm scales
 * them all up in proportion, below it the horizontal scrollbar appears.
 */
const TABLE_MIN_WIDTH =
  COLUMNS.reduce((total, c) => total + (c.width ?? 0), 0) + DISPOSITION_COL_WIDTH;

export function PriorityQueue() {
  const phase = useDispatch((s) => s.phase);
  const lanes = useDispatch((s) => s.lanes);
  const summary = useDispatch((s) => s.summary);
  const scored = useDispatch((s) => s.scored);
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
  const triage = useConsole((s) => s.triage);
  const runs = useConsole((s) => s.runs);
  const dispatched = useConsole((s) => s.dispatched);
  const workOrders = useConsole((s) => s.workOrders);
  const [showSnoozed, setShowSnoozed] = useState(false);

  const history = useSessionHistory();
  const { tracks } = history;
  const durations = useMemo(() => durationIndex(tracks), [tracks]);
  const trends = useMemo(() => trendIndex(tracks), [tracks]);


  // The situation headline — the single worst thing on the network right now,
  // ranked by severity across every lane. See src/model/situation.ts.
  const activeRunIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of runs) if (r.completedAt === null) ids.add(r.stationId);
    for (const [id, d] of Object.entries(dispositions)) if (d === 'dispatched') ids.add(id);
    return ids;
  }, [runs, dispositions]);
  const raisedFaultIds = useMemo(() => new Set(dispatched), [dispatched]);
  const situationNow = fetchedAtMs ?? Date.now();
  const hardware = useMemo(
    () => hardwareTotals(hardwareLoad(scored, situationNow)),
    [scored, situationNow],
  );

  // The mechanic's open backlog, for the stat row. Clocked off the wall rather
  // than the feed so its breach count matches the Maintenance rail card below,
  // which does the same — one screen must not disagree with itself about how
  // many orders have blown their target.
  const maintenanceNow = Date.now();
  const maintenance = useMemo(
    () => backlog(workOrders, maintenanceNow),
    [workOrders, maintenanceNow],
  );
  const situation = useMemo(
    () =>
      assessSituation({
        phase,
        summary,
        lanes,
        networkDocks: networkDocks(scored),
        hardware,
        tracks,
        durations,
        activeRunIds,
        raisedFaultIds,
      }),
    [phase, summary, lanes, scored, hardware, tracks, durations, activeRunIds, raisedFaultIds],
  );

  const filtered = useMemo(() => applyFilters(lanes, filters), [lanes, filters]);

  /**
   * Rows carry their duration-adjusted score, so the whole filtered lane is
   * re-ranked before paging. Adjusting only the visible page would mean a
   * station long overdue on page four never climbs onto page one — which is
   * precisely the failure duration was added to fix.
   */
  const allRows: StationRow[] = useMemo(() => {
    const mapped = filtered.map((entry) =>
      toStationRow(
        entry,
        durations.get(entry.station.stationId),
        situationNow,
        triage,
        trends.get(entry.station.stationId),
      ),
    );

    if (filters.sortKey !== 'score') return mapped;

    /**
     * Response state changes the *order*, never the score.
     *
     * A station somebody is already driving to is not less broken, so folding
     * this into urgency would be the same category error as putting dead
     * stations in a rebalancing queue. But it is less *actionable* — and a
     * station where a vehicle already went and failed is more so, because the
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

      const byScore = dir * ((b.score ?? -1) - (a.score ?? -1));
      if (byScore !== 0) return byScore;

      /*
       * Ties are the common case, not the edge case.
       *
       * Every large station that is empty or full scores `70 x 1.25 = 87.5`,
       * so a full page can read 88 twelve times over and the ranking has
       * stopped ranking. Direction is the tiebreak: of two stations equally
       * bad right now, the one still sliding is the one to send to. It never
       * touches the score — a station is not more broken for trending, only
       * more urgent, and those are different questions.
       *
       * Unaffected by `dir`. Ascending urgency is a way of reading the same
       * board from the other end; it is not a request to be sent to the
       * recovering stations first.
       */
      const byTrend =
        TREND_RANK[a.trend?.direction ?? 'flat'] - TREND_RANK[b.trend?.direction ?? 'flat'];
      if (byTrend !== 0) return byTrend;

      // Last resort, so the order is stable across polls rather than shuffling
      // under the reader whenever two rows tie on everything above.
      return a.name.localeCompare(b.name);
    });
  }, [filtered, durations, trends, runs, filters.sortKey, filters.sortDir, situationNow, triage]);

  // Snoozing is a decision to stop being shown something. Hiding it is the
  // whole point — but silently, with no count and no way back, it becomes a
  // way to lose stations, so the footer always says how many are out of sight.
  const snoozedCount = useMemo(
    () => allRows.filter((r) => dispositions[r.id] === 'snoozed').length,
    [allRows, dispositions],
  );
  // A "Decision" select used to narrow this further — to one disposition, or to
  // the stations nobody had touched. Snoozing is the only one of those that has
  // to be honoured to keep the list workable, and it is handled right here with
  // a footer toggle that always says how many are hidden. The rest was a filter
  // over your own bookkeeping sitting in a row of filters about the network.
  const queue = useMemo(
    () =>
      showSnoozed ? allRows : allRows.filter((r) => dispositions[r.id] !== 'snoozed'),
    [allRows, dispositions, showSnoozed],
  );

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

  const sort = (key: SortKey) =>
    setFilters(
      filters.sortKey === key
        ? { sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' }
        : { sortKey: key, sortDir: ALPHABETICAL.includes(key) ? 'asc' : 'desc' },
    );

  const feedIsStale =
    feedUpdatedMs !== null && fetchedAtMs !== null && fetchedAtMs - feedUpdatedMs > FEED_STALE_MS;
  const firstLoad = phase === 'loading' && lanes.vehicle.length === 0;

  return (
    <>
      {/* The "How to read this page" banner used to sit below this, in a blue
          box, saying much the same thing at greater length and in the model's
          own vocabulary — drift off half-full, weighted capacity, jumping the
          line. Two explanations of one screen, stacked, the second dismissible
          and therefore usually dismissed. It is one explanation now, in the
          masthead where a reader already looks, short enough to finish. */}
      <PageHeader
        title="Rebalancing"
        subtitle={
          summary ? (
            <>
              {/* Two lines. A paragraph explaining the scoring model used to
                  sit between these two — read once on somebody's first day and
                  skipped every day after, while occupying the space above the
                  thing they came for. It is behind the "How scoring works"
                  link under the table, which is where a reader goes when they
                  actually want it. */}
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                Stations too empty or too full for riders, worst first.
              </span>
              <span className="mt-1 block text-[var(--color-ink-3)]">
                {summary.total.toLocaleString('en-US')} stations · refreshed every minute · broken
                and silent stations have their own screens
              </span>
            </>
          ) : (
            'Reading the live feed…'
          )
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

        <div className="mb-3">
          <SituationFinding situation={situation} />
        </div>

        <QueueStats
          summary={summary}
          hardware={hardware}
          maintenance={maintenance}
          history={history}
        />

        {/* One column, full width. This was a two-track grid with a 240px rail
            beside the table — Shift, Active vehicles, Maintenance and Fill
            distribution. Every one of them was a summary of a screen that says
            the same thing at full size, so they moved out to Fleet and
            Maintenance and the fill donut was dropped outright. With nothing
            left to sit beside, the table takes the whole page: a 240px reserve
            held open for cards that no longer exist is just a margin.

            The grid stays rather than becoming a plain stack so the filter bar
            and the table keep their `col-start-1` placement, and `items-start`
            still matters — rows stretch their children by default, and a card
            grown past its content ends in a slab of empty white. */}
        <div className="mt-3 grid items-start gap-3">
          {/* One strip. Everything that narrows the table, plus the action you
              take once it is narrowed, in the order you use them: find it,
              scope it, then dispatch. The "Filter by status" eyebrow the comp
              carried is gone — five dotted chips with counts do not need
              labelling, and dropping it is what fits the row on one line. */}
          <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <SearchInput
              value={filters.search}
              onChange={(v) => setFilters({ search: v })}
              placeholder="Search station or address…"
              width={196}
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
              {/* An "Unverified" chip stood here. It was a `<Link>` wearing the
                  exact costume of the four filters beside it while doing
                  something none of them do — leaving the page. The same
                  category error as the threshold button, one row down.

                  Not relocated, deleted: the count and the route both already
                  exist on the "Not reporting" stat card directly above, so this
                  was a second door to one room, in the wrong shape. */}
            </div>

            {/* A "Decision" select stood here, narrowing the board by your own
                disposition on each station. Every other control in this row
                describes the network; that one described your bookkeeping about
                it, which is a different axis wearing the same clothes.

                Snoozing was the case that actually mattered, and it is still
                honoured — hidden by default, with a footer toggle that names the
                count so nothing disappears silently. */}
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
              {/* A "Dispatch Vehicle" button stood here, sending to the worst
                  station nobody had actioned. It went for the reason the whole
                  strip has been shrinking: the table already answers the
                  question. The board is sorted worst-first, so the station the
                  button would have chosen is the row your eye lands on anyway,
                  and dispatching from that row carries the station's own
                  readiness checks instead of asking you to trust a shortcut.

                  What is left in this group is `Clear`, which is a filter
                  control in a row of filter controls. */}
            </div>
          </Card>

          <Card className="overflow-hidden">
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
                  Stations a vehicle can fix, ranked by urgency, worst first. Select a row to see how
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
                  <SkeletonRows rows={8} cols={COLUMNS.length + 1} />
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
                  No station a vehicle can fix matches the current filters.
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
                  {(summary?.needsVehicle ?? 0).toLocaleString('en-US')} need a vehicle now
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

                {/* "dispatch at >= 55" stood here, the last residue of a filter
                    chip that was killed for reading as a setting. Relocating it
                    made sense when there was nowhere better; there is now. The
                    same fact is carried by the badge colour, by two lines of the
                    Urgency help, and by a page devoted to it — and this was the
                    one telling of it with no context, a bare threshold on an
                    unnamed scale. Five copies of a constant is how a legend ends
                    up describing a different product than the one on screen. */}

                {/* Kept, but no longer the only way in. "Why is this 93?"
                    occurs to somebody looking at the URGENCY column, not at the
                    pagination four hundred rows below it, which is why nobody
                    found this. The column's own ⓘ now links to the same page. */}
                <span aria-hidden="true">·</span>
                <Link
                  to="/scoring"
                  title="Every constant behind the score, where it came from, and what moving it does."
                  className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                >
                  <Icon name="file-text" size={11} />
                  How scoring works
                </Link>
              </p>
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
            </div>
          </Card>

          {/* A 240px rail of five summary cards stood here and is gone. Score
              Guide duplicated the bands the Urgency ⓘ publishes; Shift and
              Active vehicles duplicated Fleet; Maintenance duplicated the
              Mechanics and Hardware screens, which state the same open-order
              and dead-dock figures at full size. Fill distribution was dropped
              outright — a donut of the whole network is not a thing you do
              anything about from a worst-first queue.

              A card that summarises another screen is a card whose only real
              content is "go look over there", which is what the sidebar is
              for. The page is the table now. */}
        </div>
      </PageBody>

      {/* The composer used to mount here too, for the strip's dispatch button.
          With that gone, the only route to it is a station's own drawer — which
          is where the readiness checks live, so there is now exactly one way to
          commit a vehicle rather than two that had to be kept in step.

          The method sheet used to mount here as well. It was several screens of
          reference material in a modal, which is a container for one decision —
          it is the Scoring page now, with a URL that can be linked and
          scrolled. */}
    </>
  );
}

/* -------------------------------------------------------------------------- */

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
        <span className="flex items-center gap-1.5">
          <ScorePeek
            breakdown={row.breakdown}
            duration={row.duration}
            signals={hardwareCounts(row)}
            onOpen={onOpen}
          />
          {/* "88 out of what?" was a real reader's first question, and the
              badge alone could not answer it — twelve bare numbers in a column
              teach a scale to nobody who does not already have one. The
              denominator is four characters and it is only ever read once. */}
          {row.score !== null && (
            <span className="num text-[9.5px] leading-none text-[var(--color-ink-3)]">/100</span>
          )}
          <TrendArrow trend={row.trend} />
        </span>
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
            /*
             * The dock count says how many docks *work*, not how many exist,
             * whenever those differ.
             *
             * A row reading "1 / 0 - Full" over a subtitle saying "87 docks"
             * looks like a bug, and a reader who thinks the tool is broken
             * stops using it. Nothing was wrong: 86 of those docks are dead, so
             * the station really is full of its one working slot. But the row
             * published the nameplate — the one denominator CLAUDE.md forbids
             * using — and left the contradiction unexplained.
             *
             * Only when the two disagree. On a healthy station "87 docks" is
             * both true and shorter.
             */
            <span className="mt-px block truncate text-[10px] text-[var(--color-ink-3)]">
              {row.borough} · <DockCount row={row} />
            </span>
          )}
        </button>
      </Td>

      {/* Just the counts — the "bikes / open" pair reads the station's balance
          on its own, so the fill bar that used to sit beside it was noise.
          Plain left-aligned: an earlier version centred the pair on the slash,
          which pushed the first number rightward off the column's left edge so
          it no longer lined up with the "BIKES / OPEN" header above it. Tabular
          figures keep the slashes near enough without the grid. */}
      <Td>
        <span className="num text-[11px] text-[var(--color-ink)]">
          {row.bikes === null ? '—' : row.bikes}
          <span className="px-1 text-[var(--color-ink-3)]">/</span>
          <span className="text-[var(--color-ink-2)]">{row.openDocks ?? row.docks}</span>
        </span>
      </Td>

      {/* How many bikes, and which way.
          This lived inside the Status cell once, crammed beside the pill in
          200px, and was cut for good reason. It came back because it is the
          number a dispatcher plans a run from — without it the board can be
          read but not acted on, one station at a time through the drawer. The
          fix for a cramped cell was a column of its own, which the page had no
          room for until the summary rail came out. */}
      <Td>
        <MoveCell row={row} />
      </Td>

      {/* Just the status. The instruction that used to trail the pill has its
          own column now. */}
      <Td>
        <StatusPill label={row.status} tone={row.fillTone} />
      </Td>

      {/* Just the feed heartbeat, colour-coded by the same grace window the
          score uses: green inside 15 min (taken at face value), amber once the
          reading is old enough to cost the station points, red past the hour.
          "Failing for Nh" used to ride this line too — a second clock that read
          as the same kind of age and confused people. It lives on the score
          receipt, where it is one input among four. */}
      <Td>
        <span
          className="num inline-flex items-center gap-1.5 whitespace-nowrap text-[10px]"
          style={{ color: TONE[updatedTone(row)].fg }}
        >
          <Dot tone={updatedTone(row)} size={5} />
          {row.updated}
        </span>
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
 * allowed to show — a vehicle cannot fix them — so rather than leak them into
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
      why: 'out of service — a vehicle cannot fix these',
      to: '/maintenance/orders',
      linkLabel: 'Maintenance Ops',
      tone: 'empty' as Tone,
    },
    {
      rows: matches.unverified,
      label: 'are not reporting',
      why: 'silent too long to score',
      to: '/monitoring/unverified',
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
      {/* Blank at rest, not an em-dash. Twelve dashes down a column is twelve
          marks saying "nothing here", which is what an empty cell already says
          more quietly. The select still fades in on hover, so the affordance is
          unchanged — only the placeholder is gone. */}
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
 * Freshness colour for the Updated cell, read straight off the model's own
 * staleness classification so the dot and the score's uncertainty penalty can
 * never disagree: `current` (≤15 min) is green, `aging` (15–60) is amber,
 * `stale`/`never-reported` red. No breakdown — a fixture row — stays neutral.
 */
function updatedTone(row: StationRow): Tone {
  switch (row.breakdown?.staleness.reason) {
    case 'current':
      return 'ok';
    case 'aging':
      return 'warn';
    case 'stale':
    case 'never-reported':
      return 'empty';
    default:
      return 'mute';
  }
}

/**
 * The dock count, stated as working slots whenever that differs from nameplate.
 *
 * `usableSlots` is `bikesAvailable + docksAvailable`, so dead docks and docks
 * jammed by a broken bike are already out of it — which is correct, and is why
 * a station with one working slot holding one bike is genuinely Full. The row
 * just never said so, and "1 / 0 - Full" over "87 docks" reads as arithmetic
 * that does not work.
 *
 * Only when the gap is wide enough to be the thing that confuses a reader.
 * Printing it on any disagreement at all was the first attempt and it fired on
 * five rows in six — almost every station has a dock or two out — which turned
 * a flag for the alarming case into a line of boilerplate that stopped being
 * read. "53 of 59" explains nothing anybody was puzzled by; "1 of 87" is the
 * whole answer to why the row looks broken.
 */
const DOCKS_USABLE_NOTE_BELOW = 0.8;

function DockCount({ row }: { row: StationRow }) {
  const capacity = row.raw?.capacity ?? row.docks;
  const usable = row.raw?.usableSlots;

  if (usable === undefined || capacity <= 0 || usable / capacity >= DOCKS_USABLE_NOTE_BELOW) {
    return (
      <>
        <span className="num">{row.docks}</span> docks
      </>
    );
  }

  return (
    <span title={`${capacity - usable} of ${capacity} docks are out of service, so fill is measured against the ${usable} that work.`}>
      <span className="num">{usable}</span> of <span className="num">{capacity}</span> docks usable
    </span>
  );
}

/**
 * What a vehicle should do here, and how much of it.
 *
 * The direction carries the colour the rest of the board uses: warm for the
 * empty side, cool for the full side. A mechanic-lane station says so in words
 * rather than showing a bike count, because the count would be an instruction
 * nobody can carry out.
 */
function MoveCell({ row }: { row: StationRow }) {
  const a = row.action;

  if (a?.kind === 'mechanic') {
    return (
      <span className="text-[10px]" style={{ color: TONE.empty.fg }}>
        needs a mechanic
      </span>
    );
  }

  if (!a || a.kind === 'none' || a.bikes === 0) {
    return <span className="text-[10px] text-[var(--color-ink-3)]">\u2014</span>;
  }

  const drop = a.kind === 'drop';
  return (
    <span
      className="whitespace-nowrap text-[11px] font-medium"
      style={{ color: drop ? TONE.empty.fg : TONE.flood.fg }}
    >
      {drop ? 'drop off' : 'pick up'} <span className="num font-semibold">{a.bikes}</span>
    </span>
  );
}

/**
 * Which way the score has moved this session, as one glyph.
 *
 * The board ties constantly — a dozen rows reading 88 — and the tie is now
 * broken by direction, so the order is only honest if the reader can see the
 * thing it was broken on. Without this the queue silently ranks two identical
 * numbers and looks arbitrary doing it.
 *
 * Only worsening is coloured. A recovering station is good news on a screen
 * where every other colour means damage, and drawing it in green would put a
 * reassuring mark on a row still above the dispatch line. Flat renders nothing:
 * most rows are flat, and a column of grey dashes is the exact noise the
 * DECISION placeholder was just deleted for being.
 */
function TrendArrow({ trend }: { trend?: Trend | null }) {
  if (!trend || trend.direction === 'flat') return null;

  const worse = trend.direction === 'worsening';
  return (
    <span
      title={`${worse ? 'Worsening' : 'Improving'} \u2014 ${worse ? '+' : ''}${trend.delta} points since first seen this session`}
      aria-label={`${worse ? 'worsening' : 'improving'} by ${Math.abs(trend.delta)} points`}
      className="num shrink-0 text-[10px] leading-none font-semibold"
      style={{ color: worse ? TONE.empty.fg : 'var(--color-ink-3)' }}
    >
      {worse ? '\u25b2' : '\u25bc'}
    </span>
  );
}

/**
 * Dock and bike hardware the operator's own feed reports broken here.
 *
 * Had its own "Signals" column until the count of broken bikes read better as
 * one line of the score hover — it is a mechanic's problem, not a scoring
 * input, so it belongs beside the "why" rather than in a column of its own.
 * Still the same two fields the Hardware & Docks screen ranks stations by.
 */
function hardwareCounts(row: StationRow): { dead: number; broken: number } {
  return {
    dead: row.raw?.docksDisabled ?? 0,
    broken: row.raw?.bikesDisabled ?? 0,
  };
}

