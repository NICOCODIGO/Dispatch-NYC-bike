/**
 * Application state and the polling lifecycle.
 *
 * Zustand rather than context because the queue re-renders on a 60s cadence
 * while the "updated Xs ago" ticker re-renders every second; keeping those on
 * separate subscriptions is the difference between repainting a number and
 * repainting 2,400 rows.
 */

import { create } from 'zustand';
import { FeedError, fetchNetwork } from '../data/gbfs';
import type { Borough } from '../data/boroughs';
import {
  SNAPSHOT_TOP_N,
  type SnapshotRow,
  pruneSnapshots,
  putSnapshot,
} from '../data/snapshots';
import type { StationCategory } from '../model/score';
import {
  type NetworkSummary,
  type ScoredStation,
  scoreNetwork,
  summarize,
} from '../model/summary';
import { triage, type Triaged } from '../model/triage';

/** GBFS advertises ttl=60, so polling faster only burns bandwidth. */
export const POLL_INTERVAL_MS = 60_000;

/** Retry backoff after a failed poll: 5s, 10s, 20s, 40s, then every 60s. */
export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 60_000;

/**
 * How old the feed's own timestamp may get before we warn network-wide. This is
 * different from per-station staleness: it means the operator's pipeline is
 * behind, so every count on screen is suspect, not just one station's.
 */
export const FEED_STALE_MS = 10 * 60_000;

export type SortKey = 'score' | 'name' | 'borough' | 'fill' | 'reported' | 'category';

export interface Filters {
  search: string;
  borough: Borough | 'all';
  /** Empty means "no category filter", not "no categories". */
  categories: StationCategory[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: Filters = {
  search: '',
  borough: 'all',
  categories: [],
  sortKey: 'score',
  sortDir: 'desc',
};

interface DispatchState {
  phase: 'loading' | 'ready' | 'error';
  scored: ScoredStation[];
  /** Scored stations split by which crew can act on them. */
  lanes: Triaged;
  byId: Map<string, ScoredStation>;
  summary: NetworkSummary | null;
  feedUpdatedMs: number | null;
  /** When the data currently on screen was fetched. */
  fetchedAtMs: number | null;
  version: string | null;
  dropped: { noStatus: number; noInfo: number };
  error: { message: string; at: number } | null;
  failures: number;
  /** Bumped on every successful refresh; drives the FLIP animation. */
  revision: number;

  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  toggleCategory: (c: StationCategory) => void;

  refresh: () => Promise<void>;
}

export const useDispatch = create<DispatchState>((set, get) => ({
  phase: 'loading',
  scored: [],
  lanes: { vehicle: [], mechanic: [], unverified: [], quiet: [] },
  byId: new Map(),
  summary: null,
  feedUpdatedMs: null,
  fetchedAtMs: null,
  version: null,
  dropped: { noStatus: 0, noInfo: 0 },
  error: null,
  failures: 0,
  revision: 0,

  filters: DEFAULT_FILTERS,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  toggleCategory: (c) =>
    set((s) => ({
      filters: {
        ...s.filters,
        categories: s.filters.categories.includes(c)
          ? s.filters.categories.filter((x) => x !== c)
          : [...s.filters.categories, c],
      },
    })),

  refresh: async () => {
    abortInFlight();
    inFlight = new AbortController();

    try {
      const feed = await fetchNetwork(inFlight.signal);

      // Score against the feed's own clock where possible. If the browser and
      // the feed disagree, using the feed timestamp keeps every station's age
      // consistent with the "updated Xs ago" ticker.
      const now = Date.now();
      const scored = scoreNetwork(feed.stations, now, feed.p90Capacity);
      const lanes = triage(scored);

      set({
        phase: 'ready',
        scored,
        lanes,
        byId: new Map(scored.map((s) => [s.station.stationId, s])),
        summary: summarize(scored, lanes),
        feedUpdatedMs: feed.feedUpdatedMs,
        fetchedAtMs: feed.fetchedAtMs,
        version: feed.version,
        dropped: { noStatus: feed.droppedNoStatus, noInfo: feed.droppedNoInfo },
        error: null,
        failures: 0,
        revision: get().revision + 1,
      });

      void recordSnapshot(lanes.vehicle, feed.fetchedAtMs);
    } catch (err) {
      if (inFlight?.signal.aborted) return;

      const message =
        err instanceof FeedError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'unknown error';

      set((s) => ({
        // Last good data stays on screen. An empty board helps nobody.
        phase: s.scored.length > 0 ? 'ready' : 'error',
        error: { message, at: Date.now() },
        failures: s.failures + 1,
      }));
    } finally {
      inFlight = null;
    }
  },
}));

// ---------------------------------------------------------------------------
// Verify snapshots
// ---------------------------------------------------------------------------

const rowFor = (s: ScoredStation, t: number): SnapshotRow => ({
  id: `${s.station.stationId}:${t}`,
  stationId: s.station.stationId,
  name: s.station.name,
  borough: s.station.borough,
  t,
  score: s.breakdown.score,
  category: s.breakdown.category,
  signal: s.breakdown.signal,
  needsVehicle: s.breakdown.needsVehicle,
  bikes: s.breakdown.fill.bikes,
  docks: s.breakdown.fill.docks,
});

/** Records the worst vehicle-actionable stations. Verify asks whether flagging a
 *  station predicted that it got fixed, so only stations a vehicle could have
 *  fixed belong in that record. */
async function recordSnapshot(vehicleLane: ScoredStation[], t: number) {
  const flagged = vehicleLane.filter((s) => s.breakdown.needsVehicle).slice(0, SNAPSHOT_TOP_N);
  const rows: SnapshotRow[] = flagged.map((s) => rowFor(s, t));

  // Also re-record any station we have flagged before that is no longer
  // flagged — otherwise Verify could only ever show failures and would never be
  // able to say something resolved, which would make the whole screen dishonest.
  const flaggedIds = new Set(flagged.map((s) => s.station.stationId));
  for (const id of previouslyFlagged) {
    if (flaggedIds.has(id)) continue;
    const s = useDispatch.getState().byId.get(id);
    if (!s) continue;
    rows.push(rowFor(s, t));
  }

  for (const id of flaggedIds) previouslyFlagged.add(id);

  await putSnapshot(rows);
  await pruneSnapshots(t);
}

/** Stations flagged at any point this session, so Verify can watch them recover. */
const previouslyFlagged = new Set<string>();

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: AbortController | null = null;
let running = false;

function abortInFlight() {
  inFlight?.abort();
  inFlight = null;
}

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function nextDelay(): number {
  const { failures } = useDispatch.getState();
  if (failures === 0) return POLL_INTERVAL_MS;
  return Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS);
}

function schedule() {
  clearTimer();
  if (!running) return;
  timer = setTimeout(tick, nextDelay());
}

async function tick() {
  if (!running || document.hidden) return;
  await useDispatch.getState().refresh();
  schedule();
}

function onVisibilityChange() {
  if (document.hidden) {
    // Pause: no timer, and drop any request in flight so a backgrounded tab
    // costs nothing.
    clearTimer();
    abortInFlight();
    return;
  }
  if (!running) return;

  // On return, refetch immediately if what is on screen has gone stale,
  // otherwise just resume the normal cadence.
  const { fetchedAtMs } = useDispatch.getState();
  const age = fetchedAtMs === null ? Infinity : Date.now() - fetchedAtMs;
  if (age >= POLL_INTERVAL_MS) void tick();
  else schedule();
}

/** Starts polling. Returns a teardown for React strict-mode double-mounts. */
export function startPolling(): () => void {
  if (running) return () => undefined;
  running = true;

  document.addEventListener('visibilitychange', onVisibilityChange);
  void tick();

  return () => {
    running = false;
    clearTimer();
    abortInFlight();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
