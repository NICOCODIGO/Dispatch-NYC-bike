import type { Vehicle } from '../mock/data';
import type { ScoredStation } from '../model/summary';
import { vehicleAction, type VehicleAction } from './insights';

/**
 * The fleet organised around the decision, not around the vehicles.
 *
 * The page had eight vehicle rows in fixture-declaration order, which answers
 * "what is each vehicle doing" — a question nobody opens this screen to ask. The
 * question is "who can I send, and where". That is availability, and it cuts
 * across state: a vehicle unloading with four minutes left is nearer to useful
 * than one that just departed on a thirty-five minute run, though the first
 * looks busier.
 *
 * Kept pure and separate from the view so the grouping and the matching can be
 * tested without rendering anything.
 */

/** Minutes within which "busy" is close enough to plan around. */
export const FREE_SHORTLY_MINUTES = 20;

/** Average city speed for a box vehicle, km/h. Traffic, lights, double-parking. */
export const VEHICLE_SPEED_KMH = 18;

/** Minutes on site loading or unloading, regardless of quantity. */
export const SERVICE_MINUTES = 10;

export type Availability = 'free-now' | 'free-shortly' | 'committed';

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  'free-now': 'Free now',
  'free-shortly': 'Free shortly',
  committed: 'Committed',
};

export const AVAILABILITY_NOTE: Record<Availability, string> = {
  'free-now': 'Parked and unassigned. These are the only vehicles you can send this minute.',
  'free-shortly': `Finishing something, free inside ${FREE_SHORTLY_MINUTES} minutes. Worth holding a job for.`,
  committed: 'On a run. Nothing to decide about these right now.',
};

export function availabilityOf(freeInMin: number): Availability {
  if (freeInMin <= 0) return 'free-now';
  if (freeInMin <= FREE_SHORTLY_MINUTES) return 'free-shortly';
  return 'committed';
}

/** Great-circle distance in km. */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Straight-line distance, inflated for the street grid.
 *
 * Manhattan is a grid, so the driven distance between two points is closer to
 * the sum of the legs than the hypotenuse. 1.3 is the usual detour factor for
 * dense street networks and is honest enough for "is this one nearer than that
 * one", which is all this number is asked to decide.
 */
export function travelMinutes(km: number): number {
  return Math.max(1, Math.round(((km * 1.3) / VEHICLE_SPEED_KMH) * 60));
}

/* ---------------------------------------------------------------------------
   Matching a free vehicle to an outstanding job.
--------------------------------------------------------------------------- */

export interface Job {
  station: ScoredStation;
  action: VehicleAction;
}

export interface Match {
  job: Job;
  /** Minutes of driving to reach it. */
  minutes: number;
  km: number;
  /** Bikes this vehicle can actually handle of what the station needs. */
  servable: number;
  /** True when the vehicle can finish the job in one visit. */
  complete: boolean;
  /** Why this pairing, in the dispatcher's words. */
  why: string;
}

/** Outstanding vehicle-lane work, worst first, excluding anything already taken. */
export function openJobs(lane: ScoredStation[], takenStationIds: Set<string>): Job[] {
  const out: Job[] = [];
  for (const station of lane) {
    if (!station.breakdown.needsVehicle) continue;
    if (takenStationIds.has(station.station.stationId)) continue;
    const action = vehicleAction(station.breakdown);
    if (action.kind !== 'drop' && action.kind !== 'collect') continue;
    out.push({ station, action });
  }
  return out;
}

/**
 * The best job for one vehicle.
 *
 * Direction first, because it is a hard constraint rather than a preference: an
 * empty vehicle cannot drop bikes it does not have, and a full one cannot collect
 * into space it does not have. A board that offered either would be sending
 * somebody on a wasted trip with a confident-looking label on it.
 *
 * Among the jobs it *can* do, urgency dominates and distance breaks ties — one
 * point of score is worth about a minute and a half of driving. That ratio is a
 * guess. It is the kind of guess the method sheet exists to expose, and it is
 * the first thing to re-fit once there are enough completed runs to measure
 * whether the nearer job or the worse job actually pays off more.
 */
export function bestMatch(vehicle: Vehicle, jobs: Job[], limit = 40): Match | null {
  const space = vehicle.capacity - vehicle.load;
  let best: Match | null = null;
  let bestScore = -Infinity;

  for (const job of jobs.slice(0, limit)) {
    const { action, station } = job;

    // Hard constraint: can this vehicle move bikes in this direction at all?
    const capable = action.kind === 'drop' ? vehicle.load : space;
    if (capable <= 0) continue;

    const km = distanceKm(vehicle.lat, vehicle.lon, station.station.lat, station.station.lon);
    const minutes = travelMinutes(km);
    const servable = Math.min(capable, action.bikes);
    const complete = servable >= action.bikes;

    const score = station.breakdown.score - minutes / 1.5 + (complete ? 8 : 0);
    if (score <= bestScore) continue;

    bestScore = score;
    best = {
      job,
      minutes,
      km,
      servable,
      complete,
      /*
       * Vehicle-side only.
       *
       * The first version restated the station and the drive time, both of
       * which the row already prints an inch to the left — it read "collect 24
       * · 1 min away · 48 slots free. This station needs 24 collected, 1 min
       * away." The half a dispatcher cannot see anywhere else is why *this*
       * vehicle, so that is the only half kept.
       */
      why:
        action.kind === 'drop'
          ? `carrying ${vehicle.load}` + (complete ? '' : `, ${action.bikes - servable} short of the full job`)
          : `${space} slots free` + (complete ? '' : `, fills up ${action.bikes - servable} short`),
    };
  }

  return best;
}

/* ---------------------------------------------------------------------------
   Grouping.
--------------------------------------------------------------------------- */

export interface FleetRow {
  vehicle: Vehicle;
  freeInMin: number;
  availability: Availability;
  /** Only computed for vehicles that can take work now. */
  match: Match | null;
}

export interface FleetGroups {
  'free-now': FleetRow[];
  'free-shortly': FleetRow[];
  committed: FleetRow[];
}

/**
 * Sorts the fleet into the three buckets, matching a job to each vehicle that can
 * take one.
 *
 * Matching is greedy and sequential rather than globally optimal: the soonest-
 * free vehicle picks first, and its choice is removed from the pool so two cards
 * never propose the same station. A proper assignment problem would do better,
 * but a dispatcher overrides half of these anyway, and a suggestion they cannot
 * follow the reasoning of is worse than a slightly worse suggestion they can.
 */
export function groupFleet(
  vehicles: Vehicle[],
  freeIn: (t: Vehicle) => number,
  jobs: Job[],
): FleetGroups {
  const rows = vehicles
    .map((vehicle) => ({ vehicle, freeInMin: freeIn(vehicle) }))
    .sort((a, b) => a.freeInMin - b.freeInMin || a.vehicle.id.localeCompare(b.vehicle.id));

  const pool = [...jobs];
  const groups: FleetGroups = { 'free-now': [], 'free-shortly': [], committed: [] };

  for (const { vehicle, freeInMin } of rows) {
    const availability = availabilityOf(freeInMin);
    const match = availability === 'committed' ? null : bestMatch(vehicle, pool);

    if (match) {
      const i = pool.indexOf(match.job);
      if (i >= 0) pool.splice(i, 1);
    }

    groups[availability].push({ vehicle, freeInMin, availability, match });
  }

  return groups;
}

/** "now" / "~6 min" / "~1h 05m" — the free-at value beside the state chip. */
export function formatFreeIn(min: number): string {
  if (min <= 0) return 'now';
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  return `~${h}h ${String(min % 60).padStart(2, '0')}m`;
}
