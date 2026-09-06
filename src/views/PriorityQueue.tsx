import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Donut, Legend } from '../ui/charts';
import {
  ArrivalBanner,
  Banner,
  Button,
  Card,
  CardHead,
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
import { MethodSheet } from './MethodSheet';
import { COLUMN_HELP } from '../content/columns';
import { SituationFinding } from '../content/situation';
import { matchesOutsideQueue, networkDocks, rebalanceDemand } from '../data/insights';
import { SHIFTS, shiftCapacity } from '../model/roster';
import { assessSituation } from '../model/situation';
import { backlog } from '../model/workOrder';
import { hardwareLoad, hardwareTotals } from '../data/hardware';
import { DISPOSITION_LABEL, useConsole, type Disposition } from '../state/useConsole';
import { toStationRow } from '../data/adapt';
import type { StationRow } from '../data/stationRow';
import { BOROUGHS, type Borough } from '../data/boroughs';
import { NEEDS_VEHICLE_THRESHOLD, type StationCategory } from '../model/score';
import { applyFilters } from '../model/queue';
import { QueueStats } from './QueueStats';
import { FEED_STALE_MS, useDispatch, type SortKey } from '../store/useDispatch';
import { formatClock } from '../lib/time';
import { durationIndex } from '../data/duration';
import { useSessionHistory } from '../state/useHistory';
import { useArrival, useScrollToFocus } from '../state/useFocus';
import { ROSTER, VEHICLES, VEHICLE_STATE_LABEL, VEHICLE_STATE_TONE } from '../mock/data';
import { cn } from '../lib/cn';

/**
 * The board, on live data.
 *
 * Rows come from the vehicle lane in `useDispatch` through the adapter — the
 * stations a vehicle can actually fix, worst first. Mechanical failures and
 * unreadable stations are not filtered out here; they were routed to their own
 * screens by `triage.ts` before this component ever sees them.
 *
 * The rail's Active Vehicles card is still fixtures: GBFS has no vehicles, and
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
  { key: 'score', label: 'Urgency', width: 112, help: 'score' },
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
  { key: 'fill', label: 'Docks', width: 104, help: 'docks' },
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
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [method, setMethod] = useState(false);

  const history = useSessionHistory();
  const { tracks } = history;
  const durations = useMemo(() => durationIndex(tracks), [tracks]);


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
      toStationRow(entry, durations.get(entry.station.stationId), situationNow, triage),
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
      return dir * ((b.score ?? -1) - (a.score ?? -1));
    });
  }, [filtered, durations, runs, filters.sortKey, filters.sortDir, situationNow, triage]);

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
              <span className="block text-[13px] font-medium text-[var(--color-ink)]">
                Stations too empty or too full for riders, worst first.
              </span>
              <span className="mt-1 block">
                Every station scores 0–100 for how badly it needs a vehicle. At 55 it is worth the
                trip. Stations that are broken or have gone quiet are not here — a vehicle cannot fix
                those, so they have their own screens.
              </span>
              <span className="mt-1 block text-[var(--color-ink-3)]">
                {summary.total.toLocaleString('en-US')} stations · refreshed every minute
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

        <QueueStats summary={summary} hardware={hardware} history={history} />

        {/* `items-start` matters: grid rows stretch their children by default,
            so the table card grew to match the taller rail beside it and ended
            with a slab of empty white under the pagination. Cards should be as
            tall as what is in them; leftover room is canvas, not card.

            The rail was 168px in the comp, sized around three-digit fixtures.
            Live figures are four digits and the score-band labels are real
            sentences, so it needs the room.

            `grid-rows-[auto_1fr]` matters for the same reason, and the bug it
            fixes only appeared on an empty board. The rail spans both rows; when
            a grid item spans two `auto` tracks and is taller than their combined
            content, the excess is split evenly between them. With a full table
            the table's row is the tallest thing in the grid and there is no
            excess — but filter the queue down to nothing and the rail becomes
            the tallest, so half its surplus was handed to row one. The filter
            bar stayed pinned to the top of a suddenly 270px row and the table
            appeared to have sunk to the middle of the page. Making row two the
            flexible track sends the whole surplus there, where it is canvas
            below a short card instead of a hole above it. */}
        <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_240px] xl:grid-rows-[auto_1fr]">
          {/* One strip. Everything that narrows the table, plus the action you
              take once it is narrowed, in the order you use them: find it,
              scope it, then dispatch. The "Filter by status" eyebrow the comp
              carried is gone — five dotted chips with counts do not need
              labelling, and dropping it is what fits the row on one line. */}
          {/* Column one, same as the board. It used to span both columns, which
              put its right edge — and so the Dispatch Vehicle button — 240px past
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

                {/* The rule this board ranks on, stated as a fact among the
                    other facts — not as a control that can be mistaken for a
                    filter, which is what it looked like up in the strip. */}
                <span aria-hidden="true">·</span>
                <span>
                  dispatch at ≥ <span className="num">{NEEDS_VEHICLE_THRESHOLD}</span>
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
          {/* Ordered by how directly each answers "what should happen next".
              Whether the shift can clear the board comes before which vehicles
              are moving, which comes before the work a vehicle cannot do, which
              comes before the network's shape. Every card is a summary with a
              way through to the screen that owns it, so the rail is a set of
              doors rather than a set of readouts. */}
          <aside
            className="flex flex-col gap-3 xl:col-start-2 xl:row-start-1 xl:row-span-2"
            aria-label="Shift, fleet and network summary"
          >
            <ShiftCard />
            <ActiveVehicles />
            <MaintenanceCard />
            <FillDistribution />
          </aside>
        </div>
      </PageBody>

      {/* The composer used to mount here too, for the strip's dispatch button.
          With that gone, the only route to it is a station's own drawer — which
          is where the readiness checks live, so there is now exactly one way to
          commit a vehicle rather than two that had to be kept in step. */}
      {method && <MethodSheet onClose={() => setMethod(false)} />}
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
        <ScorePeek
          breakdown={row.breakdown}
          duration={row.duration}
          signals={hardwareCounts(row)}
          onOpen={onOpen}
        />
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
            // Hardware faults used to ride this line instead of the borough,
            // because the Status cell had no room for them. Now that they have
            // their own Signals column, this always reads the same way.
            <span className="mt-px block truncate text-[10px] text-[var(--color-ink-3)]">
              {row.borough} · <span className="num">{row.docks}</span> docks
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

      {/* Just the status. The "drop ~40 · +2 dead" instruction that used to
          trail the pill moved to the drawer's action card — in the queue it was
          restating the Urgency the row already earned. */}
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

/**
 * The number a rail card leads with.
 *
 * Every card in this column was a list before, which meant the answer to
 * "is this fine?" had to be assembled from three rows of prose. A figure, a
 * label, and one line of consequence is the smallest thing that answers it
 * from across the room.
 */
function RailStat({
  value,
  unit,
  label,
  tone = 'ink',
}: {
  value: string | number;
  unit?: string;
  label: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="px-3.5 pb-1">
      <p className="num text-[24px] leading-none font-semibold" style={{ color: TONE[tone].fg }}>
        {value}
        {unit && (
          <span className="ml-1 text-[12px] font-normal text-[var(--color-ink-3)]">{unit}</span>
        )}
      </p>
      <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--color-ink-2)]">{label}</p>
    </div>
  );
}

/**
 * Can this shift clear what is on the board?
 *
 * The method sheet argues capacity is the real constraint and the Shift screen
 * proves it with arithmetic. Neither is visible from the queue, which is the
 * screen where somebody is actually deciding what to do — so the answer lives
 * here too, in one line, with the working one click away.
 */
function ShiftCard() {
  const lane = useDispatch((s) => s.lanes.vehicle);
  const workOrders = useConsole((s) => s.workOrders);

  const now = Date.now();
  const demand = useMemo(() => rebalanceDemand(lane), [lane]);
  const activeCapacity = VEHICLES.filter((t) => t.state !== 'idle').reduce(
    (sum, t) => sum + t.capacity,
    0,
  );

  const cap = useMemo(
    () =>
      shiftCapacity(ROSTER, workOrders, {
        relocatable: demand.relocatable,
        vehicleCapacity: activeCapacity,
        date: new Date(now),
      }),
    [workOrders, demand.relocatable, activeCapacity, now],
  );

  const short = cap.shortfall !== null && cap.shortfall < 0;
  const label = SHIFTS.find((s) => s.key === cap.shift)?.label ?? cap.shift;

  return (
    <Card>
      <CardHead
        title={label}
        right={<RailLink to="/fleet/shift" label="Open the shift view" />}
      />
      <RailStat
        value={cap.runsAvailable}
        unit={cap.runsNeeded === null ? undefined : `of ${cap.runsNeeded} runs`}
        tone={short ? 'empty' : 'ok'}
        label={
          cap.runsNeeded === null
            ? 'No active vehicle capacity to divide the backlog into.'
            : short
              ? `Short by ${Math.abs(cap.shortfall ?? 0)}. The rest carries to the next shift.`
              : 'Enough to clear the rebalancing backlog.'
        }
      />
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-[var(--color-line-soft)] px-3.5 py-2 text-[10px]">
        <span className="text-[var(--color-ink-3)]">
          <span className="num text-[var(--color-ink-2)]">{cap.onShift.length}</span> of{' '}
          <span className="num">{ROSTER.length}</span> on shift
        </span>
        {cap.unassignable > 0 && (
          <span style={{ color: TONE.warn.fg }}>
            <span className="num">{cap.unassignable}</span> unassignable
          </span>
        )}
      </div>
    </Card>
  );
}

/**
 * Work a vehicle cannot do, summarised on the vehicle screen.
 *
 * The queue deliberately excludes hardware, which is correct and also means a
 * dispatcher can work this board all shift without ever learning that fifty
 * docks are dead across the network. The exclusion is a routing decision, not
 * a reason to hide the number.
 */
function MaintenanceCard() {
  const workOrders = useConsole((s) => s.workOrders);
  const scored = useDispatch((s) => s.scored);

  const now = Date.now();
  const stats = useMemo(() => backlog(workOrders, now), [workOrders, now]);
  const hardware = useMemo(() => hardwareTotals(hardwareLoad(scored, now)), [scored, now]);

  return (
    <Card>
      <CardHead
        title="Maintenance"
        right={<RailLink to="/maintenance/orders" label="Open maintenance operations" />}
      />
      <RailStat
        value={stats.open}
        unit={stats.open === 1 ? 'open order' : 'open orders'}
        tone={stats.breached > 0 ? 'empty' : 'ink'}
        label={
          stats.breached > 0
            ? `${stats.breached} past their response target.`
            : stats.open === 0
              ? 'Nothing outstanding.'
              : 'All inside their response target.'
        }
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--color-line-soft)] px-3.5 py-2 text-[10px] text-[var(--color-ink-3)]">
        <span>
          <span className="num" style={{ color: TONE.empty.fg }}>
            {hardware.deadDocks.toLocaleString('en-US')}
          </span>{' '}
          docks dead
        </span>
        <span>
          <span className="num" style={{ color: TONE.warn.fg }}>
            {hardware.brokenBikes.toLocaleString('en-US')}
          </span>{' '}
          bikes broken
        </span>
        {hardware.crippled > 0 && (
          <span>
            <span className="num">{hardware.crippled}</span> sites mostly gone
          </span>
        )}
      </div>
    </Card>
  );
}

/** Fixtures: the feed carries no vehicles. Labelled as such on the card. */
const RAIL_VEHICLE_IDS = ['#4', '#7', '#2'];

function ActiveVehicles() {
  const shown = RAIL_VEHICLE_IDS.map((id) => VEHICLES.find((t) => t.id === id)!).filter(Boolean);

  return (
    <Card>
      <CardHead title="Active vehicles" right={<RailLink to="/fleet/vehicles" label="Open fleet operations" />} />
      <ul className="px-3.5 pb-2">
        {shown.map((vehicle, i) => (
          <li
            key={vehicle.id}
            className={cn('py-2.5', i > 0 && 'border-t border-[var(--color-line-soft)]')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="num text-[12px] font-semibold text-[var(--color-ink)]">
                Vehicle {vehicle.id}
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-medium whitespace-nowrap"
                style={{ color: TONE[VEHICLE_STATE_TONE[vehicle.state]].fg }}
              >
                <Dot tone={VEHICLE_STATE_TONE[vehicle.state]} size={5} />
                {VEHICLE_STATE_LABEL[vehicle.state]}
              </span>
            </div>
            <p className="mt-1 text-[10.5px] leading-snug text-[var(--color-ink-2)]">
              {vehicle.where}
            </p>
            {vehicle.when && (
              <p className="num mt-0.5 text-[10px] text-[var(--color-ink-3)]">{vehicle.when}</p>
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

