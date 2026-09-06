import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import {
  ArrivalBanner,
  Banner,
  Bar,
  Button,
  ScoreBadge,
  SearchInput,
  Select,
  StatusPill,
} from '../ui/primitives';
import { MAPBOX_TOKEN } from '../ui/mapToken';
import type { StationRow } from '../data/stationRow';
import type { MapVehicle } from '../ui/StationMap';
import {
  TIER_LABEL,
  stationFeatures,
  swapFeatures,
  tierCounts,
  tierOf,
  type MapTier,
} from '../data/mapFeatures';
import { findSwapPairs } from '../data/swaps';
import type { ScoredStation } from '../model/summary';
import { useDispatch } from '../store/useDispatch';
import { focusHref, useArrival } from '../state/useFocus';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { cn } from '../lib/cn';
import { BOROUGHS, type Borough } from '../data/boroughs';
import { formatFreeIn } from '../data/fleet';
import {
  STATIONS,
  TOTAL_STATIONS,
  VEHICLES,
  VEHICLE_KIND_CAPACITY,
  VEHICLE_KIND_LABEL,
  VEHICLE_STATE_LABEL,
  VEHICLE_STATE_TONE,
  ZONES,
  stationById,
} from '../mock/data';

/**
 * The network, geographically.
 *
 * Every station comes off one GeoJSON source rendered as GPU circle layers —
 * see `ui/StationMap` for the paint and `data/mapFeatures` for the encoding.
 * This screen owns the controls around it: the borough scope (shared with the
 * Rebalancing board), the jump box, and the legend, which doubles as the tier
 * filter.
 *
 * The dot's *colour* is its urgency band and its *size* is the bikes a vehicle
 * would move there — capacity is deliberately not on the map, because a big
 * healthy station is not a big problem.
 */

/** Legend order is worst-first; paint order (in StationMap) is the reverse. */
const LEGEND_TIERS: readonly MapTier[] = ['critical', 'needs-vehicle', 'healthy', 'silent'];

const StationMap = lazy(() => import('../ui/StationMap'));

export function MapView() {
  const scored = useDispatch((s) => s.scored);
  const lanes = useDispatch((s) => s.lanes);
  const filters = useDispatch((s) => s.filters);
  const setFilters = useDispatch((s) => s.setFilters);
  const byId = useDispatch((s) => s.byId);

  const openStation = useConsole((s) => s.openStation);
  const openStationId = useConsole((s) => s.openStationId);
  const arrival = useArrival();

  const [jump, setJump] = useState('');
  const [flyId, setFlyId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<MapTier>>(
    () => new Set<MapTier>(LEGEND_TIERS),
  );
  const [legendOpen, setLegendOpen] = useState(true);

  const live = Boolean(MAPBOX_TOKEN) && scored.length > 0;
  const borough = filters.borough;

  const inBorough = useMemo(
    () =>
      borough === 'all' ? scored : scored.filter((s) => s.station.borough === borough),
    [scored, borough],
  );

  const counts = useMemo(() => tierCounts(inBorough), [inBorough]);

  const stationsFC = useMemo(
    () => stationFeatures(inBorough.filter((s) => enabled.has(tierOf(s.breakdown)))),
    [inBorough, enabled],
  );

  const pairs = useMemo(() => {
    const lane =
      borough === 'all'
        ? lanes.vehicle
        : lanes.vehicle.filter((s) => s.station.borough === borough);
    return findSwapPairs(lane).slice(0, 40);
  }, [lanes.vehicle, borough]);
  const swapsFC = useMemo(() => swapFeatures(pairs), [pairs]);

  // Two boxes, not one. The camera and the grey-out follow whatever is in scope;
  // how far you may pan and zoom out follows the whole network, so narrowing to
  // a borough never locks you inside it.
  const serviceBounds = useMemo(() => boundsOf(inBorough), [inBorough]);
  const limitBounds = useMemo(() => boundsOf(scored), [scored]);
  const vehicles = useMemo(() => buildVehicles(scored), [scored]);

  const needVehicle = counts.critical + counts['needs-vehicle'];

  /*
   * Derived, not the `VEHICLES_ACTIVE` constant.
   *
   * That constant is a frozen copy of a number the fixture already knows — the
   * exact shape this repo keeps deleting elsewhere — and it answers the wrong
   * question anyway. "Active" counts the vehicles you cannot have; a dispatcher
   * looking at a map full of red is asking how many they can send.
   */
  const vehiclesFree = VEHICLES.filter((v) => v.state === 'idle').length;

  const hits = useMemo(() => {
    const q = jump.trim().toLowerCase();
    if (q.length < 2) return [];
    return scored.filter((s) => s.station.name.toLowerCase().includes(q)).slice(0, 6);
  }, [jump, scored]);

  const goTo = (id: string) => {
    setFlyId(id);
    openStation(id);
    setJump('');
  };

  const toggleTier = (t: MapTier) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const arrived = arrival.focus ? byId.get(arrival.focus) : undefined;
  const focusId = flyId ?? arrival.focus ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Network Status Map"
        subtitle={
          live
            ? 'Where the trouble is, geographically. Colour is urgency, size is how many bikes would fix it.'
            : 'Reading the live feed…'
        }
        actions={
          <>
            <Select
              label="Filter by borough"
              value={borough}
              onChange={(v) => setFilters({ borough: v as Borough | 'all' })}
              options={[
                { value: 'all', label: 'All Boroughs' },
                ...BOROUGHS.filter((b) => b !== 'Unknown').map((b) => ({ value: b, label: b })),
              ]}
            />
            <span className="relative">
              <SearchInput
                value={jump}
                onChange={setJump}
                placeholder="Jump to station…"
                width={186}
              />
              {live && hits.length > 0 && (
                <ul className="card absolute top-full right-0 z-30 mt-1 w-[260px] overflow-hidden py-1 shadow-lg">
                  {hits.map((s) => (
                    <li key={s.station.stationId}>
                      <button
                        type="button"
                        onClick={() => goTo(s.station.stationId)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--color-sunken)]"
                      >
                        <span className="truncate text-[11px] text-[var(--color-ink)]">
                          {s.station.name}
                        </span>
                        <span className="num shrink-0 text-[10px] text-[var(--color-ink-3)]">
                          {s.station.borough}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
          </>
        }
      />

      {arrival.focus && arrival.from && (
        <div className="px-4 pt-3">
          <ArrivalBanner
            from={arrival.from}
            back={arrival.back}
            detail={
              arrived
                ? `showing ${arrived.station.name}`
                : 'that station is not in the current feed — it may have dropped off since the link was made'
            }
            onDismiss={arrival.dismiss}
          />
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {live ? (
          <>
            <Suspense
              fallback={
                <div className="absolute inset-0 grid place-items-center bg-[var(--color-sunken)]">
                  <p className="eyebrow">Loading map…</p>
                </div>
              }
            >
              <StationMap
                stations={stationsFC}
                swaps={swapsFC}
                vehicles={vehicles}
                serviceBounds={serviceBounds}
                limitBounds={limitBounds}
                fitKey={borough}
                selectedId={openStationId}
                focusId={focusId}
                onSelect={openStation}
              />
            </Suspense>
            <MapMetrics
              needVehicle={needVehicle}
              critical={counts.critical}
              swaps={pairs.length}
              free={vehiclesFree}
              fleet={VEHICLES.length}
              stations={inBorough.length}
              borough={borough}
            />
            <LegendFilter
              counts={counts}
              enabled={enabled}
              onToggle={toggleTier}
              open={legendOpen}
              onOpenChange={() => setLegendOpen((v) => !v)}
              swaps={pairs.length}
            />
          </>
        ) : (
          <Schematic openStation={openStation} station={stationById(focusId ?? '') ?? STATIONS[0]!} />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Padded bounding box of a set of stations, or null when none have coordinates. */
function boundsOf(list: ScoredStation[]): [[number, number], [number, number]] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const s of list) {
    const { lat, lon } = s.station;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (!Number.isFinite(minLon)) return null;
  const padLon = (maxLon - minLon) * 0.04 || 0.01;
  const padLat = (maxLat - minLat) * 0.04 || 0.01;
  return [
    [minLon - padLon, minLat - padLat],
    [maxLon + padLon, maxLat + padLat],
  ];
}

/**
 * The whole fleet, translated for the map layer.
 *
 * All eight, idle ones included — the header has always said "5/8 vehicles
 * active" while the map drew three, and an idle van parked at a depot is
 * precisely what a dispatcher with a station to serve is looking for. State
 * colour is the same `VEHICLE_STATE_TONE` the Rebalancing rail and Fleet
 * Operations use, so a green dot means the same thing on all three screens.
 */
function buildVehicles(scored: ScoredStation[]): MapVehicle[] {
  return VEHICLES.map((v) => {
    const dest = v.active ? resolveStation(v.active, scored) : null;
    return {
      id: v.id,
      lat: v.lat,
      lon: v.lon,
      kindLabel: VEHICLE_KIND_LABEL[v.kind],
      wide: v.kind === 'box-truck',
      stateLabel: VEHICLE_STATE_LABEL[v.state],
      accent: TONE[VEHICLE_STATE_TONE[v.state]].fg,
      load: v.load,
      capacity: v.capacity,
      depot: v.depot,
      heading: v.where,
      when: v.when ?? null,
      freeIn: formatFreeIn(v.freeInMin),
      dest: dest ? ([dest.station.lon, dest.station.lat] as [number, number]) : null,
      href: focusHref('/fleet/vehicles', v.id, 'Map View', '/dispatch/map'),
    };
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Best-effort match of a vehicle's destination name to a live station. */
function resolveStation(name: string, scored: ScoredStation[]): ScoredStation | null {
  const target = norm(name);
  const exact = scored.find((s) => norm(s.station.name) === target);
  if (exact) return exact;
  const parts = name.split('&').map(norm).filter(Boolean);
  if (!parts.length) return null;
  return scored.find((s) => {
    const n = norm(s.station.name);
    return parts.every((p) => n.includes(p));
  }) ?? null;
}

/* -------------------------------------------------------------------------- */

/**
 * The four numbers that decide whether this screen is worth looking at, and one
 * that is only context.
 *
 * These were a single run of mono capitals separated by dots — "2,507 STATIONS ·
 * 677 NEED A VEHICLE · 27 SWAPS IN REACH · 5/8 VEHICLES ACTIVE" — in which the
 * station count, which never changes and decides nothing, was set in exactly the
 * same weight and colour as the workload. Four equally loud numbers are four
 * numbers nobody reads.
 *
 * So: the figures carry the tone they carry everywhere else on the board, the
 * labels are plain words rather than shouted ones, and the total drops to the
 * end in grey where context belongs. `of them critical` is doing real work — the
 * critical count is a *subset* of the vehicle count, and two adjacent red and
 * amber numbers would otherwise read as two separate piles that ought to sum.
 *
 * It floats on the map rather than sitting in the masthead. Given its own row in
 * the header it pushed the canvas down by a third of a legend's worth of height
 * to say five things, and a map screen cannot spend that; over the top-left
 * corner it costs nothing, because at every zoom this map allows, the top-left
 * corner is water or the greyed-out ground beyond the service area.
 */
function MapMetrics({
  needVehicle,
  critical,
  swaps,
  free,
  fleet,
  stations,
  borough,
}: {
  needVehicle: number;
  critical: number;
  swaps: number;
  free: number;
  fleet: number;
  stations: number;
  borough: string;
}) {
  const n = (v: number) => v.toLocaleString('en-US');

  return (
    <div className="absolute top-3 left-4 z-10 flex items-start gap-3.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-3 py-2 shadow-[0_2px_10px_rgb(43_38_33/8%)] backdrop-blur-sm">
      <Metric value={n(needVehicle)} label="need a vehicle" tone="warn" />
      <Metric value={n(critical)} label="of them critical" tone="empty" />
      <Metric value={n(swaps)} label={swaps === 1 ? 'swap in reach' : 'swaps in reach'} tone="ink" />
      <Metric
        value={n(free)}
        unit={`of ${fleet}`}
        label="vehicles free"
        tone={free > 0 ? 'ok' : 'mute'}
      />

      <span aria-hidden="true" className="mt-0.5 h-[24px] w-px bg-[var(--color-line)]" />

      <Metric
        value={n(stations)}
        label={borough === 'all' ? 'stations' : borough}
        tone="mute"
        quiet
      />
    </div>
  );
}

function Metric({
  value,
  unit,
  label,
  tone,
  quiet = false,
}: {
  value: string;
  unit?: string;
  label: string;
  tone: Tone;
  quiet?: boolean;
}) {
  return (
    <span className="flex flex-col">
      <span
        className={cn('num leading-none font-semibold', quiet ? 'text-[12px]' : 'text-[16px]')}
        style={{ color: quiet ? 'var(--color-ink-3)' : TONE[tone].fg }}
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-[9px] font-medium text-[var(--color-ink-3)]">{unit}</span>
        )}
      </span>
      <span className="mt-1 text-[9px] leading-none whitespace-nowrap text-[var(--color-ink-3)]">
        {label}
      </span>
    </span>
  );
}

function TierSwatch({ tier }: { tier: MapTier }) {
  if (tier === 'silent') {
    return (
      <span
        aria-hidden="true"
        className="h-[9px] w-[9px] shrink-0 rounded-full border-[1.5px]"
        style={{ borderColor: TONE.mute.fg }}
      />
    );
  }
  const tone: Tone = tier === 'critical' ? 'empty' : tier === 'needs-vehicle' ? 'warn' : 'ok';
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full"
      style={{
        width: tier === 'healthy' ? 6 : 9,
        height: tier === 'healthy' ? 6 : 9,
        backgroundColor: TONE[tone].fg,
        opacity: tier === 'healthy' ? 0.5 : 1,
      }}
    />
  );
}

/**
 * The key, and the filter.
 *
 * Each row is a toggle: press it and that band leaves the map, so a dispatcher
 * working criticals can drop the 1,800 healthy dots to nothing. Counts are live
 * and scoped to the borough. Collapsible because at its full height it sat over
 * Jersey City.
 */
function LegendFilter({
  counts,
  enabled,
  onToggle,
  open,
  onOpenChange,
  swaps,
}: {
  counts: Record<MapTier, number>;
  enabled: Set<MapTier>;
  onToggle: (t: MapTier) => void;
  open: boolean;
  onOpenChange: () => void;
  swaps: number;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-10 w-[224px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]/95 shadow-[0_2px_10px_rgb(43_38_33/8%)] backdrop-blur-sm">
      <button
        type="button"
        onClick={onOpenChange}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[var(--color-sunken)]"
      >
        <span className="eyebrow text-[10px]">Urgency</span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn(
            'text-[var(--color-ink-3)] transition-transform',
            !open && '-rotate-90',
          )}
        />
      </button>

      {open && (
        <>
          <ul className="border-t border-[var(--color-line-soft)] px-1.5 py-1.5">
            {LEGEND_TIERS.map((tier) => {
              const on = enabled.has(tier);
              return (
                <li key={tier}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggle(tier)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[10px] transition-colors hover:bg-[var(--color-sunken)]',
                      !on && 'opacity-40',
                    )}
                  >
                    <TierSwatch tier={tier} />
                    <span
                      className={cn(
                        'flex-1 text-[var(--color-ink-2)]',
                        !on && 'line-through',
                      )}
                    >
                      {TIER_LABEL[tier]}
                    </span>
                    <span className="num text-[10px] font-semibold text-[var(--color-ink)]">
                      {counts[tier].toLocaleString('en-US')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-[var(--color-line-soft)] px-3 py-2">
            <p className="eyebrow mb-1.5 text-[9px]">Fleet</p>
            <div className="flex items-center gap-2 text-[10px] text-[var(--color-ink-2)]">
              <span className="flex w-[24px] shrink-0 justify-center">
                <span
                  aria-hidden="true"
                  className="h-[9px] w-[10px] rounded-[2px] border-[1.5px]"
                  style={{ borderColor: TONE.mute.fg }}
                />
              </span>
              Van · holds {VEHICLE_KIND_CAPACITY.van}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-ink-2)]">
              <span className="flex w-[24px] shrink-0 justify-center">
                <span
                  aria-hidden="true"
                  className="h-[9px] w-[18px] rounded-[2px] border-[1.5px] border-l-[4px]"
                  style={{ borderColor: TONE.mute.fg }}
                />
              </span>
              Box truck · holds {VEHICLE_KIND_CAPACITY['box-truck']}
            </div>
            <p className="mt-1.5 pl-[32px] text-[9px] leading-snug text-[var(--color-ink-3)]">
              Colour is its state, fill is how loaded it is. Click one for the rest.
            </p>
          </div>

          <div className="border-t border-[var(--color-line-soft)] px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] text-[var(--color-ink-2)]">
              <span
                aria-hidden="true"
                className="h-0 w-[18px] shrink-0 border-t-[1.5px] border-dashed"
                style={{ borderColor: TONE.ok.fg }}
              />
              Vehicle route
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--color-ink-2)]">
              <span
                aria-hidden="true"
                className="h-0 w-[18px] shrink-0 border-t-[1.5px] border-dotted border-[var(--color-ink-2)]"
              />
              Swap pair{swaps > 0 && <span className="num"> · {swaps} now</span>}
            </div>
            {/* The count is a network total and stays true at every zoom; the
                lines are not drawn until the two stations they join are on the
                map as themselves. Saying so beats a reader hunting for 24
                connectors that are inside the clusters. */}
            <p className="mt-1 pl-[26px] text-[9px] leading-snug text-[var(--color-ink-3)]">
              Drawn once you zoom past the clusters.
            </p>
          </div>

          <p className="border-t border-[var(--color-line-soft)] px-3 py-2 text-[10px] leading-snug text-[var(--color-ink-3)]">
            Dot size is bikes to move, not station size. Click a station for its full score.
          </p>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The no-token fallback: a drawn plan with a handful of hand-placed pins.
 *
 * Kept because a clone of this repo with no `VITE_MAPBOX_TOKEN` would otherwise
 * render an empty grey rectangle, and a schematic that says what it is beats a
 * blank screen. Everything real happens in the live branch above.
 */
const STATION_MARKERS: { x: number; y: number; tone: Tone; stationId?: string }[] = [
  { x: 41, y: 30, tone: 'empty', stationId: '102' },
  { x: 47, y: 27, tone: 'empty', stationId: '244' },
  { x: 36, y: 38, tone: 'ok', stationId: '442' },
  { x: 52, y: 34, tone: 'warn', stationId: '182' },
  { x: 57, y: 42, tone: 'warn', stationId: '517' },
  { x: 29, y: 45, tone: 'empty', stationId: '311' },
  { x: 44, y: 52, tone: 'warn', stationId: '408' },
  { x: 62, y: 55, tone: 'mute', stationId: '7244' },
  { x: 66, y: 60, tone: 'flood' },
  { x: 33, y: 62, tone: 'ok' },
  { x: 71, y: 35, tone: 'ok' },
  { x: 25, y: 55, tone: 'warn' },
];

const ZONE_MARKERS = [
  { x: 49, y: 22, count: ZONES[3]!.stations },
  { x: 44, y: 47, count: ZONES[0]!.stations },
  { x: 68, y: 50, count: ZONES[2]!.stations },
  { x: 52, y: 74, count: ZONES[1]!.stations },
];

function Schematic({
  openStation,
  station,
}: {
  openStation: (id: string) => void;
  station: StationRow;
}) {
  const [focusId, setFocusId] = useState('102');
  const shown = stationById(focusId) ?? station;

  return (
    <>
      <Basemap />

      <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
        <Banner tone="warn" icon="alert-triangle">
          No Mapbox token, so this is the schematic map — a dozen hand-placed pins, not the{' '}
          {TOTAL_STATIONS} real ones. Set <code className="num">VITE_MAPBOX_TOKEN</code> in{' '}
          <code className="num">.env</code> for live geography.
        </Banner>
      </div>

      {STATION_MARKERS.map((m, i) => {
        const named = m.stationId ? stationById(m.stationId) : null;
        if (!named) {
          return (
            <span
              key={`s${i}`}
              aria-hidden="true"
              className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80"
              style={{ left: `${m.x}%`, top: `${m.y}%`, backgroundColor: TONE[m.tone].fg }}
            />
          );
        }
        const focused = focusId === named.id;
        return (
          <button
            key={`s${i}`}
            type="button"
            onClick={() => setFocusId(named.id)}
            onDoubleClick={() => openStation(named.id)}
            aria-label={`${named.name}. Show details.`}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition-transform hover:scale-125',
              focused ? 'h-[13px] w-[13px] border-2 border-white' : 'h-[9px] w-[9px] border-white/80',
            )}
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              backgroundColor: TONE[m.tone].fg,
              boxShadow: focused ? `0 0 0 3px ${TONE[m.tone].fg}44` : undefined,
            }}
          />
        );
      })}

      {ZONE_MARKERS.map((m, i) => (
        <span
          key={`z${i}`}
          className="num absolute flex h-[24px] w-[24px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-ink)] bg-[var(--color-surface)] text-[10px] font-semibold text-[var(--color-ink)]"
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
        >
          {m.count}
        </span>
      ))}

      <StationPopup station={shown} onOpen={() => openStation(shown.id)} />
    </>
  );
}

function StationPopup({ station, onOpen }: { station: StationRow; onOpen: () => void }) {
  const pct = station.bikes !== null ? Math.round((station.bikes / station.docks) * 100) : null;
  const free = station.bikes !== null ? station.docks - station.bikes : null;

  return (
    <div className="absolute top-4 left-4 w-[218px] rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-[0_4px_20px_rgb(43_38_33/10%)]">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-[12px] leading-tight font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
        >
          {station.name}
        </button>
        <ScoreBadge score={station.score} size="sm" />
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--color-ink-3)]">
        {station.borough} · Station {station.stationNumber}
      </p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--color-ink-2)]">Status</span>
        <StatusPill label={station.status} />
      </div>
      <div className="mt-2">
        <Bar value={station.fill} tone={station.fillTone} height={5} />
      </div>
      <div className="num mt-1.5 flex justify-between text-[10px] text-[var(--color-ink-3)]">
        <span>{pct === null ? 'unknown' : `${pct}% utilization`}</span>
        <span>{free === null ? '—' : `${free} slots free`}</span>
      </div>
      <Button
        variant="dark"
        icon="vehicle"
        className="mt-3 w-full"
        notBuilt="Dispatching lives in the station drawer — click a dot on the map."
      >
        Dispatch Vehicle
      </Button>
      <Link
        to={focusHref('/', station.id, 'Map View', '/dispatch/map')}
        className="mt-1.5 flex cursor-pointer items-center justify-center gap-1 text-[10px] text-[var(--color-ink-3)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
      >
        <Icon name="list-ordered" size={11} />
        Find in the rebalancing list
      </Link>
    </div>
  );
}

function Basemap() {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-[#f2efe8]">
      <div className="absolute inset-y-0 -left-24 w-52 bg-[#e5eaea]" style={{ transform: 'skewX(-6deg)' }} />
      <div className="absolute inset-y-0 -right-28 w-64 bg-[#e5eaea]" style={{ transform: 'skewX(-6deg)' }} />
      <div
        className="absolute top-[6%] left-[40%] h-[46%] w-[9%] rounded-sm bg-[#e2e8db]"
        style={{ transform: 'rotate(6deg)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(177deg, transparent 0 26px, #fbf9f5 26px 30px)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(84deg, transparent 0 62px, #fbf9f5 62px 68px)',
        }}
      />
      <span className="absolute top-[16%] right-[9%] text-[22px] font-semibold tracking-[0.14em] text-[#cdc7bb]">
        QUEENS
      </span>
      <span className="absolute bottom-[10%] left-[16%] text-[22px] font-semibold tracking-[0.14em] text-[#cdc7bb]">
        BROOKLYN
      </span>
    </div>
  );
}
