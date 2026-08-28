import type { StationRow, StatusLabel } from '../data/stationRow';
import type { Tone } from '../ui/tone';
import type { WorkOrder } from '../model/workOrder';
import type { Staff } from '../model/roster';

// The row shape now lives in `src/data/stationRow.ts` so the live adapter and
// these fixtures can both produce it. Re-exported so existing imports hold.
export type { StationRow, StatusLabel };

/**
 * What is left that the feed cannot supply.
 *
 * This file used to open by claiming "every number on every screen comes from
 * this file". That stopped being true when the GBFS layer was wired in, and it
 * stayed on the page long enough to become actively misleading — a reader would
 * take the whole console for a mock.
 *
 * What remains is the things GBFS genuinely does not carry: trucks, the field
 * roster, seed work orders, and a few panels still labelled as fixtures on
 * screen. Everything about stations — counts, faults, timestamps, scores — now
 * comes from the live feed through `src/data`, `src/model` and `src/store`.
 *
 * Several blocks have been deleted rather than left as reference: hardcoded
 * category counts, an unverified list, chronic offenders, borough metrics. Each
 * was a frozen copy of something the live summary now computes, and a frozen
 * copy of a live number is a bug waiting for somebody to import it. The one
 * that proved the point is noted where it stood.
 */

/* ---------------------------------------------------------------------------
   Zones.
--------------------------------------------------------------------------- */

export interface Zone {
  slug: string;
  name: string;
  stations: number;
}

export const ZONES: Zone[] = [
  { slug: 'manhattan', name: 'Manhattan', stations: 318 },
  { slug: 'brooklyn', name: 'Brooklyn', stations: 241 },
  { slug: 'queens', name: 'Queens', stations: 187 },
  { slug: 'bronx', name: 'Bronx', stations: 98 },
  { slug: 'staten-island', name: 'Staten Island', stations: 58 },
];

export const TOTAL_STATIONS = 902;
export const TRUCKS_ACTIVE = 5;
export const TRUCKS_TOTAL = 8;

// `CONSOLE_CLOCK = '14:02'` stood here, a frozen "now" so fixture timestamps
// could agree with each other. It was already unused: the activity log stamps
// real wall-clock time, and work orders carry epoch milliseconds so their age
// and SLA can actually be computed. The comment promised it would be "replaced
// by the real clock when the feed is wired in" — that happened; the constant
// just outlived the sentence.

/* ---------------------------------------------------------------------------
   Priority queue.
--------------------------------------------------------------------------- */

export const STATIONS: StationRow[] = [
  {
    id: '102',
    name: 'Central Park W & W 72 St',
    borough: 'Manhattan',
    docks: 55,
    bikes: 0,
    score: 91,
    status: 'Empty',
    updated: '2m ago',
    fill: 0,
    fillTone: 'empty',
    stationNumber: '#102',
  },
  {
    id: '244',
    name: 'Park Ave & E 41 St',
    borough: 'Manhattan',
    docks: 109,
    bikes: 106,
    score: 88,
    status: 'Flooded',
    updated: '3m ago',
    fill: 0.97,
    fillTone: 'flood',
    stationNumber: '#244',
  },
  {
    id: '311',
    name: 'Bedford Ave & N 7 St',
    borough: 'Brooklyn',
    docks: 23,
    bikes: 1,
    score: 81,
    status: 'Empty',
    updated: '7m ago',
    fill: 0.04,
    fillTone: 'empty',
    fillLabel: '4% full',
    stationNumber: '#311',
  },
  {
    id: '182',
    name: 'W 20 St & 8 Ave',
    borough: 'Manhattan',
    docks: 39,
    bikes: 38,
    score: 74,
    status: 'Full',
    updated: '11m ago',
    fill: 0.97,
    fillTone: 'warn',
    fillLabel: '97% full',
    stationNumber: '#182',
  },
  {
    id: '408',
    name: 'Driggs Ave & N 9 St',
    borough: 'Brooklyn',
    docks: 35,
    bikes: 2,
    score: 68,
    status: 'Low',
    updated: '18m ago',
    fill: 0.06,
    fillTone: 'warn',
    fillLabel: '6% full',
    stationNumber: '#408',
  },
  {
    id: '517',
    name: 'Jackson Ave & 11 St',
    borough: 'Queens',
    docks: 47,
    bikes: 45,
    score: 63,
    status: 'Full',
    updated: '22m ago',
    fill: 0.96,
    fillTone: 'warn',
    fillLabel: '96% full',
    stationNumber: '#517',
  },
  {
    id: '442',
    name: 'Grand Army Plaza',
    borough: 'Brooklyn',
    docks: 63,
    bikes: 21,
    score: 41,
    status: 'Low',
    updated: '34m ago',
    fill: 0.33,
    fillTone: 'ok',
    fillLabel: '33% full',
    stationNumber: '#442',
  },
  {
    id: '7244',
    name: 'E 106 St & Madison Ave',
    borough: 'Manhattan',
    docks: 31,
    bikes: null,
    score: null,
    status: 'Stale',
    updated: '72m ago',
    fill: null,
    fillTone: 'mute',
    fillLabel: 'unknown',
    warning: 'Last seen 72 min ago — not scored',
    stationNumber: '#7244',
  },
];

/**
 * Stations named by other screens — tickets, chronic offenders, unverified
 * rows — that are not in the ranked queue.
 *
 * The queue is a *view* of the network, not the whole of it, so anything the
 * console can name has to be openable. Without these, clicking a chronic
 * offender or a ticket's station would dead-end.
 */
export const OFF_QUEUE_STATIONS: StationRow[] = [
  {
    id: '5116',
    name: 'Kent Ave & S 11 St',
    borough: 'Brooklyn',
    docks: 27,
    bikes: null,
    score: null,
    status: 'Stale',
    updated: '104m ago',
    fill: null,
    fillTone: 'mute',
    fillLabel: 'unknown',
    warning: 'Last seen 104 min ago — not scored',
    stationNumber: '#5116',
  },
  {
    id: '6421',
    name: 'Queens Plaza North & Crescent St',
    borough: 'Queens',
    docks: 41,
    bikes: null,
    score: null,
    status: 'Stale',
    updated: '65m ago',
    fill: null,
    fillTone: 'mute',
    fillLabel: 'unknown',
    warning: 'Last seen 65 min ago — not scored',
    stationNumber: '#6421',
  },
  {
    id: '629',
    name: 'Jackson Ave & 46 Rd',
    borough: 'Queens',
    docks: 33,
    bikes: 29,
    score: 58,
    status: 'Full',
    updated: '9m ago',
    fill: 0.88,
    fillTone: 'warn',
    fillLabel: '88% full',
    stationNumber: '#629',
  },
];

/** Everything the console can name, queue and otherwise. */
export const STATION_DIRECTORY: StationRow[] = [...STATIONS, ...OFF_QUEUE_STATIONS];

export function stationById(id: string): StationRow | null {
  return STATION_DIRECTORY.find((s) => s.id === id) ?? null;
}

/** The six headline numbers above the queue. */
export const QUEUE_STATS = {
  needsTruck: 47,
  empty: 62,
  emptyDelta: 4,
  flooded: 163,
  floodedDelta: -11,
  stale: 3,
  fill: 0.61,
  // scoreThreshold / criticalThreshold used to live here as literal 55 and 70.
  // Nothing read them, and they were a second copy of numbers the model owns —
  // exactly the drift that let the badge ramp turn amber at 40 while the legend
  // promised 55. Import from `model/score` if a mock ever needs them.
  page: 1,
  pageCount: 114,
};

/* ---------------------------------------------------------------------------
   Deleted: STATUS_FILTERS, FILL_DISTRIBUTION, SCORE_GUIDE.

   The first two were hardcoded category counts — 62 empty, 163 flooded, 305 low
   — that `summarize()` now derives from the feed on every poll.

   The third is the cautionary one. It was a fourth copy of the score bands,
   unrendered, still claiming "40–69 Warning" and "0–39 Healthy" long after the
   dispatch threshold moved to 55. Nothing imported it, so nothing ever
   contradicted it, and it would have read as authoritative to whoever found it
   next. The bands now derive from the two constants in one place — SCORE_BANDS
   in `src/content/columns.tsx`.
--------------------------------------------------------------------------- */
// Dead copies of a live constant do not stay dead. They get found, trusted, and
// rendered by somebody who does not know the numbers moved.

/* ---------------------------------------------------------------------------
   Score breakdown drawer.
--------------------------------------------------------------------------- */

export interface ScoreFactor {
  label: string;
  points: number;
  /** 0–1 width of the factor's bar. */
  share: number;
  tone: Tone;
}

export const SCORE_BREAKDOWN: Record<string, ScoreFactor[]> = {
  '102': [
    { label: 'Zero bikes — station completely empty', points: 45, share: 1, tone: 'empty' },
    { label: 'Medium rack · 55 docks, high rider volume', points: 26, share: 0.62, tone: 'warn' },
    { label: 'Fresh report · confirmed 2 minutes ago', points: 20, share: 0.46, tone: 'ok' },
  ],
};

/** Fallback so every row in the table can open a plausible receipt. */
export function factorsFor(row: StationRow): ScoreFactor[] {
  const known = SCORE_BREAKDOWN[row.id];
  if (known) return known;
  if (row.score === null) return [];

  const base = Math.round(row.score * 0.5);
  const size = Math.round(row.score * 0.29);
  const fresh = row.score - base - size;

  return [
    {
      label:
        row.status === 'Flooded' || row.status === 'Full'
          ? 'Rack near capacity — riders cannot return bikes'
          : 'Bikes running out — riders cannot rent',
      points: base,
      share: 1,
      tone: row.fillTone === 'flood' ? 'flood' : row.fillTone === 'ok' ? 'warn' : row.fillTone,
    },
    {
      label: `Medium rack · ${row.docks} docks, high rider volume`,
      points: size,
      share: 0.62,
      tone: 'warn',
    },
    { label: `Fresh report · confirmed ${row.updated}`, points: fresh, share: 0.46, tone: 'ok' },
  ];
}

export const SCORE_NOTE =
  "Scores refresh every 60 seconds. If a rack hasn't reported in over an hour, it's moved to the Unverified pile and excluded from scoring.";

/* ---------------------------------------------------------------------------
   Fleet.
--------------------------------------------------------------------------- */

/**
 * Where a vehicle is in its run.
 *
 * `on-site` is separate from `loading` deliberately: a truck that has arrived
 * and is working is not the same as one filling up at a depot, and a
 * coordinator must not count that station as solved until the crew leaves.
 */
export type TruckState = 'en-route' | 'loading' | 'on-site' | 'idle';

export interface Truck {
  id: string;
  state: TruckState;
  /** Home base, so dispatch runs can be rolled up per depot. */
  depot: string;
  /** Sub-line on the queue rail. */
  where: string;
  when?: string;
  load: number;
  capacity: number;
  active?: string;
  eta?: string;
  /**
   * Where the vehicle is right now. Invented, like the rest of the fleet — the
   * public feed carries no vehicles — but real coordinates, because "8 minutes
   * away" computed from a depot *name* would be a fabricated number wearing a
   * precise costume. With a position it is arithmetic against the station's own
   * lat/lon, and wrong only in the way every travel estimate is wrong.
   */
  lat: number;
  lon: number;
  /**
   * Minutes until this truck can accept a *new* job — not until its current
   * leg ends.
   *
   * Declared rather than derived. A truck 6 minutes from its stop is not free
   * in 6 minutes; it still has to unload. Deriving that would mean inventing a
   * service-time model and presenting it as a measurement, so the number is
   * stated outright as fixture and the panel says so.
   */
  freeInMin: number;
}

export const TRUCKS: Truck[] = [
  {
    id: '#4',
    depot: 'E 18 St',
    state: 'en-route',
    where: '→ Columbus Ave & W 72',
    when: 'ETA 6 min',
    load: 26,
    capacity: 48,
    active: 'W 72 St & Columbus Ave',
    eta: 'ETA 6 min',
    lat: 40.778,
    lon: -73.98,
    freeInMin: 18,
  },
  {
    id: '#7',
    depot: 'E 18 St',
    state: 'loading',
    where: 'Depot · 1 Ave & E 18',
    when: 'Departs in ~12 min',
    load: 18,
    capacity: 48,
    lat: 40.734,
    lon: -73.98,
    freeInMin: 35,
  },
  {
    id: '#1',
    depot: 'E 18 St',
    state: 'on-site',
    where: 'Broadway & W 36 St',
    when: 'unloading, ~4 min left',
    load: 31,
    capacity: 48,
    lat: 40.752,
    lon: -73.988,
    freeInMin: 4,
  },
  {
    id: '#3',
    depot: 'Sunset Park',
    state: 'en-route',
    where: 'Atlantic Ave & 4 Ave',
    load: 12,
    capacity: 48,
    lat: 40.684,
    lon: -73.978,
    freeInMin: 22,
  },
  {
    id: '#8',
    depot: 'Queens Blvd',
    state: 'en-route',
    where: 'Queens Blvd & 46 St',
    load: 22,
    capacity: 48,
    lat: 40.744,
    lon: -73.921,
    freeInMin: 27,
  },
  {
    id: '#2',
    depot: 'Greenpoint',
    state: 'idle',
    where: 'Depot · Greenpoint',
    load: 0,
    capacity: 48,
    lat: 40.73,
    lon: -73.954,
    freeInMin: 0,
  },
  {
    // Idle but not empty — came back from a collect run with bikes still on
    // board. Without one of these the fleet had three identical empty idles and
    // "an idle truck carrying 26 is a different asset from an idle truck
    // carrying none" was a true statement about a case the data never produced.
    id: '#5',
    depot: 'Sunset Park',
    state: 'idle',
    where: 'Depot · Sunset Park',
    load: 26,
    capacity: 48,
    lat: 40.645,
    lon: -74.01,
    freeInMin: 0,
  },
  {
    id: '#6',
    depot: 'Mott Haven',
    state: 'idle',
    where: 'Depot · Mott Haven',
    load: 0,
    capacity: 48,
    lat: 40.809,
    lon: -73.923,
    freeInMin: 0,
  },
];

export const TRUCK_STATE_LABEL: Record<TruckState, string> = {
  'en-route': 'En Route',
  loading: 'Loading',
  'on-site': 'On Site',
  idle: 'Idle',
};

/**
 * Can this vehicle take a job, and at what cost?
 *
 * The meaning of a state is only half of what a coordinator needs; the other
 * half is what choosing it does to them. "En Route" is not a status so much as
 * a warning that re-tasking abandons something already in progress.
 */
export const TRUCK_STATE_AVAILABILITY: Record<TruckState, string> = {
  idle: 'Free now — can leave immediately.',
  loading: 'Free shortly — finishing a load first.',
  'en-route': 'Only by re-tasking — you would abandon its current job.',
  'on-site': 'Only by re-tasking — the crew is mid-job at a station.',
};

/** The order a truck moves through them. */
export const TRUCK_STATE_CYCLE: TruckState[] = ['idle', 'loading', 'en-route', 'on-site'];

/** One line each, for the legend on Fleet Operations. */
export const TRUCK_STATE_MEANING: Record<TruckState, string> = {
  idle: 'Parked at a depot with no job. Driver available, vehicle doing nothing.',
  loading: 'Moving bikes on or off — taking stock at a depot, or collecting from a station that is too full. Not travelling.',
  'en-route': 'Driving between two points, carrying bikes to a drop-off or heading to a pickup.',
  'on-site': 'Arrived and working the station. The job is not finished, so the station does not count as solved yet.',
};

export const TRUCK_STATE_TONE: Record<TruckState, Tone> = {
  'en-route': 'ok',
  loading: 'warn',
  'on-site': 'flood',
  idle: 'mute',
};

/** The rail on Truck Dispatch: what #4 is doing and what it does next. */
export const TRUCK_FOCUS = {
  id: '#4',
  current: { title: 'Unloading 12 Classic Bikes', where: 'W 72 St & Columbus Ave' },
  next: { in: 'NEXT: 8 MIN', title: 'Pickup 8 Flooded Bikes', where: 'Central Park W & 72 St' },
};

/* ---------------------------------------------------------------------------
   Unverified stations.
--------------------------------------------------------------------------- */

// UNVERIFIED lived here — fixture rows for a screen now driven by the feed.

export const REPORTING_HEALTH = {
  bars: [
    { value: 98, tone: 'ok' as Tone },
    { value: 99, tone: 'ok' as Tone },
    { value: 97, tone: 'ok' as Tone },
    { value: 74, tone: 'warn' as Tone },
    { value: 99, tone: 'ok' as Tone },
    { value: 98, tone: 'ok' as Tone },
  ],
  axis: ['08:00', '12:00', '18:00'],
  uptime: '98.2',
  verdict: 'NORMAL',
};

// `BATTERY = { count: 12, caption: 'STATIONS < 15%' }` used to live here. It was
// a station-power figure that could never move, because GBFS publishes no
// battery reading at any level — and once the app grew e-bike state of charge
// and `station-power` work orders, a frozen third battery number silently
// disagreed with both. The Unverified panel now counts power orders raised and
// stations actually silent, which is the observable consequence of a flat site
// battery rather than a stand-in for the cause.

export const CELLULAR = [
  { label: 'Verizon (Primary)', value: 'Up', tone: 'ok' as Tone },
  { label: 'AT&T (Backup)', value: 'Up', tone: 'ok' as Tone },
];

export const OUTAGE_FREQUENCY = '0.04%';

/* ---------------------------------------------------------------------------
   Maintenance.
--------------------------------------------------------------------------- */

/**
 * Seed work orders.
 *
 * Opened relative to load rather than at fixed times. The old fixtures carried
 * `reported: '13:45'`, which meant the maintenance screen could print an hour
 * but never compute an age — and a work order whose age is a rendered string is
 * a card pretending to be a ticket. Anchoring to load time means the SLA clock
 * on these actually runs while the tab is open: the dock jam crosses its
 * four-hour target during a long session, and the screen notices.
 */
const OPENED = Date.now();

export const WORK_ORDERS: WorkOrder[] = [
  {
    id: 'wo-dock-14',
    type: 'dock-repair',
    target: { stationId: '442', stationName: 'Grand Army Plaza', borough: 'Brooklyn' },
    priority: 88,
    status: 'open',
    assignee: null,
    openedAt: OPENED - 197 * 60_000,
    closedAt: null,
    detail:
      'Solenoid failure in dock locking mechanism. System error code {code}. Multiple user reports confirmed via app help center.',
    faultCode: 'E-14-B',
  },
  {
    id: 'wo-solar',
    type: 'station-power',
    target: { stationId: '5116', stationName: 'Kent Ave & N 7 St', borough: 'Brooklyn' },
    priority: 61,
    status: 'assigned',
    assignee: 'mark-t',
    openedAt: OPENED - 110 * 60_000,
    closedAt: null,
    detail:
      'Site battery below 15% and still falling. Solar panel obstruction or hardware degradation suspected. Station goes off the feed entirely if it flattens.',
  },
];

/**
 * The field roster.
 *
 * Replaces a two-person `MECHANICS` array whose `status` was a hand-written
 * sentence, sitting beside `MECHANICS_ON_SHIFT = { active: 2, total: 5 }` that
 * disagreed with the length of the array next to it. Both are gone: who is on
 * comes from the shift clock, and what they are doing comes from the work
 * orders that point at them.
 *
 * Eleven people over three shifts, weighted toward AM and PM because that is
 * where the demand is — the night shift is a skeleton that mostly repositions
 * for the morning. Invented, and labelled `Simulated` wherever it surfaces.
 */
/**
 * Where the depots are.
 *
 * Real coordinates for invented bases, on the same reasoning the trucks carry
 * real lat/lon: "18 minutes away" computed from a depot *name* would be a
 * fabricated number wearing a precise costume, while the same figure derived
 * from a position is arithmetic and wrong only in the way every travel estimate
 * is wrong. E 18 St is Citi Bike's actual Manhattan yard; Sunset Park is the
 * Brooklyn industrial waterfront where that kind of operation lives.
 */
export const DEPOTS: Record<string, { lat: number; lon: number }> = {
  'E 18 St': { lat: 40.7359, lon: -73.9911 },
  'Sunset Park': { lat: 40.6553, lon: -74.0122 },
};

export const ROSTER: Staff[] = [
  // AM — the heavy shift.
  { id: 'mark-t', name: 'Mark T.', role: 'field-mechanic', shift: 'am', depot: 'E 18 St' },
  { id: 'sarah-w', name: 'Sarah W.', role: 'field-mechanic', shift: 'am', depot: 'Sunset Park' },
  { id: 'devon-r', name: 'Devon R.', role: 'rebalance-driver', shift: 'am', depot: 'E 18 St', vehicleId: '#4' },
  { id: 'ana-l', name: 'Ana L.', role: 'rebalance-driver', shift: 'am', depot: 'Sunset Park', vehicleId: '#7' },
  { id: 'priya-n', name: 'Priya N.', role: 'swap-tech', shift: 'am', depot: 'E 18 St' },
  { id: 'chris-b', name: 'Chris B.', role: 'dispatcher', shift: 'am', depot: 'E 18 St' },

  // PM.
  { id: 'jordan-k', name: 'Jordan K.', role: 'rebalance-driver', shift: 'pm', depot: 'E 18 St', vehicleId: '#2' },
  { id: 'lena-m', name: 'Lena M.', role: 'field-mechanic', shift: 'pm', depot: 'Sunset Park' },
  { id: 'omar-s', name: 'Omar S.', role: 'swap-tech', shift: 'pm', depot: 'Sunset Park' },

  // Night — repositioning for the morning, plus whoever keeps the depot moving.
  { id: 'ray-c', name: 'Ray C.', role: 'rebalance-driver', shift: 'night', depot: 'E 18 St', vehicleId: '#5' },
  { id: 'tess-o', name: 'Tess O.', role: 'depot-mechanic', shift: 'night', depot: 'E 18 St' },
];

export function mechanicName(id: string | null): string | null {
  if (!id) return null;
  return ROSTER.find((p) => p.id === id)?.name ?? null;
}

export interface ActivityEntry {
  who: string;
  verb: string;
  what: string;
  time: string;
  where: string;
  tone: Tone;
}

export const ACTIVITY_LOG: ActivityEntry[] = [
  {
    who: 'Sarah W.',
    verb: 'resolved',
    what: 'Kiosk Frozen @ 14th St.',
    time: '14:02',
    where: 'Manhattan',
    tone: 'ok',
  },
  {
    who: 'System',
    verb: 'generated',
    what: 'High Priority Alert: Dock #14.',
    time: '13:45',
    where: 'Brooklyn',
    tone: 'empty',
  },
  {
    who: 'Mark T.',
    verb: 'started',
    what: 'travel to Kent Ave.',
    time: '13:18',
    where: 'Brooklyn',
    tone: 'mute',
  },
];

/* ---------------------------------------------------------------------------
   Analytics.
--------------------------------------------------------------------------- */

export const KPIS = {
  trips: '14,208',
  tripsDelta: '+8.4% vs prev day',
  rebalance: '18.5',
  rebalanceDelta: '-2.1m vs benchmark',
  reliability: '99.7',
};

// CHRONIC_OFFENDERS lived here, superseded by session duration tracking.

/** 24 hourly readings, midnight to 23:00. */
export const DEMAND_ACTUAL = [
  22, 14, 10, 8, 12, 28, 62, 110, 140, 122, 100, 92, 88, 92, 100, 108, 145, 188, 160, 120, 88, 62,
  42, 28,
];

export const DEMAND_PREDICTED = [
  25, 16, 11, 9, 14, 31, 58, 104, 133, 126, 104, 90, 91, 95, 98, 112, 150, 182, 165, 124, 84, 60,
  45, 30,
];

export const DEMAND_X_LABELS = ['0:00', '3:00', '6:00', '9:00', '12:00', '15:00', '18:00', '21:00'];

// BOROUGH_METRICS lived here, superseded by live per-borough rollups.

/* ---------------------------------------------------------------------------
   Zone detail.
--------------------------------------------------------------------------- */

export interface ZoneDetail {
  needsDispatch: number;
  assignedTrucks: number;
  chronicOffenders: number;
  avgFill: number;
  clusterTitle: string;
  clusterDetail: string;
  sync: string;
  ranked: StationRow[];
}

const RANKED_BY_ZONE: Record<string, string[]> = {
  manhattan: ['102', '244', '182'],
  brooklyn: ['311', '408', '442'],
  queens: ['517'],
  bronx: [],
  'staten-island': [],
};

/** Manhattan is the comped zone; its four numbers are taken from the design. */
const ZONE_OVERRIDES: Record<string, Partial<ZoneDetail>> = {
  manhattan: { needsDispatch: 14, assignedTrucks: 2, chronicOffenders: 3, avgFill: 0.64 },
};

export function zoneDetail(slug: string): ZoneDetail {
  const zone = ZONES.find((z) => z.slug === slug) ?? ZONES[0]!;
  const ids = RANKED_BY_ZONE[slug] ?? [];
  const ranked = ids
    .map((id) => STATIONS.find((s) => s.id === id))
    .filter((s): s is StationRow => Boolean(s));

  // Zones the design does not comp derive from their share of the network, so
  // every page carries plausible figures rather than repeating Manhattan's.
  const share = zone.stations / TOTAL_STATIONS;

  return {
    needsDispatch: Math.max(1, Math.round(QUEUE_STATS.needsTruck * share)),
    assignedTrucks: Math.max(1, Math.round(TRUCKS_ACTIVE * share)),
    chronicOffenders: Math.max(1, Math.round(9 * share)),
    avgFill: 0.5 + share * 0.6,
    clusterTitle: `${zone.name} Priority Clusters`,
    clusterDetail:
      slug === 'manhattan'
        ? 'Active hotspots across Central Park West and Midtown'
        : `Active hotspots across ${zone.name}`,
    sync: '14:15',
    ranked,
    ...ZONE_OVERRIDES[slug],
  };
}
