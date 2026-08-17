import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import {
  ArrivalBanner,
  Banner,
  Bar,
  Button,
  FilterChip,
  ScoreBadge,
  SearchInput,
  Segmented,
  StatusPill,
} from '../ui/primitives';
import { MAPBOX_TOKEN } from '../ui/mapToken';
import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD } from '../model/score';
import type { StationRow } from '../data/stationRow';

/**
 * Loaded on demand. `mapbox-gl` is 1.6 MB — larger than the whole rest of the
 * console — and most sessions never leave the queue. Pulling it eagerly took
 * the main bundle from 250 kB to 2.3 MB to serve a screen nobody had opened.
 */
const StationMap = lazy(() => import('../ui/StationMap'));
import { useDispatch } from '../store/useDispatch';
import { toStationRow } from '../data/adapt';
import { focusHref, useArrival } from '../state/useFocus';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { cn } from '../lib/cn';
import {
  STATIONS,
  TOTAL_STATIONS,
  TRUCKS_ACTIVE,
  TRUCKS_TOTAL,
  ZONES,
  stationById,
} from '../mock/data';

/**
 * The network, geographically.
 *
 * A note on the basemap: the comp for this screen shows a rendered aerial of
 * Manhattan. No such asset exists in the repo and the app makes no runtime
 * requests, so the ground here is a drawn plan — avenues, cross streets, the
 * park, the rivers — carrying the same palette and the same marker language.
 * It is deliberately schematic rather than a bad tracing of real geography.
 * Swapping in Mapbox/MapLibre later means replacing <Basemap> and giving the
 * markers real lat/lon; nothing else on the screen changes.
 */

interface Marker {
  x: number;
  y: number;
  tone: Tone;
  /** Pins carrying a station open its receipt; the rest are network texture. */
  stationId?: string;
}

const STATION_MARKERS: Marker[] = [
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

const TRUCK_MARKERS = [
  { x: 38, y: 24 },
  { x: 40, y: 41 },
  { x: 55, y: 62 },
  { x: 63, y: 78 },
  { x: 32, y: 82 },
];

/** Cluster badges sit roughly where each borough's mass is. */
const ZONE_MARKERS = [
  { x: 49, y: 22, count: ZONES[3]!.stations },
  { x: 44, y: 47, count: ZONES[0]!.stations },
  { x: 68, y: 50, count: ZONES[2]!.stations },
  { x: 52, y: 74, count: ZONES[1]!.stations },
];

export function MapView() {
  const [layer, setLayer] = useState<'bikes' | 'docks'>('bikes');
  const [jump, setJump] = useState('');
  const [needsTruckOnly, setNeedsTruckOnly] = useState(false);
  /** The pin the popup is describing. Clicking a pin moves the popup to it. */
  const [focusId, setFocusId] = useState('102');
  const openStation = useConsole((s) => s.openStation);
  const byId = useDispatch((s) => s.byId);
  const scored = useDispatch((s) => s.scored);
  const arrival = useArrival();

  // Real geography needs both a token and a feed. Either missing falls back to
  // the schematic rather than to an empty rectangle.
  const live = Boolean(MAPBOX_TOKEN) && scored.length > 0;
  const needsTruck = scored.filter((s) => s.breakdown.needsTruck).length;

  /**
   * Where the map should fly next.
   *
   * "Jump to station" was a text input bound to state nothing read — you could
   * type into it and the map sat still. With sixteen fixed pins there was
   * nothing to jump to; with 2,509 real ones it is the only way to find a named
   * station without hunting.
   */
  const [flyId, setFlyId] = useState<string | null>(null);
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

  // A link from Unverified names a live station id, which is not one of the
  // schematic pins — resolve it from the feed so the card can still describe it.
  const arrived = arrival.focus ? byId.get(arrival.focus) : undefined;
  const station = arrived ? toStationRow(arrived) : (stationById(focusId) ?? STATIONS[0]!);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Network Status Map"
        subtitle={
          <span className="num inline-flex items-center gap-1.5 text-[10px] tracking-[0.08em] uppercase">
            <span
              aria-hidden="true"
              className="pulse-dot h-[5px] w-[5px] rounded-full"
              style={{ backgroundColor: TONE.ok.fg }}
            />
            {(live ? scored.length : TOTAL_STATIONS).toLocaleString('en-US')} stations ·{' '}
            {live && <>{needsTruck.toLocaleString('en-US')} need a truck · </>}
            {TRUCKS_ACTIVE}/{TRUCKS_TOTAL} trucks active
          </span>
        }
        actions={
          <>
            {live && (
              <FilterChip
                label="Needs a truck"
                tone="warn"
                count={needsTruck}
                active={needsTruckOnly}
                onClick={() => setNeedsTruckOnly((v) => !v)}
              />
            )}
            <Segmented
              label="Map layer"
              value={layer}
              onChange={setLayer}
              options={[
                { value: 'bikes', label: 'Urgency' },
                { value: 'docks', label: 'Fill' },
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
                : 'that station has no pin on this schematic map — the card below describes it instead'
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
                scored={scored}
                layer={layer === 'bikes' ? 'score' : 'fill'}
                needsTruckOnly={needsTruckOnly}
                focusId={flyId ?? arrival.focus ?? null}
                onSelect={openStation}
              />
            </Suspense>
            <MapLegend layer={layer} showTruck={false} />
          </>
        ) : (
          <Schematic
            layer={layer}
            focusId={focusId}
            setFocusId={setFocusId}
            openStation={openStation}
            station={station}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The drawn plan, kept as the no-token fallback.
 *
 * Not deleted along with the swap to real geography: a clone of this repo with
 * no Mapbox token would otherwise render an empty grey rectangle, and a blank
 * screen is a worse answer than a schematic one that says what it is.
 */
function Schematic({
  layer,
  focusId,
  setFocusId,
  openStation,
  station,
}: {
  layer: 'bikes' | 'docks';
  focusId: string;
  setFocusId: (id: string) => void;
  openStation: (id: string) => void;
  station: StationRow;
}) {
  return (
    <>
      <Basemap />

      <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
        <Banner tone="warn" icon="alert-triangle">
          No Mapbox token, so this is the schematic map — sixteen hand-placed pins, not the{' '}
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
            className="num absolute flex h-[24px] w-[24px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-ink)] bg-[var(--color-surface)] text-[9px] font-semibold text-[var(--color-ink)]"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          >
            {m.count}
          </span>
        ))}

        {TRUCK_MARKERS.map((m, i) => (
          <span
            key={`t${i}`}
            aria-hidden="true"
            className="absolute flex h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--color-ink)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          >
            <Icon name="truck" size={12} />
          </span>
        ))}

      <StationPopup station={station} onOpen={() => openStation(station.id)} />
      <MapLegend layer={layer} />
    </>
  );
}

/**
 * The key.
 *
 * The map is the only screen where color is the entire message and there is no
 * text beside it — without this, four colored dots mean nothing to anyone who
 * has not already memorised the Score Guide on the queue.
 */
function MapLegend({ layer, showTruck = true }: { layer: 'bikes' | 'docks'; showTruck?: boolean }) {
  // The two layers colour the same dots by different questions, so one fixed
  // key would be wrong half the time. Urgency reuses the Score Guide's bands
  // exactly; fill reuses the warm/cool split — warm means nobody can rent,
  // cool means nobody can return.
  const items: { label: string; tone: Tone }[] =
    layer === 'bikes'
      ? [
          { label: `Critical · ${CRITICAL_THRESHOLD}+`, tone: 'empty' },
          { label: `Needs a truck · ${NEEDS_TRUCK_THRESHOLD}–${CRITICAL_THRESHOLD - 1}`, tone: 'warn' },
          { label: `Drifting · under ${NEEDS_TRUCK_THRESHOLD}`, tone: 'ok' },
          // Called "Unverified" for about an hour, which was wrong by two
          // orders of magnitude: exactly one station in the network is in the
          // unverified lane, while ~107 grey dots are racks the feed lists but
          // that are not installed in the ground — most of them the east
          // Brooklyn expansion. Naming them after the rare case sent a reader
          // hunting for a hundred silent stations that do not exist.
          { label: 'Not installed or silent', tone: 'mute' },
        ]
      : [
          { label: 'Out of bikes · under 15%', tone: 'empty' },
          { label: 'Balanced', tone: 'ok' },
          { label: 'Out of docks · over 85%', tone: 'flood' },
          { label: 'No usable slots reported', tone: 'mute' },
        ];

  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-3 py-2.5 shadow-[0_2px_10px_rgb(43_38_33/8%)]">
      <p className="eyebrow text-[8px]">{layer === 'bikes' ? 'Urgency' : 'Fill'}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 text-[10px] text-[var(--color-ink-2)]">
            <span
              aria-hidden="true"
              className="h-[7px] w-[7px] shrink-0 rounded-full border border-white/80"
              style={{ backgroundColor: TONE[i.tone].fg }}
            />
            {i.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-[var(--color-line-soft)] pt-2 text-[9.5px] leading-snug text-[var(--color-ink-3)]">
        Dot size is station capacity. Click one to open its receipt.
      </p>
      {showTruck && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--color-ink-2)]">
          <span
            aria-hidden="true"
            className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded border border-[var(--color-ink)] bg-[var(--color-surface)]"
          >
            <Icon name="truck" size={9} />
          </span>
          Truck
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StationPopup({
  station,
  onOpen,
}: {
  station: (typeof STATIONS)[number];
  onOpen: () => void;
}) {
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

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <MiniStat label="Bikes / Docks">
          <span className="num text-[13px] font-semibold" style={{ color: TONE.empty.fg }}>
            {station.bikes ?? '—'}
          </span>
          <span className="num text-[11px] text-[var(--color-ink-3)]"> / {station.docks}</span>
        </MiniStat>
        <MiniStat label="Inbound ETA">
          <span className="num text-[13px] font-semibold text-[var(--color-ink)]">6</span>
          <span className="num text-[10px] text-[var(--color-ink-3)]"> min</span>
        </MiniStat>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-[var(--color-ink-2)]">Borough Status</span>
        <StatusPill label={station.status} />
      </div>

      <div className="mt-2">
        <Bar value={station.fill} tone={station.fillTone} height={5} />
      </div>
      <div className="num mt-1.5 flex justify-between text-[9px] text-[var(--color-ink-3)]">
        <span>{pct === null ? 'unknown' : `${pct}% utilization`}</span>
        <span>{free === null ? '—' : `${free} slots free`}</span>
      </div>

      <Button
        variant="dark"
        icon="truck"
        className="mt-3 w-full"
        notBuilt="Dispatching lives in the station drawer — click a dot on the map."
      >
        Dispatch Truck
      </Button>
      <Link
        to={focusHref('/', station.id, 'Map View', '/map')}
        className="mt-1.5 flex cursor-pointer items-center justify-center gap-1 text-[10px] text-[var(--color-ink-3)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
      >
        <Icon name="list-ordered" size={11} />
        Find in the Priority Queue
      </Link>
    </div>
  );
}

function MiniStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-sunken)] px-2 py-1.5">
      <p className="eyebrow text-[8px]">{label}</p>
      <p className="mt-1 leading-none">{children}</p>
    </div>
  );
}

/**
 * The drawn ground.
 *
 * Built from CSS gradients rather than an SVG viewBox: the map pane is whatever
 * shape the window makes it, and a fixed viewBox either distorts the grid or
 * scales the labels to billboard size. Repeating gradients stay the same
 * physical width at any aspect ratio.
 */
function Basemap() {
  return (
    <div aria-hidden="true" className="absolute inset-0 bg-[#f2efe8]">
      {/* Rivers */}
      <div
        className="absolute inset-y-0 -left-24 w-52 bg-[#e5eaea]"
        style={{ transform: 'skewX(-6deg)' }}
      />
      <div
        className="absolute inset-y-0 -right-28 w-64 bg-[#e5eaea]"
        style={{ transform: 'skewX(-6deg)' }}
      />

      {/* Park */}
      <div
        className="absolute top-[6%] left-[40%] h-[46%] w-[9%] rounded-sm bg-[#e2e8db]"
        style={{ transform: 'rotate(6deg)' }}
      />

      {/* Cross streets */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(177deg, transparent 0 26px, #fbf9f5 26px 30px)',
        }}
      />

      {/* Avenues */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(84deg, transparent 0 62px, #fbf9f5 62px 68px)',
        }}
      />

      {/* Two arterials and one diagonal */}
      <div className="absolute top-[46%] -left-10 h-[7px] w-[130%] bg-[#f6f3ec]" style={{ transform: 'rotate(-1.5deg)' }} />
      <div className="absolute top-[76%] -left-10 h-[7px] w-[130%] bg-[#f6f3ec]" style={{ transform: 'rotate(-1.5deg)' }} />
      <div
        className="absolute -top-10 left-[46%] h-[160%] w-[9px] bg-[#f7f4ee]"
        style={{ transform: 'rotate(14deg)' }}
      />

      <span className="absolute top-[16%] right-[9%] text-[22px] font-semibold tracking-[0.14em] text-[#cdc7bb]">
        QUEENS
      </span>
      <span className="absolute bottom-[10%] left-[16%] text-[22px] font-semibold tracking-[0.14em] text-[#cdc7bb]">
        BROOKLYN
      </span>
      <span className="absolute top-[26%] left-[40.5%] text-[10px] font-semibold tracking-[0.1em] text-[#b0b8a3]">
        PARK
      </span>
    </div>
  );
}
