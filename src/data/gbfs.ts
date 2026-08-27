/**
 * GBFS client.
 *
 * Written against the *auto-discovery document*, never against hard-coded feed
 * URLs: we ask gbfs.json which feeds exist and follow the URLs it advertises.
 * Citi Bike's discovery file currently points at gbfs.lyft.com, and that has
 * changed host before — following discovery means a host move costs us nothing.
 *
 * Everything here parses rather than casts. The feed is public infrastructure
 * maintained by someone else; a missing field or a string where a number was
 * promised must degrade one station, not blank the board.
 */

import { boroughFor, type Borough } from './boroughs';

/** Discovery URLs tried in order. The versioned one first (it is what the
 *  operator documents), then the root, which redirects to whatever version is
 *  current. If 2.3 is ever retired the second entry keeps the app alive. */
export const DISCOVERY_URLS = [
  'https://gbfs.citibikenyc.com/gbfs/2.3/gbfs.json',
  'https://gbfs.citibikenyc.com/gbfs/gbfs.json',
] as const;

/** Per-request timeout. The feed is ~1.2 MB of JSON; 15s is generous on 3G and
 *  still short enough that a hung request doesn't stall the 60s poll cycle. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * `last_reported` is documented as POSIX seconds, but Citi Bike emits `86400`
 * (epoch + 1 day) as a sentinel for "this station has never reported" — 67 of
 * ~2,460 stations carry it. Taken literally that reads as 56 years stale and
 * would rocket junk to the top of the queue. Anything below this bound is
 * treated as "no timestamp" instead of a very old one.
 */
export const MIN_PLAUSIBLE_EPOCH_S = 1_000_000_000; // 2001-09-09


function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // Some GBFS producers stringify numerics; accept that rather than drop the station.
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function nonNegInt(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return n < 0 ? 0 : Math.round(n);
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** GBFS 2.x booleans are 0/1; 3.x uses real booleans. Accept both. */
function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Domain types — the shapes the rest of the app is allowed to see
// ---------------------------------------------------------------------------

export interface StationInfo {
  stationId: string;
  name: string;
  shortName: string | null;
  lat: number;
  lon: number;
  /** Docks the operator says exist. Not reliable as a fill denominator — see
   *  `usableSlots` on JoinedStation — but it is the right weight for "how many
   *  riders does this station serve". */
  capacity: number;
  regionId: string | null;
}

export interface StationStatus {
  stationId: string;
  bikesAvailable: number;
  ebikesAvailable: number;
  docksAvailable: number;
  bikesDisabled: number;
  docksDisabled: number;
  isInstalled: boolean;
  isRenting: boolean;
  isReturning: boolean;
  /** Epoch ms, or null when the feed carried no usable timestamp. */
  lastReportedMs: number | null;
}

export interface JoinedStation extends StationInfo {
  status: StationStatus;
  borough: Borough;
  /** bikes + docks actually reported available. This is the fill denominator:
   *  870 installed stations disagree with their own `capacity`, so dividing by
   *  capacity would report stations as half-empty that are physically full. */
  usableSlots: number;
  /** bikes / usableSlots, or null when the station reports no usable slots. */
  fillRatio: number | null;
}

export interface FeedResult {
  stations: JoinedStation[];
  /** Newer of the two feeds' `last_updated`, in epoch ms. */
  feedUpdatedMs: number;
  fetchedAtMs: number;
  /** 90th percentile capacity across installed stations — the capacity-weight
   *  denominator. Computed from the live feed, not hard-coded, so the model
   *  self-calibrates if the network grows. */
  p90Capacity: number;
  /** Join diagnostics. Both feeds are keyed on station_id but nothing
   *  guarantees they agree; we surface the gap rather than silently dropping. */
  droppedNoStatus: number;
  droppedNoInfo: number;
  version: string;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export class FeedError extends Error {
  readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.name = 'FeedError';
    this.url = url;
  }
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      // GBFS advertises ttl=60; never let a proxy hand us a stale body.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new FeedError(`HTTP ${res.status} ${res.statusText}`, url);
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof FeedError) throw err;
    const reason =
      err instanceof DOMException && err.name === 'AbortError'
        ? `timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`
        : err instanceof Error
          ? err.message
          : 'network error';
    throw new FeedError(reason, url);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

interface Discovery {
  feeds: Map<string, string>;
  version: string;
}

/**
 * Reads the auto-discovery document into a name -> url map.
 *
 * Handles both layouts in the wild:
 *   2.x  { data: { en: { feeds: [...] }, fr: {...} } }
 *   3.x  { data: { feeds: [...] } }
 */
export function parseDiscovery(raw: unknown): Discovery {
  if (!isRecord(raw) || !isRecord(raw.data)) {
    throw new Error('discovery document has no data object');
  }

  const version = str(raw.version) ?? '2.3';
  const data = raw.data;

  const feedArrays: unknown[] = [];
  if (Array.isArray(data.feeds)) {
    feedArrays.push(...data.feeds);
  } else {
    // Language-keyed. Prefer English, else whichever language is listed first.
    const langs = Object.keys(data);
    const preferred = langs.find((l) => l.toLowerCase().startsWith('en')) ?? langs[0];
    const block = preferred === undefined ? undefined : data[preferred];
    if (isRecord(block) && Array.isArray(block.feeds)) feedArrays.push(...block.feeds);
  }

  const feeds = new Map<string, string>();
  for (const entry of feedArrays) {
    if (!isRecord(entry)) continue;
    const name = str(entry.name);
    const url = str(entry.url);
    if (name && url) feeds.set(name, url);
  }

  if (!feeds.has('station_information') || !feeds.has('station_status')) {
    throw new Error('discovery document lists no station_information/station_status feed');
  }
  return { feeds, version };
}

async function discover(signal?: AbortSignal): Promise<Discovery> {
  const failures: string[] = [];
  for (const url of DISCOVERY_URLS) {
    try {
      return parseDiscovery(await fetchJson(url, signal));
    } catch (err) {
      failures.push(`${url}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }
  throw new FeedError(
    `no reachable discovery document (${failures.join('; ')})`,
    DISCOVERY_URLS[0],
  );
}

// ---------------------------------------------------------------------------
// Feed parsing
// ---------------------------------------------------------------------------

function stationArray(raw: unknown, feedName: string): unknown[] {
  if (!isRecord(raw) || !isRecord(raw.data) || !Array.isArray(raw.data.stations)) {
    throw new Error(`${feedName} has no data.stations array`);
  }
  return raw.data.stations;
}

function lastUpdatedMs(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  const s = num(raw.last_updated);
  if (s === null) return null;
  // GBFS 3.x switched last_updated to RFC3339; if it parsed as a number it is
  // seconds. Values already in ms (some producers) are passed through.
  return s > 1e12 ? s : s * 1000;
}

export function parseStationInformation(raw: unknown): StationInfo[] {
  const out: StationInfo[] = [];
  for (const entry of stationArray(raw, 'station_information')) {
    if (!isRecord(entry)) continue;
    const stationId = str(entry.station_id);
    const name = str(entry.name);
    const lat = num(entry.lat);
    const lon = num(entry.lon);
    if (!stationId || !name || lat === null || lon === null) continue;
    // Reject coordinates that cannot be New York. A 0/0 station would land in
    // the Gulf of Guinea and silently become "Unknown borough" forever.
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;

    out.push({
      stationId,
      name,
      shortName: str(entry.short_name),
      lat,
      lon,
      capacity: nonNegInt(entry.capacity) ?? 0,
      regionId: str(entry.region_id),
    });
  }
  return out;
}

export function parseStationStatus(raw: unknown): StationStatus[] {
  const out: StationStatus[] = [];
  for (const entry of stationArray(raw, 'station_status')) {
    if (!isRecord(entry)) continue;
    const stationId = str(entry.station_id);
    if (!stationId) continue;

    const reportedS = num(entry.last_reported);
    const lastReportedMs =
      reportedS === null || reportedS < MIN_PLAUSIBLE_EPOCH_S
        ? null
        : reportedS > 1e12
          ? reportedS
          : reportedS * 1000;

    out.push({
      stationId,
      bikesAvailable: nonNegInt(entry.num_bikes_available) ?? 0,
      ebikesAvailable: nonNegInt(entry.num_ebikes_available) ?? 0,
      docksAvailable: nonNegInt(entry.num_docks_available) ?? 0,
      bikesDisabled: nonNegInt(entry.num_bikes_disabled) ?? 0,
      docksDisabled: nonNegInt(entry.num_docks_disabled) ?? 0,
      // Absent flags default to "working" — GBFS treats them as optional and
      // assuming an outage on a missing field would invent emergencies.
      isInstalled: bool(entry.is_installed, true),
      isRenting: bool(entry.is_renting, true),
      isReturning: bool(entry.is_returning, true),
      lastReportedMs,
    });
  }
  return out;
}

/** 90th-percentile capacity over installed stations with a real capacity. */
export function p90CapacityOf(stations: { capacity: number }[]): number {
  const caps = stations
    .map((s) => s.capacity)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  if (caps.length === 0) return 1;
  const idx = Math.min(caps.length - 1, Math.floor(0.9 * (caps.length - 1)));
  return caps[idx] ?? 1;
}

export function joinFeeds(
  info: StationInfo[],
  status: StationStatus[],
  meta: { feedUpdatedMs: number; fetchedAtMs: number; version: string },
): FeedResult {
  const statusById = new Map(status.map((s) => [s.stationId, s]));
  const infoIds = new Set(info.map((i) => i.stationId));

  const stations: JoinedStation[] = [];
  let droppedNoStatus = 0;

  for (const i of info) {
    const st = statusById.get(i.stationId);
    if (!st) {
      // Station described but not reporting. It has no counts to rank, so it
      // cannot be scored; counted and surfaced rather than hidden.
      droppedNoStatus++;
      continue;
    }
    const usableSlots = st.bikesAvailable + st.docksAvailable;
    stations.push({
      ...i,
      status: st,
      borough: boroughFor(i.lat, i.lon),
      usableSlots,
      fillRatio: usableSlots > 0 ? st.bikesAvailable / usableSlots : null,
    });
  }

  // Status rows with no matching information row have no name, coordinates or
  // capacity — nothing a dispatcher could act on, so they are counted only.
  const droppedNoInfo = status.reduce((n, s) => (infoIds.has(s.stationId) ? n : n + 1), 0);

  return {
    stations,
    feedUpdatedMs: meta.feedUpdatedMs,
    fetchedAtMs: meta.fetchedAtMs,
    p90Capacity: p90CapacityOf(stations.filter((s) => s.status.isInstalled)),
    droppedNoStatus,
    droppedNoInfo,
    version: meta.version,
  };
}

/** One full refresh: discover, fetch both station feeds in parallel, join. */
export async function fetchNetwork(signal?: AbortSignal): Promise<FeedResult> {
  const { feeds, version } = await discover(signal);
  const infoUrl = feeds.get('station_information')!;
  const statusUrl = feeds.get('station_status')!;

  const [rawInfo, rawStatus] = await Promise.all([
    fetchJson(infoUrl, signal),
    fetchJson(statusUrl, signal),
  ]);

  const info = parseStationInformation(rawInfo);
  const status = parseStationStatus(rawStatus);

  if (info.length === 0 || status.length === 0) {
    throw new FeedError('feed parsed but contained no stations', statusUrl);
  }

  const fetchedAtMs = Date.now();
  const feedUpdatedMs = Math.max(
    lastUpdatedMs(rawStatus) ?? 0,
    lastUpdatedMs(rawInfo) ?? 0,
  );

  return joinFeeds(info, status, {
    feedUpdatedMs: feedUpdatedMs || fetchedAtMs,
    fetchedAtMs,
    version,
  });
}
