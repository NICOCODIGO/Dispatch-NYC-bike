import type { ScoredStation } from '../model/summary';
import { laneOf } from '../model/triage';
import { CRITICAL_THRESHOLD, NEEDS_VEHICLE_THRESHOLD } from '../model/score';
import { formatReportedAge } from '../lib/time';
import { vehicleAction } from './insights';
import { statusFor } from './adapt';
import type { SwapPair } from './swaps';

/**
 * The network as GeoJSON for the Mapbox layers.
 *
 * The map draws every station from one source and styles it with data-driven
 * expressions, so this is the only place the model's vocabulary is flattened
 * into the four things the paint needs: which tier the dot belongs to, how many
 * bikes it is asking to move, and the handful of strings the hover card shows.
 *
 * Kept out of the map component for the same reason scoring is kept out of the
 * views — it is a pure transform of the feed and it is the part worth a test.
 * The component downstream only knows about circles.
 */

/**
 * The four visual classes on the map, in painting order (last drawn wins).
 *
 *   healthy       score under the dispatch line — texture, not a call to action
 *   silent        not installed, or no report in an hour — a hollow ring
 *   needs-vehicle 55–69 — amber, sized by the load it is asking for
 *   critical      70+ — red, on top of everything so it is never occluded
 *
 * A mechanic-lane station (outage, dead rack) still lands in `needs-vehicle` or
 * `critical` by its score; its `bikesToMove` is zero, so it draws at the minimum
 * radius, and clicking it opens the panel that explains a vehicle is the wrong
 * vehicle. The map does not try to be the triage board.
 */
export type MapTier = 'healthy' | 'silent' | 'needs-vehicle' | 'critical';

export const TIER_ORDER: readonly MapTier[] = [
  'healthy',
  'silent',
  'needs-vehicle',
  'critical',
];

export const TIER_LABEL: Record<MapTier, string> = {
  critical: `Critical · ${CRITICAL_THRESHOLD}+`,
  'needs-vehicle': `Needs a vehicle · ${NEEDS_VEHICLE_THRESHOLD}–${CRITICAL_THRESHOLD - 1}`,
  healthy: `Healthy · under ${NEEDS_VEHICLE_THRESHOLD}`,
  silent: 'Silent or not installed',
};

export function tierOf(b: ScoredStation['breakdown']): MapTier {
  if (!b.scored || b.staleness.notReporting) return 'silent';
  if (b.score >= CRITICAL_THRESHOLD) return 'critical';
  if (b.score >= NEEDS_VEHICLE_THRESHOLD) return 'needs-vehicle';
  return 'healthy';
}

export interface StationFeatureProps {
  id: string;
  name: string;
  borough: string;
  tier: MapTier;
  /** Urgency 0–100; -1 when the station has no trustworthy score. */
  score: number;
  /** Bikes reported present; -1 when the counts are not trusted. */
  bikes: number;
  docks: number;
  /** What a vehicle would move here, the radius input. 0 for anything else. */
  bikesToMove: number;
  status: string;
  reported: string;
  [key: string]: string | number;
}

type PointFeature = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: StationFeatureProps;
};

type LineFeature = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: { bikes: number; meters: number; label: string };
};

export interface FeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
}

const hasCoords = (s: ScoredStation) =>
  Number.isFinite(s.station.lat) && Number.isFinite(s.station.lon);

function toFeature(s: ScoredStation): PointFeature {
  const { breakdown } = s;
  const tier = tierOf(breakdown);
  const silent = tier === 'silent';
  const move = silent ? 0 : vehicleAction(breakdown).bikes;

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.station.lon, s.station.lat] },
    properties: {
      id: s.station.stationId,
      name: s.station.name,
      borough: s.station.borough,
      tier,
      score: silent ? -1 : breakdown.score,
      bikes: laneOf(breakdown) === 'unverified' ? -1 : breakdown.fill.bikes,
      docks: breakdown.fill.docks,
      bikesToMove: move,
      status: statusFor(s),
      reported: formatReportedAge(breakdown.staleness.ageMinutes),
    },
  };
}

/** Every station with a usable coordinate, as one FeatureCollection. */
export function stationFeatures(scored: ScoredStation[]): FeatureCollection<PointFeature> {
  return {
    type: 'FeatureCollection',
    features: scored.filter(hasCoords).map(toFeature),
  };
}

/** Live count per tier, for the legend. */
export function tierCounts(scored: ScoredStation[]): Record<MapTier, number> {
  const out: Record<MapTier, number> = {
    healthy: 0,
    silent: 0,
    'needs-vehicle': 0,
    critical: 0,
  };
  for (const s of scored) out[tierOf(s.breakdown)] += 1;
  return out;
}

/** Swap pairs as dashed connectors, label pre-rendered for the line-centre pill. */
export function swapFeatures(pairs: SwapPair[]): FeatureCollection<LineFeature> {
  return {
    type: 'FeatureCollection',
    features: pairs.map((p) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [p.from.station.lon, p.from.station.lat],
          [p.to.station.lon, p.to.station.lat],
        ],
      },
      properties: {
        bikes: p.bikes,
        meters: p.meters,
        label: `swap ${p.bikes}`,
      },
    })),
  };
}
