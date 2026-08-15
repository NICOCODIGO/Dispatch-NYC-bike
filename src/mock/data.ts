import type { IconName } from '../ui/Icon';
import type { Tone } from '../ui/tone';

/**
 * Fixtures for the console.
 *
 * Every number on every screen comes from this file. Nothing here is fetched
 * and nothing is computed from the GBFS feed — the live data layer in
 * `src/data`, `src/model` and `src/store` is intact and untouched, waiting to
 * be wired in behind these same shapes.
 *
 * The figures are internally consistent on purpose: the five status counts sum
 * to 902, the donut percentages resolve back to those same counts, and the five
 * zone totals sum to 902 as well. Anything that reads as arithmetic on screen
 * actually reconciles.
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

/**
 * The console's frozen "now".
 *
 * Every timestamp in this build is a fixture, so anything the app *creates*
 * has to be stamped on the same clock — a ticket raised from Unverified must
 * not read 01:57 in a board where the latest event is 14:02. Replaced by the
 * real clock when the feed is wired in.
 */
export const CONSOLE_CLOCK = '14:02';

/* ---------------------------------------------------------------------------
   Priority queue.
--------------------------------------------------------------------------- */

export type StatusLabel = 'Empty' | 'Flooded' | 'Full' | 'Low' | 'Healthy' | 'Stale';

export interface StationRow {
  id: string;
  name: string;
  borough: string;
  docks: number;
  /** Null when the station is unverified and its counts cannot be trusted. */
  bikes: number | null;
  score: number | null;
  status: StatusLabel;
  updated: string;
  /** 0–1, or null for unknown. Drives the fill bar. */
  fill: number | null;
  fillTone: Tone;
  /** The caption under the fill bar. Absent on rows the design leaves bare. */
  fillLabel?: string;
  /** Shown instead of the borough sub-line on unverified rows. */
  warning?: string;
  stationNumber?: string;
}

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
  scoreThreshold: 55,
  criticalThreshold: 70,
  page: 1,
  pageCount: 114,
};

/* ---------------------------------------------------------------------------
   Status filters. These counts are the donut, the legend and the chips.
--------------------------------------------------------------------------- */

export interface StatusFilter {
  key: string;
  label: string;
  count: number;
  tone: Tone;
}

export const STATUS_FILTERS: StatusFilter[] = [
  { key: 'empty', label: 'Empty', count: 62, tone: 'empty' },
  { key: 'flooded', label: 'Flooded', count: 163, tone: 'flood' },
  { key: 'low', label: 'Low stock', count: 305, tone: 'warn' },
  { key: 'healthy', label: 'Healthy', count: 369, tone: 'ok' },
  { key: 'unverified', label: 'Unverified', count: 3, tone: 'mute' },
];

/** Donut order runs healthy → unverified so the largest slice starts at 12. */
export const FILL_DISTRIBUTION = [
  { label: 'Healthy', value: 369, tone: 'ok' as Tone },
  { label: 'Low Stock', value: 305, tone: 'warn' as Tone },
  { label: 'Flooded', value: 163, tone: 'flood' as Tone },
  { label: 'Empty', value: 62, tone: 'empty' as Tone },
  { label: 'Unverified', value: 3, tone: 'mute' as Tone },
];

export const SCORE_GUIDE = [
  { range: '70–100', label: 'Critical', detail: 'Send truck immediately', tone: 'empty' as Tone },
  { range: '40–69', label: 'Warning', detail: 'Queue within 2 hours', tone: 'warn' as Tone },
  { range: '0–39', label: 'Healthy', detail: 'No action needed', tone: 'ok' as Tone },
  { range: '?', label: 'Unverified', detail: 'Stale >60 min, not scored', tone: 'mute' as Tone },
];

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

export type TruckState = 'en-route' | 'loading' | 'idle';

export interface Truck {
  id: string;
  state: TruckState;
  /** Sub-line on the queue rail. */
  where: string;
  when?: string;
  load: number;
  capacity: number;
  active?: string;
  eta?: string;
}

export const TRUCKS: Truck[] = [
  {
    id: '#4',
    state: 'en-route',
    where: '→ Columbus Ave & W 72',
    when: 'ETA 6 min',
    load: 26,
    capacity: 48,
    active: 'W 72 St & Columbus Ave',
    eta: 'ETA 6 min',
  },
  {
    id: '#7',
    state: 'loading',
    where: 'Depot · 1 Ave & E 18',
    when: 'Departs in ~12 min',
    load: 18,
    capacity: 48,
  },
  { id: '#1', state: 'en-route', where: 'Broadway & W 36 St', load: 31, capacity: 48 },
  { id: '#3', state: 'en-route', where: 'Atlantic Ave & 4 Ave', load: 12, capacity: 48 },
  { id: '#8', state: 'en-route', where: 'Queens Blvd & 46 St', load: 22, capacity: 48 },
  { id: '#2', state: 'idle', where: 'Depot · Greenpoint', load: 0, capacity: 48 },
  { id: '#5', state: 'idle', where: 'Depot · Sunset Park', load: 0, capacity: 48 },
  { id: '#6', state: 'idle', where: 'Depot · Mott Haven', load: 0, capacity: 48 },
];

export const TRUCK_STATE_LABEL: Record<TruckState, string> = {
  'en-route': 'En Route',
  loading: 'Loading',
  idle: 'Idle',
};

export const TRUCK_STATE_TONE: Record<TruckState, Tone> = {
  'en-route': 'ok',
  loading: 'warn',
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

export interface UnverifiedRow {
  name: string;
  deviceId: string;
  iccid: string;
  region: string;
  heartbeat: string;
  excess: string;
  action: 'reset' | 'mechanic';
}

export const UNVERIFIED: UnverifiedRow[] = [
  {
    name: 'E 106 St & Madison Ave',
    deviceId: '#7244.02',
    iccid: '890141…',
    region: 'MANHATTAN',
    heartbeat: '72m ago',
    excess: '12m past threshold',
    action: 'reset',
  },
  {
    name: 'Kent Ave & S 11 St',
    deviceId: '#5116.01',
    iccid: '890141…',
    region: 'BROOKLYN',
    heartbeat: '104m ago',
    excess: '44m past threshold',
    action: 'mechanic',
  },
  {
    name: 'Queens Plaza North & Crescent St',
    deviceId: '#6421.05',
    iccid: '890141…',
    region: 'QUEENS',
    heartbeat: '65m ago',
    excess: '5m past threshold',
    action: 'reset',
  },
];

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

export const BATTERY = { count: 12, caption: 'STATIONS < 15%', share: 0.13 };

export const CELLULAR = [
  { label: 'Verizon (Primary)', value: 'Up', tone: 'ok' as Tone },
  { label: 'AT&T (Backup)', value: 'Up', tone: 'ok' as Tone },
];

export const OUTAGE_FREQUENCY = '0.04%';

/* ---------------------------------------------------------------------------
   Maintenance.
--------------------------------------------------------------------------- */

export interface Ticket {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'MEDIUM';
  tone: Tone;
  icon: IconName;
  where: string;
  reported: string;
  fault: string;
  /** Rendered as inline code inside the fault text. */
  faultCode?: string;
  /** Links the ticket to the station it is about. */
  stationId?: string;
  assignment:
    | { kind: 'pending'; label: string }
    | { kind: 'assigned'; who: string; status: string };
}

export const TICKETS: Ticket[] = [
  {
    id: 'dock-14',
    title: 'Dock #14 Mechanical Jam',
    severity: 'CRITICAL',
    tone: 'empty',
    icon: 'plug-zap',
    where: 'Grand Army Plaza · Station #442 · Brooklyn',
    reported: '13:45',
    fault: 'Solenoid failure in dock locking mechanism. System error code {code}. Multiple user reports confirmed via app help center.',
    faultCode: 'E-14-B',
    stationId: '442',
    assignment: { kind: 'pending', label: 'PENDING MECHANIC' },
  },
  {
    id: 'solar',
    title: 'Solar Power Deficiency',
    severity: 'MEDIUM',
    tone: 'warn',
    icon: 'battery-low',
    where: 'Kent Ave & N 7 St · Station #5116 · Brooklyn',
    reported: '10:12',
    fault: 'Battery level dropping below 15% threshold. Solar panel obstruction or hardware degradation suspected. Site at risk of going offline within 4 hours.',
    stationId: '5116',
    assignment: { kind: 'assigned', who: 'Mark T.', status: 'ON ROUTE' },
  },
];

export const MECHANICS = [
  { name: 'Mark T.', status: 'Solar Deficiency @ Brooklyn', available: false },
  { name: 'Sarah W.', status: 'Available · Manhattan Base', available: true },
];

export const MECHANICS_ON_SHIFT = { active: 2, total: 5 };

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

export interface OffenderRow {
  station: string;
  stationId: string;
  days: number;
  trend: { direction: 'up' | 'down' | 'flat'; value: string };
}

export const CHRONIC_OFFENDERS: OffenderRow[] = [
  {
    station: 'Central Park W & 72 St',
    stationId: '102',
    days: 22,
    trend: { direction: 'up', value: '8%' },
  },
  {
    station: 'Park Ave & E 41 St',
    stationId: '244',
    days: 18,
    trend: { direction: 'flat', value: '0%' },
  },
  {
    station: 'W 20 St & 8 Ave',
    stationId: '182',
    days: 14,
    trend: { direction: 'up', value: '12%' },
  },
  {
    station: 'Jackson Ave & 46 Rd',
    stationId: '629',
    days: 11,
    trend: { direction: 'down', value: '4%' },
  },
];

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

export interface BoroughMetric {
  name: string;
  stations: number;
  trucks: number;
  rebalance: string | null;
  score: number | null;
  tone: Tone;
  /** Links the row to its zone page. Absent for the combined Bronx/SI row. */
  zoneSlug?: string;
}

export const BOROUGH_METRICS: BoroughMetric[] = [
  {
    name: 'Manhattan',
    stations: 318,
    trucks: 2,
    rebalance: '12.4',
    score: 0.85,
    tone: 'ok',
    zoneSlug: 'manhattan',
  },
  {
    name: 'Brooklyn',
    stations: 241,
    trucks: 1,
    rebalance: '18.7',
    score: 0.62,
    tone: 'warn',
    zoneSlug: 'brooklyn',
  },
  {
    name: 'Queens',
    stations: 187,
    trucks: 1,
    rebalance: '24.2',
    score: 0.42,
    tone: 'empty',
    zoneSlug: 'queens',
  },
  { name: 'Bronx/SI (Idle)', stations: 156, trucks: 1, rebalance: null, score: null, tone: 'mute' },
];

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
