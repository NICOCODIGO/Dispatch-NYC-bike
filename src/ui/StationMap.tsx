/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FeatureCollection, MapTier, StationFeatureProps } from '../data/mapFeatures';
import { Icon } from './Icon';
import { MAPBOX_TOKEN } from './mapToken';

/**
 * The network on real geography.
 *
 * One GeoJSON source, styled entirely by data-driven expressions — never 2,500
 * DOM markers, which cannot pan at 60fps and would drag React into reconciling
 * two thousand nodes on every poll. The domain→GeoJSON transform lives in
 * `data/mapFeatures.ts`; this component only knows about circles, lines and a
 * camera.
 *
 * ## Layer order is load-bearing
 *
 * The four station layers paint healthy → silent → needs-vehicle → critical, so
 * a red dot is never hidden under a green one. Clusters sit above them because a
 * cluster is a summary you click to break open, not a station.
 *
 * ## What counts as a "marker" here
 *
 * Only the vehicles — three of them, each with a route line and a text label the
 * circle layers cannot carry. Everything with thousands of instances is a layer.
 */

/**
 * The pan clamp used until the feed arrives — roughly the real Citi Bike
 * envelope: Bayonne and Jersey City west, the north Bronx, the Rockaways, and
 * east Queens. Once stations are loaded this is replaced by their own bounding
 * box, because the only correct answer to "how far can I pan" is "as far as
 * there are stations".
 */
export const METRO_BOUNDS: [[number, number], [number, number]] = [
  [-74.16, 40.55],
  [-73.72, 40.92],
];

/** Extra room around the widest allowed frame, as a share of its own span. */
const PAN_SLACK = 0.03;

const SRC = 'stations';
const SRC_SWAPS = 'swaps';
const SRC_ROUTES = 'vehicle-routes';
const SRC_MASK = 'service-mask';

const L_HEALTHY = 'stations-healthy';
const L_SILENT = 'stations-silent';
const L_NEEDS = 'stations-needs';
const L_CRITICAL = 'stations-critical';
const L_SELECTED = 'stations-selected';
const L_CLUSTER = 'clusters';
const L_CLUSTER_COUNT = 'cluster-count';
const DOT_LAYERS = [L_HEALTHY, L_SILENT, L_NEEDS, L_CRITICAL] as const;

/** Fill and stroke opacity each dot layer sits at when nothing is selected. */
const BASE_FILL: Record<string, number> = {
  [L_HEALTHY]: 0.35,
  [L_SILENT]: 0,
  [L_NEEDS]: 0.8,
  [L_CRITICAL]: 0.95,
};
const BASE_STROKE: Record<string, number> = {
  [L_HEALTHY]: 0,
  [L_SILENT]: 0.9,
  [L_NEEDS]: 0.5,
  [L_CRITICAL]: 0.65,
};
/** What every other layer drops to while one station is selected. */
const DIM = 0.22;

/** Filter value for the selection ring when nothing is open. Station ids are
 *  UUIDs or digits, so this can never accidentally match one. */
const NO_SELECTION = '—none—';

/** Above this zoom, stations stop clustering and draw as themselves. */
const CLUSTER_MAX_ZOOM = 12;

/**
 * Swap connectors appear exactly when their endpoints do.
 *
 * A swap is a claim about two specific stations 500 m apart. Below the cluster
 * break those stations are not on the map — they are inside a numbered circle —
 * so the line had nothing to point at: at the network view a 500 m hop is nine
 * pixels of dash, close enough to a smudge that it read as map furniture rather
 * than as a job. Tying the threshold to the cluster break rather than picking a
 * number means the two can never drift apart.
 */
const SWAP_MIN_ZOOM = CLUSTER_MAX_ZOOM + 1;

/**
 * The wash over everything outside the service area.
 *
 * Deliberately a grey rather than the page's cream: washing a near-white
 * basemap with a near-white scrim changes nothing, and the point is to drop the
 * contrast of roads and town names in a county with no stations in it.
 */
const MASK_COLOR = '#ddd9d0';
const MASK_OPACITY = 0.66;

type Coord = [number, number];
type Json = Record<string, unknown>;

/** `@types/geojson` is not a dependency, so features come back loosely typed;
 *  this is the shape we actually read off them. */
interface QueriedFeature {
  properties?: Json | null;
  geometry?: { type: string; coordinates: unknown };
}

/**
 * Mapbox cannot read CSS custom properties, so the palette is resolved to
 * literal hex once. Read from the document rather than duplicated, so a token
 * change still only happens in `index.css`.
 */
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  return {
    critical: get('--color-empty', '#be4439'),
    warn: get('--color-warn', '#a16b1e'),
    ok: get('--color-ok', '#2f7a52'),
    mute: get('--color-mute', '#7d756a'),
    ink: get('--color-ink', '#2b2621'),
    ink2: get('--color-ink-2', '#6f665a'),
    surface: get('--color-surface', '#ffffff'),
  };
}

/**
 * A vehicle, already translated out of the domain.
 *
 * Everything is a primitive or a pre-formatted string on purpose: the caller
 * owns what a "box truck" is and what `freeInMin` reads as in English, and this
 * component owns where the pixels go. That keeps `ui/` clear of the fleet model
 * the way it is clear of the scoring model.
 */
export interface MapVehicle {
  id: string;
  lat: number;
  lon: number;
  /** "Van" / "Box truck". */
  kindLabel: string;
  /** Box trucks draw a wider body with a cab block — the silhouette is the type. */
  wide: boolean;
  /** "En Route" / "Loading" / "On Site" / "Idle". */
  stateLabel: string;
  /** A CSS colour for the state, e.g. `var(--color-ok)`. */
  accent: string;
  load: number;
  capacity: number;
  depot: string;
  /** Where it is going or what it is doing, in words. */
  heading: string;
  /** "ETA 6 min" / "Departs in ~12 min", where there is one. */
  when: string | null;
  /** When it can take a new job: "now" / "~18 min". */
  freeIn: string;
  /** Destination coordinate, when the vehicle is heading somewhere. */
  dest: Coord | null;
  /** Where the card's "open in Fleet Operations" link goes. */
  href: string;
}

type StationFC = FeatureCollection<{
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: Coord };
  properties: StationFeatureProps;
}>;
type SwapFC = FeatureCollection<{
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: Coord[] };
  properties: { bikes: number; meters: number; label: string };
}>;

interface Props {
  /** Already filtered by borough and by which tiers the legend has enabled. */
  stations: StationFC;
  swaps: SwapFC;
  vehicles: MapVehicle[];
  /** Bounding box of what is currently in scope — the camera and the mask. */
  serviceBounds: [Coord, Coord] | null;
  /**
   * Bounding box of the whole network, borough filter ignored. Sets how far the
   * reader can pan and how far out they can zoom, so narrowing to one borough
   * never traps them inside it.
   */
  limitBounds: [Coord, Coord] | null;
  /** Refit the camera to `serviceBounds` whenever this changes (e.g. borough). */
  fitKey: string;
  /** The open station: gets a ring, everything else dims. */
  selectedId: string | null;
  /** Fly here when it changes — deep links and the jump box. */
  focusId?: string | null;
  onSelect: (stationId: string) => void;
}

type Hover = { x: number; y: number; p: StationFeatureProps } | null;

const EMPTY = { type: 'FeatureCollection' as const, features: [] as unknown[] };

export default function StationMap({
  stations,
  swaps,
  vehicles,
  serviceBounds,
  limitBounds,
  fitKey,
  selectedId,
  focusId,
  onSelect,
}: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  /** The vehicle whose detail card is open, and where to draw it. */
  const [card, setCard] = useState<{ v: MapVehicle; x: number; y: number } | null>(null);
  const cardRef = useRef<MapVehicle | null>(null);
  cardRef.current = card?.v ?? null;

  const openCard = useCallback((v: MapVehicle) => {
    const m = map.current;
    if (!m) return;
    const p = m.project([v.lon, v.lat]);
    setCard({ v, x: p.x, y: p.y });
  }, []);

  const select = useRef(onSelect);
  select.current = onSelect;
  // The camera-fit effect keys on `fitKey`, so it reads bounds and focus through
  // refs rather than refitting on every poll's near-identical box.
  const boundsRef = useRef(serviceBounds);
  boundsRef.current = serviceBounds;
  const limitRef = useRef(limitBounds);
  limitRef.current = limitBounds;
  const focusRef = useRef(focusId);
  focusRef.current = focusId;
  const fitted = useRef(false);
  /** The outer frame the viewport may never leave, and a re-entrancy guard for
   *  the `move` handler that enforces it. */
  const frameRef = useRef<[Coord, Coord] | null>(METRO_BOUNDS);
  const clamping = useRef(false);
  /**
   * The camera the data asked for, and whether the reader has since overridden
   * it. The map is created before the flex row has settled on a height, so the
   * first fit lands against the wrong viewport and has to be re-applied when the
   * container resizes — but only until somebody pans, after which the frame is
   * theirs.
   */
  const fitTarget = useRef<[Coord, Coord] | null>(null);
  const userMoved = useRef(false);

  /* -- create once ----------------------------------------------------------- */
  useEffect(() => {
    if (!holder.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const c = palette();

    const m = new mapboxgl.Map({
      container: holder.current,
      style: 'mapbox://styles/mapbox/light-v11',
      bounds: METRO_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      maxBounds: METRO_BOUNDS,
      minZoom: 9,
      maxZoom: 17,
    });
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    m.on('load', () => {
      quietBasemap(m);

      m.addSource(SRC_MASK, { type: 'geojson', data: maskPolygon(METRO_BOUNDS) });
      m.addLayer({
        id: SRC_MASK,
        type: 'fill',
        source: SRC_MASK,
        paint: { 'fill-color': MASK_COLOR, 'fill-opacity': MASK_OPACITY },
      });

      m.addSource(SRC_SWAPS, { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'swap-lines',
        type: 'line',
        source: SRC_SWAPS,
        minzoom: SWAP_MIN_ZOOM,
        paint: {
          'line-color': c.ink2,
          'line-width': 1.4,
          'line-opacity': 0.9,
          'line-dasharray': [2, 1.5],
        },
      });
      m.addLayer({
        id: 'swap-labels',
        type: 'symbol',
        source: SRC_SWAPS,
        minzoom: SWAP_MIN_ZOOM,
        layout: {
          // `line-center` puts the pill at the midpoint of the hop; the viewport
          // rotation keeps it readable, since a 300 m connector can point any
          // direction and half of them would otherwise print upside down.
          'symbol-placement': 'line-center',
          'text-rotation-alignment': 'viewport',
          'text-pitch-alignment': 'viewport',
          'text-field': ['get', 'label'],
          'text-size': 10,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-letter-spacing': 0.02,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': c.ink,
          'text-halo-color': c.surface,
          'text-halo-width': 2,
        },
      });

      m.addSource(SRC_ROUTES, { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: SRC_ROUTES,
        type: 'line',
        source: SRC_ROUTES,
        paint: {
          'line-color': c.ok,
          'line-width': 1.6,
          'line-opacity': 0.9,
          'line-dasharray': [1.5, 1.5],
        },
      });

      m.addSource(SRC, {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: 50,
        clusterProperties: {
          crit: ['+', ['case', ['==', ['get', 'tier'], 'critical'], 1, 0]],
          warn: ['+', ['case', ['==', ['get', 'tier'], 'needs-vehicle'], 1, 0]],
        },
      });

      const tierFilter = (t: MapTier) => [
        'all',
        ['!', ['has', 'point_count']],
        ['==', ['get', 'tier'], t],
      ];

      // Healthy: fixed radius scaled only by zoom — texture, not data.
      m.addLayer({
        id: L_HEALTHY,
        type: 'circle',
        source: SRC,
        filter: tierFilter('healthy'),
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 15, 3],
          'circle-color': c.ok,
          'circle-opacity': BASE_FILL[L_HEALTHY]!,
        },
      });

      // Silent / not installed: hollow grey ring. A grey fill on a grey basemap
      // is invisible.
      m.addLayer({
        id: L_SILENT,
        type: 'circle',
        source: SRC,
        filter: tierFilter('silent'),
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 4],
          'circle-color': c.mute,
          'circle-opacity': 0,
          'circle-stroke-width': 1.1,
          'circle-stroke-color': c.mute,
          'circle-stroke-opacity': BASE_STROKE[L_SILENT]!,
        },
      });

      // Needs a vehicle: amber, radius reads bikes-to-move on both zoom and value.
      m.addLayer({
        id: L_NEEDS,
        type: 'circle',
        source: SRC,
        filter: tierFilter('needs-vehicle'),
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            ['interpolate', ['linear'], ['get', 'bikesToMove'], 0, 2.5, 60, 7],
            15,
            ['interpolate', ['linear'], ['get', 'bikesToMove'], 0, 5, 60, 16],
          ],
          'circle-color': c.warn,
          'circle-opacity': BASE_FILL[L_NEEDS]!,
          'circle-stroke-width': 0.6,
          'circle-stroke-color': c.surface,
          'circle-stroke-opacity': BASE_STROKE[L_NEEDS]!,
        },
      });

      // Critical: red, a touch larger on the same input, painted last.
      m.addLayer({
        id: L_CRITICAL,
        type: 'circle',
        source: SRC,
        filter: tierFilter('critical'),
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            ['interpolate', ['linear'], ['get', 'bikesToMove'], 0, 3, 60, 8.5],
            15,
            ['interpolate', ['linear'], ['get', 'bikesToMove'], 0, 6, 60, 18],
          ],
          'circle-color': c.critical,
          'circle-opacity': BASE_FILL[L_CRITICAL]!,
          'circle-stroke-width': 0.8,
          'circle-stroke-color': c.surface,
          'circle-stroke-opacity': BASE_STROKE[L_CRITICAL]!,
        },
      });

      // The selection ring. Filter matches nothing until a station is open.
      m.addLayer({
        id: L_SELECTED,
        type: 'circle',
        source: SRC,
        filter: ['==', ['get', 'id'], NO_SELECTION],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 8, 15, 17],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': c.ink,
          'circle-stroke-opacity': 1,
        },
      });

      m.addLayer({
        id: L_CLUSTER,
        type: 'circle',
        source: SRC,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'case',
            ['>', ['get', 'crit'], 0],
            c.critical,
            ['>', ['get', 'warn'], 0],
            c.warn,
            c.ok,
          ],
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 13, 20, 17, 75, 22, 200, 28],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': c.surface,
        },
      });
      m.addLayer({
        id: L_CLUSTER_COUNT,
        type: 'symbol',
        source: SRC,
        filter: ['has', 'point_count'],
        layout: {
          // The count and nothing else. A second line reading "37 critical" was
          // the colour saying the same thing twice — the dot is already red
          // *because* it holds a critical station — and two numbers stacked in a
          // 22px circle read as one four-digit number at a glance.
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': c.surface },
      });

      /* -- interaction ---------------------------------------------------- */
      m.on('click', L_CLUSTER, (e) => {
        const f = e.features?.[0] as QueriedFeature | undefined;
        const clusterId = f?.properties?.cluster_id;
        const src = m.getSource(SRC) as mapboxgl.GeoJSONSource | undefined;
        if (typeof clusterId !== 'number' || !src) return;
        const center = coordOf(f);
        src.getClusterLeaves(clusterId, 1000, 0, (leafErr, leaves) => {
          if (leafErr || !leaves?.length) {
            src.getClusterExpansionZoom(clusterId, (zErr, zoom) => {
              if (!zErr && center && typeof zoom === 'number') m.easeTo({ center, zoom });
            });
            return;
          }
          const b = new mapboxgl.LngLatBounds();
          for (const leaf of leaves) {
            const cc = coordOf(leaf as QueriedFeature);
            if (cc) b.extend(cc);
          }
          if (!b.isEmpty()) m.fitBounds(b, { padding: 90, maxZoom: 15.5, duration: 650 });
        });
      });

      for (const id of DOT_LAYERS) {
        m.on('click', id, (e) => {
          const pid = (e.features?.[0] as QueriedFeature | undefined)?.properties?.id;
          if (typeof pid === 'string') select.current(pid);
        });
      }

      m.on('mousemove', (e) => {
        const b = 7;
        const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [
          [e.point.x - b, e.point.y - b],
          [e.point.x + b, e.point.y + b],
        ];
        const layers = DOT_LAYERS.filter((l) => m.getLayer(l));
        const clusterHit = m.queryRenderedFeatures(box, { layers: [L_CLUSTER] });
        if (clusterHit.length) {
          m.getCanvas().style.cursor = 'pointer';
          setHover(null);
          return;
        }

        const hits = m.queryRenderedFeatures(box, { layers }) as unknown as QueriedFeature[];
        if (!hits.length) {
          m.getCanvas().style.cursor = '';
          setHover(null);
          return;
        }
        // Highest urgency wins, not whichever Mapbox drew on top.
        const best = hits.reduce((a, x) =>
          score(x) > score(a) ? x : a,
        );
        m.getCanvas().style.cursor = 'pointer';
        setHover({ x: e.point.x, y: e.point.y, p: best.properties as unknown as StationFeatureProps });
      });
      m.on('mouseout', () => setHover(null));

      m.on('move', () => {
        const frame = frameRef.current;
        if (frame && !clamping.current) {
          clamping.current = true;
          clampToFrame(m, frame);
          clamping.current = false;
        }
        // The vehicle card is an overlay in screen space, so it has to be
        // re-projected as the map slides under it.
        const cv = cardRef.current;
        if (cv) {
          const p = m.project([cv.lon, cv.lat]);
          setCard((c) => (c ? { ...c, x: p.x, y: p.y } : c));
        }
      });

      // Anywhere that is not a marker closes the card. Marker clicks stop their
      // own propagation, so reaching the canvas means "somewhere else".
      m.on('click', () => setCard(null));

      const claim = () => {
        userMoved.current = true;
      };
      m.on('dragstart', claim);
      m.on('rotatestart', claim);
      // Wheel and box-zoom are the reader taking the frame; a programmatic
      // fitBounds fires `zoomstart` too, which is why this listens to the raw
      // input events rather than to the camera.
      m.on('wheel', claim);
      m.on('boxzoomstart', claim);
      m.on('dblclick', claim);

      setReady(true);
    });

    m.on('error', (e) => {
      const msg = String(e?.error?.message ?? '');
      if (/401|Unauthorized|access token/i.test(msg)) {
        setErr(
          'The Mapbox token was rejected — check it is valid and that this domain is allowed in its URL restrictions.',
        );
      } else if (msg) {
        setErr(msg.slice(0, 160));
      }
    });

    const ro = new ResizeObserver(() => {
      m.resize();
      // The allowed frame is a function of the pane's aspect, so a resize
      // invalidates it before it invalidates the camera.
      frameRef.current = calibrateLimits(m, limitRef.current);
      const t = fitTarget.current;
      if (t && !userMoved.current && !focusRef.current) {
        m.fitBounds(t, { padding: 36, duration: 0 });
      }
    });
    ro.observe(holder.current);

    return () => {
      ro.disconnect();
      markers.current.forEach((mk) => mk.remove());
      markers.current = [];
      m.remove();
      map.current = null;
      setReady(false);
      fitted.current = false;
    };
  }, []);

  /* -- feed the sources -------------------------------------------------- */
  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource(SRC) as mapboxgl.GeoJSONSource | undefined)?.setData(
      stations as unknown as Parameters<mapboxgl.GeoJSONSource['setData']>[0],
    );
  }, [stations, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource(SRC_SWAPS) as mapboxgl.GeoJSONSource | undefined)?.setData(
      swaps as unknown as Parameters<mapboxgl.GeoJSONSource['setData']>[0],
    );
  }, [swaps, ready]);

  /* -- grey out everything beyond where the stations actually are -------- */
  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource(SRC_MASK) as mapboxgl.GeoJSONSource | undefined)?.setData(
      maskPolygon(serviceBounds ?? METRO_BOUNDS) as unknown as Parameters<
        mapboxgl.GeoJSONSource['setData']
      >[0],
    );
  }, [serviceBounds, ready]);

  /* -- clamp panning and zoom-out to where the stations actually are ---- */
  useEffect(() => {
    if (!ready || !map.current) return;
    frameRef.current = calibrateLimits(map.current, limitRef.current);
    clampToFrame(map.current, frameRef.current ?? METRO_BOUNDS);
  }, [limitBounds, ready]);

  /* -- fit the camera to the data, and refit on a borough change -------- */
  const hasBounds = serviceBounds !== null;
  useEffect(() => {
    if (!ready || !map.current) return;
    const b = boundsRef.current;
    if (!b || focusRef.current) return;
    // Narrowing to a borough is an explicit request for a new frame, so it
    // overrides any panning the reader had done.
    fitTarget.current = b;
    userMoved.current = false;
    map.current.resize();
    map.current.fitBounds(b, { padding: 36, duration: fitted.current ? 550 : 0 });
    fitted.current = true;
  }, [fitKey, ready, hasBounds]);

  /* -- vehicles: the only DOM markers --------------------------------- */
  useEffect(() => {
    if (!ready || !map.current) return;
    const m = map.current;

    markers.current.forEach((mk) => mk.remove());
    markers.current = [];

    const routes: unknown[] = [];
    for (const v of vehicles) {
      /*
       * Four things in about forty pixels: the silhouette is the body type, the
       * colour is the state, the fill level is the load, and the id is the id.
       * The previous marker was a black square and a grey caption — it could not
       * tell you a van from a truck or a full one from an empty one, which are
       * the two questions you open a fleet map to answer.
       */
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'map-vehicle';
      el.style.setProperty('--accent', v.accent);
      el.setAttribute(
        'aria-label',
        `${v.kindLabel} ${v.id}, ${v.stateLabel}, carrying ${v.load} of ${v.capacity} bikes. Show details.`,
      );
      const pct = v.capacity > 0 ? Math.round((v.load / v.capacity) * 100) : 0;
      el.innerHTML =
        `<span class="map-vehicle-body${v.wide ? ' map-vehicle-body--wide' : ''}">` +
        `<span class="map-vehicle-fill" style="height:${pct}%"></span>` +
        `</span><span class="map-vehicle-id">${escapeHtml(v.id)}</span>`;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openCard(v);
      });
      markers.current.push(
        new mapboxgl.Marker({ element: el }).setLngLat([v.lon, v.lat]).addTo(m),
      );

      if (v.dest) {
        routes.push({
          type: 'Feature',
          properties: { id: v.id },
          geometry: { type: 'LineString', coordinates: [[v.lon, v.lat], v.dest] },
        });
      }
    }
    (m.getSource(SRC_ROUTES) as mapboxgl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: routes,
    } as unknown as Parameters<mapboxgl.GeoJSONSource['setData']>[0]);

    // A poll rebuilds every marker; an open card would otherwise go on showing
    // the load the vehicle had a minute ago.
    setCard((c) => {
      if (!c) return c;
      const next = vehicles.find((x) => x.id === c.v.id);
      return next ? { ...c, v: next } : null;
    });
  }, [vehicles, ready, openCard]);

  /* -- Escape closes the vehicle card ---------------------------------- */
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card]);

  /* -- selection: ring + dim everything else ------------------------- */
  useEffect(() => {
    if (!ready || !map.current) return;
    const m = map.current;
    const sel = selectedId;

    for (const id of DOT_LAYERS) {
      const fill = BASE_FILL[id]!;
      const stroke = BASE_STROKE[id]!;
      if (sel) {
        m.setPaintProperty(id, 'circle-opacity', [
          'case',
          ['==', ['get', 'id'], sel],
          fill,
          fill === 0 ? 0 : DIM,
        ]);
        m.setPaintProperty(id, 'circle-stroke-opacity', [
          'case',
          ['==', ['get', 'id'], sel],
          Math.max(stroke, 0.9),
          stroke === 0 ? 0 : DIM,
        ]);
      } else {
        m.setPaintProperty(id, 'circle-opacity', fill);
        m.setPaintProperty(id, 'circle-stroke-opacity', stroke);
      }
    }

    m.setFilter(L_SELECTED, ['==', ['get', 'id'], sel ?? NO_SELECTION]);

    m.setPaintProperty('swap-lines', 'line-opacity', sel ? DIM : 0.9);
    m.setPaintProperty('swap-labels', 'text-opacity', sel ? DIM : 1);
    m.setPaintProperty(SRC_ROUTES, 'line-opacity', sel ? DIM : 0.9);
    m.setPaintProperty(L_CLUSTER, 'circle-opacity', sel ? DIM : 0.9);
    m.setPaintProperty(L_CLUSTER_COUNT, 'text-opacity', sel ? DIM : 1);

    for (const mk of markers.current) {
      mk.getElement().style.opacity = sel ? '0.3' : '1';
    }
  }, [selectedId, ready, vehicles]);

  /* -- fly to a deep-linked / searched station --------------------- */
  useEffect(() => {
    if (!ready || !focusId || !map.current) return;
    const hit = stations.features.find((f) => f.properties.id === focusId);
    if (!hit) return;
    map.current.flyTo({
      center: hit.geometry.coordinates,
      zoom: 15,
      duration: 900,
    });
  }, [focusId, ready, stations]);

  return (
    <div className="absolute inset-0">
      <div ref={holder} className="h-full w-full" />

      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-[190px] rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2 shadow-[0_4px_20px_rgb(43_38_33/12%)]"
          style={{
            left: Math.min(hover.x + 14, (holder.current?.clientWidth ?? 400) - 200),
            top: Math.max(hover.y - 12, 8),
          }}
        >
          <p className="text-[11px] leading-tight font-semibold text-[var(--color-ink)]">
            {hover.p.name}
          </p>
          <p className="num mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-ink-3)]">
            <span>{hover.p.borough}</span>
            <span aria-hidden="true">·</span>
            <span>{hover.p.status}</span>
          </p>
          <dl className="num mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px]">
            <dt className="text-[var(--color-ink-3)]">Urgency</dt>
            <dd className="text-right font-semibold text-[var(--color-ink)]">
              {hover.p.score < 0 ? '—' : hover.p.score}
            </dd>
            <dt className="text-[var(--color-ink-3)]">Bikes / docks</dt>
            <dd className="text-right text-[var(--color-ink)]">
              {hover.p.bikes < 0 ? '—' : hover.p.bikes} / {hover.p.docks}
            </dd>
            <dt className="text-[var(--color-ink-3)]">Updated</dt>
            <dd className="text-right text-[var(--color-ink)]">{hover.p.reported}</dd>
          </dl>
          <p className="mt-1.5 border-t border-[var(--color-line-soft)] pt-1 text-[9px] text-[var(--color-ink-3)]">
            Click for the full breakdown
          </p>
        </div>
      )}

      {card && (
        <VehicleCard
          v={card.v}
          x={card.x}
          y={card.y}
          paneWidth={holder.current?.clientWidth ?? 800}
          onClose={() => setCard(null)}
        />
      )}

      {err && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--color-sunken)] p-6">
          <p className="max-w-[420px] text-center text-[11px] leading-relaxed text-[var(--color-ink-2)]">
            <strong className="font-semibold text-[var(--color-ink)]">
              The map could not load.
            </strong>{' '}
            {err} The rest of the console is unaffected — every screen but this one reads the same
            feed without Mapbox.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The micro half: everything the 40px marker had to leave out.
 *
 * Anchored to the vehicle rather than parked in a corner, because the question
 * being asked is "what is *that* one doing" and a card across the screen makes
 * the reader hold the answer and the subject in their head at once. Every figure
 * here also exists on Fleet Operations — this is a peek, and the link is the
 * way through to the screen that owns the decision.
 */
const CARD_W = 214;

function VehicleCard({
  v,
  x,
  y,
  paneWidth,
  onClose,
}: {
  v: MapVehicle;
  x: number;
  y: number;
  paneWidth: number;
  onClose: () => void;
}) {
  const pct = v.capacity > 0 ? Math.round((v.load / v.capacity) * 100) : 0;
  // Flip to the left of the marker when it would otherwise run off the pane.
  const left = x + 18 + CARD_W > paneWidth ? Math.max(8, x - CARD_W - 18) : x + 18;

  return (
    <div
      className="fade-in absolute z-30 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_4px_20px_rgb(43_38_33/14%)]"
      style={{ left, top: Math.max(8, y - 60), width: CARD_W }}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5 pb-2">
        <div className="min-w-0">
          <p className="num text-[12px] leading-tight font-semibold text-[var(--color-ink)]">
            Vehicle {v.id}
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--color-ink-3)]">
            {v.kindLabel} · holds {v.capacity}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-0.5 -mr-1 shrink-0 rounded p-1 text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      <div className="border-t border-[var(--color-line-soft)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium" style={{ color: v.accent }}>
            {v.stateLabel}
          </span>
          <span className="num text-[10px] text-[var(--color-ink-3)]">free {v.freeIn}</span>
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-[var(--color-ink-2)]">{v.heading}</p>
        {v.when && <p className="num mt-0.5 text-[10px] text-[var(--color-ink-3)]">{v.when}</p>}
      </div>

      <div className="border-t border-[var(--color-line-soft)] px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="eyebrow text-[9px]">Load</span>
          <span className="num text-[11px] font-semibold text-[var(--color-ink)]">
            {v.load}
            <span className="text-[9px] font-normal text-[var(--color-ink-3)]">/{v.capacity}</span>
          </span>
        </div>
        <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[var(--color-sunken)]">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: v.accent }}
          />
        </div>
        <p className="num mt-1 text-[9px] text-[var(--color-ink-3)]">
          {v.capacity - v.load} slots free · depot {v.depot}
        </p>
      </div>

      <Link
        to={v.href}
        className="flex items-center justify-center gap-1 border-t border-[var(--color-line-soft)] px-3 py-2 text-[10px] text-[var(--color-ink-2)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-ink)]"
      >
        <Icon name="vehicle" size={11} />
        Open in Fleet Operations
      </Link>
      <p className="border-t border-[var(--color-line-soft)] px-3 py-1.5 text-[9px] leading-snug text-[var(--color-ink-3)] italic">
        Fixture — the public feed carries no vehicles.
      </p>
    </div>
  );
}

function score(f: QueriedFeature): number {
  const s = f.properties?.score;
  return typeof s === 'number' ? s : -1;
}

/** Grows a box by a share of its own span, so the edge stations are not flush
 *  against the pan limit. */
function padBounds([[w, s], [e, n]]: [Coord, Coord], share: number): [Coord, Coord] {
  const dx = (e - w) * share;
  const dy = (n - s) * share;
  return [
    [w - dx, s - dy],
    [e + dx, n + dy],
  ];
}

/* --- Web Mercator, just enough of it ------------------------------------- */
const mercY = (lat: number) =>
  0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const mercLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** The box a given camera actually shows, without moving the camera to find out. */
function frameFor(center: mapboxgl.LngLat, zoom: number, w: number, h: number): [Coord, Coord] {
  const worldPx = 512 * 2 ** zoom;
  const dLon = (w / worldPx) * 360;
  const yc = mercY(center.lat);
  const dy = h / worldPx / 2;
  return [
    [center.lng - dLon / 2, mercLat(yc + dy)],
    [center.lng + dLon / 2, mercLat(yc - dy)],
  ];
}

/**
 * Work out the widest view worth allowing: "the whole network, just fitting".
 *
 * Returns the *frame* that camera would see, not the data box. The two are very
 * different — the service area is tall and narrow inside a wide pane, so fitting
 * it leaves a screen's worth of letterboxing that is still legitimately part of
 * the view. Clamping to the data box instead would crop off the Bronx and the
 * Rockaways.
 *
 * Also sets the zoom floor, which `maxBounds` cannot: past this there is nothing
 * out there but Morristown and Hicksville, and neither has ever held a dock.
 */
function calibrateLimits(m: mapboxgl.Map, bounds: [Coord, Coord] | null): [Coord, Coord] | null {
  if (!bounds) return null;
  const el = m.getContainer();
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w < 40 || h < 40) return null;

  const cam = m.cameraForBounds(bounds, { padding: 36 });
  if (!cam || typeof cam.zoom !== 'number' || !cam.center) return null;

  const center = mapboxgl.LngLat.convert(cam.center);
  const frame = padBounds(frameFor(center, cam.zoom, w, h), PAN_SLACK);
  m.setMinZoom(Math.max(8, cam.zoom - 0.05));
  // Coarse backstop for anything that moves the camera without firing `move`.
  m.setMaxBounds(frame);
  return frame;
}

/**
 * Keep the whole viewport inside the frame, not just its centre.
 *
 * `maxBounds` looks like it should do this and does not: it clamps the *centre*
 * into the box, which still leaves half a screen of New Jersey visible past the
 * edge — which was the entire complaint. So the constraint is applied here, on
 * every camera move, against the viewport's own edges.
 *
 * When the viewport is larger than the frame in a dimension — which it is
 * horizontally at the zoom floor — there is nothing to slide, so it locks to the
 * midpoint instead of fighting the reader.
 */
function clampToFrame(m: mapboxgl.Map, frame: [Coord, Coord]): boolean {
  const [[w, s], [e, n]] = frame;
  const c = m.getCenter();
  const b = m.getBounds();
  if (!b) return false;

  const halfLon = (b.getEast() - b.getWest()) / 2;
  const halfLat = (b.getNorth() - b.getSouth()) / 2;

  const loLon = w + halfLon;
  const hiLon = e - halfLon;
  const lng = loLon > hiLon ? (w + e) / 2 : Math.min(hiLon, Math.max(loLon, c.lng));

  const loLat = s + halfLat;
  const hiLat = n - halfLat;
  const lat = loLat > hiLat ? (s + n) / 2 : Math.min(hiLat, Math.max(loLat, c.lat));

  if (Math.abs(lng - c.lng) < 1e-7 && Math.abs(lat - c.lat) < 1e-7) return false;
  m.setCenter([lng, lat]);
  return true;
}

function coordOf(f: QueriedFeature | undefined): Coord | null {
  const co = f?.geometry?.coordinates;
  return Array.isArray(co) && typeof co[0] === 'number' && typeof co[1] === 'number'
    ? [co[0], co[1]]
    : null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) =>
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;',
  );
}

/** A world polygon with the service area punched out, for the grey-out mask. */
function maskPolygon([[w, s], [e, n]]: [Coord, Coord]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ],
        [
          [w, s],
          [w, n],
          [e, n],
          [e, s],
          [w, s],
        ],
      ],
    },
  };
}

/**
 * Strip the basemap down to a street reference.
 *
 * POI and transit pins are noise on a rebalancing map, and place labels for
 * towns with no stations (Hackensack, Floral Park) compete with the dots. The
 * mask greys the ground outside the service area; this drops the labels that
 * would otherwise still print on top of the grey, and flattens the water.
 */
function quietBasemap(m: mapboxgl.Map) {
  const layers = m.getStyle().layers ?? [];
  for (const l of layers) {
    if (
      /poi-label|poi-scalerank|transit-label|airport-label|natural-point-label|water-point-label/.test(
        l.id,
      )
    ) {
      try {
        m.setLayoutProperty(l.id, 'visibility', 'none');
      } catch {
        /* layer name drift between style versions — safe to ignore */
      }
    }
  }
  try {
    m.setPaintProperty('water', 'fill-color', '#e4e6e4');
  } catch {
    /* ignore */
  }
}
