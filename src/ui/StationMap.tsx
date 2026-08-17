/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { ScoredStation } from '../model/summary';
import { laneOf } from '../model/triage';
import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD } from '../model/score';

/**
 * The network on real geography.
 *
 * Every station in the feed carries a validated lat/lon that nothing was using
 * — the previous map was a drawn plan with sixteen hand-placed pins, which is
 * fine as a picture and useless for the question this screen actually answers,
 * which is "what else is near the thing I am about to drive to".
 *
 * Rendered as a GeoJSON source and a circle layer rather than 2,509 DOM
 * markers. Mapbox draws the layer on the GPU in one pass; the same number of
 * absolutely-positioned divs would make panning unusable, and React would be
 * reconciling two thousand nodes on every poll.
 */

import { MAPBOX_TOKEN } from './mapToken';

/**
 * The service area, not the city.
 *
 * Citi Bike runs from the north Bronx to south Brooklyn and across the Hudson
 * into Jersey City and Hoboken, so the five-borough box a New Yorker would
 * draw cuts off two of the zones this console lists. Panning is clamped here
 * because a rebalancing map has no use for New Jersey at large or the Atlantic
 * — every pixel outside the box is a pixel that cannot contain a station.
 */
export const METRO_BOUNDS: [[number, number], [number, number]] = [
  [-74.3, 40.45], // SW
  [-73.65, 40.95], // NE
];

const SOURCE = 'stations';
const LAYER = 'station-circles';

/**
 * Mapbox cannot read CSS custom properties, so the tone table has to be
 * resolved to literal colours once. Read from the document rather than
 * duplicated as hex, so a palette change still only happens in one file.
 */
function resolveTone(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const get = (n: string) => cs.getPropertyValue(n).trim() || '#9a9083';
  return {
    empty: get('--color-empty'),
    warn: get('--color-warn'),
    flood: get('--color-flood'),
    ok: get('--color-ok'),
    mute: get('--color-mute'),
    surface: get('--color-surface'),
  };
}

export type MapLayer = 'score' | 'fill';

/** One station as a GeoJSON point, carrying everything the paint needs. */
function toFeature(s: ScoredStation, tones: Record<string, string>) {
  const lane = laneOf(s.breakdown);
  const score = s.breakdown.score;
  const ratio = s.breakdown.fill.ratio;

  // Colour by urgency. Matches the badge ramp deliberately — a red dot on the
  // map and a red badge in the queue have to mean the same thing.
  const scoreColor =
    lane === 'unverified' || !s.breakdown.scored
      ? tones.mute
      : score >= CRITICAL_THRESHOLD
        ? tones.empty
        : score >= NEEDS_TRUCK_THRESHOLD
          ? tones.warn
          : tones.ok;

  // Colour by which side the station is failing on: warm means nobody can
  // rent, cool means nobody can return. The same split the fill bars use.
  const fillColor =
    ratio === null ? tones.mute : ratio <= 0.15 ? tones.empty : ratio >= 0.85 ? tones.flood : tones.ok;

  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [s.station.lon, s.station.lat] },
    properties: {
      id: s.station.stationId,
      name: s.station.name,
      borough: s.station.borough,
      score: lane === 'unverified' ? -1 : score,
      capacity: s.station.capacity,
      bikes: s.station.status.bikesAvailable,
      docks: s.station.status.docksAvailable,
      lane,
      scoreColor,
      fillColor,
    },
  };
}

export default function StationMap({
  scored,
  layer,
  onSelect,
  focusId,
  needsTruckOnly,
}: {
  scored: ScoredStation[];
  layer: MapLayer;
  onSelect: (stationId: string) => void;
  /** Station to fly to when it changes — deep links from other screens. */
  focusId?: string | null;
  needsTruckOnly: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Kept in a ref so the click handler, registered once, always sees the
  // current callback without tearing the map down to re-bind it.
  const select = useRef(onSelect);
  select.current = onSelect;

  const data = useMemo(() => {
    const tones = resolveTone();
    return {
      type: 'FeatureCollection' as const,
      features: scored
        .filter((s) => Number.isFinite(s.station.lat) && Number.isFinite(s.station.lon))
        .map((s) => toFeature(s, tones)),
    };
  }, [scored]);

  /* -- create once ------------------------------------------------------- */
  useEffect(() => {
    if (!holder.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const m = new mapboxgl.Map({
      container: holder.current,
      style: 'mapbox://styles/mapbox/light-v11',
      bounds: METRO_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      maxBounds: METRO_BOUNDS,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: true,
    });
    map.current = m;

    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    m.on('load', () => {
      m.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      m.addLayer({
        id: LAYER,
        type: 'circle',
        source: SOURCE,
        paint: {
          // Bigger stations read as bigger dots — a 100-dock hub failing is
          // not the same event as an 8-dock corner failing, and the ranking
          // already knows that. Scaled by zoom so the city view stays legible.
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9,
            ['interpolate', ['linear'], ['get', 'capacity'], 8, 2, 100, 4.5],
            14,
            ['interpolate', ['linear'], ['get', 'capacity'], 8, 5, 100, 12],
            17,
            ['interpolate', ['linear'], ['get', 'capacity'], 8, 9, 100, 22],
          ],
          'circle-color': ['get', 'scoreColor'],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.9,
        },
      });

      m.on('click', LAYER, (e) => {
        // Mapbox types `features` loosely; the properties are ours and we know
        // the shape, so the narrowing happens here rather than at every use.
        const props = (e.features?.[0] as { properties?: { id?: unknown } } | undefined)?.properties;
        if (typeof props?.id === 'string') select.current(props.id);
      });
      m.on('mouseenter', LAYER, () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', LAYER, () => (m.getCanvas().style.cursor = ''));

      setReady(true);
    });

    /**
     * A 401 from a restricted token is the likeliest failure in production and
     * it renders as nothing at all — Mapbox logs and carries on with an empty
     * canvas. Without this the screen is a blank rectangle that looks like a
     * layout bug rather than a credentials problem.
     */
    m.on('error', (e) => {
      const msg = String(e?.error?.message ?? '');
      if (/401|Unauthorized|access token/i.test(msg)) {
        setErr('The Mapbox token was rejected — check it is valid and that this domain is allowed in its URL restrictions.');
      } else if (msg) {
        setErr(msg.slice(0, 160));
      }
    });

    // The rail collapses and the drawer opens over this screen; neither fires a
    // window resize, so the canvas would keep its first measurement forever.
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(holder.current);

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      setReady(false);
    };
  }, []);

  /* -- feed the source on every poll ------------------------------------- */
  useEffect(() => {
    if (!ready) return;
    const src = map.current?.getSource(SOURCE) as mapboxgl.GeoJSONSource | undefined;
    src?.setData(data);
  }, [data, ready]);

  /* -- layer + filter ----------------------------------------------------- */
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setPaintProperty(
      LAYER,
      'circle-color',
      layer === 'score' ? ['get', 'scoreColor'] : ['get', 'fillColor'],
    );
  }, [layer, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setFilter(
      LAYER,
      needsTruckOnly ? ['>=', ['get', 'score'], NEEDS_TRUCK_THRESHOLD] : null,
    );
  }, [needsTruckOnly, ready]);

  /* -- fly to a deep-linked station --------------------------------------- */
  useEffect(() => {
    if (!ready || !focusId || !map.current) return;
    const hit = data.features.find((f) => f.properties.id === focusId);
    if (!hit) return;
    map.current.flyTo({
      center: hit.geometry.coordinates as [number, number],
      zoom: 15,
      duration: 900,
    });
  }, [focusId, ready, data]);

  /**
   * Two divs, not one.
   *
   * `mapbox-gl.css` sets `.mapboxgl-map { position: relative }` on whatever
   * element you hand it, which silently beat `absolute inset-0` on the same
   * node — the container collapsed to height 0, Mapbox fell back to a 300px
   * canvas, and the screen rendered a blank cream rectangle with no error in
   * the console. The outer div owns the positioning, the inner one is the
   * container and only has to be told to fill it.
   */
  return (
    <div className="absolute inset-0">
      <div ref={holder} className="h-full w-full" />
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
