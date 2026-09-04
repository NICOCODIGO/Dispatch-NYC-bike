/**
 * Dispatch snapshot Worker — SCAFFOLD, NOT DEPLOYED.
 *
 * See ../README.md for why this exists but is not wired up.
 *
 * The important design point is the import below: this Worker scores stations
 * with the *same* pure module the browser uses. `src/model/score.ts` has no DOM
 * or React dependency for exactly this reason, so the history table and the
 * live board can never disagree about what a score of 78 means.
 *
 * To activate: fill in `database_id` in wrangler.toml, run the schema, and
 * deploy. Nothing in the app imports this file.
 */

import { fetchNetwork } from '../../src/data/gbfs';
import { scoreStation } from '../../src/model/score';

export interface Env {
  DB: D1Database;
}

/** Truncate to the 5-minute run boundary so a retried run overwrites. */
function runBoundarySeconds(now: number): number {
  const seconds = Math.floor(now / 1000);
  return seconds - (seconds % 300);
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(snapshot(env));
  },
};

async function snapshot(env: Env): Promise<void> {
  const feed = await fetchNetwork();
  const now = Date.now();
  const t = runBoundarySeconds(now);

  const scored = feed.stations.map((station) => ({
    station,
    breakdown: scoreStation(station, station.status, now, feed.p90Capacity),
  }));

  // Only persist stations that are actually failing. Storing all ~2,400 every
  // five minutes would be 690k rows a day to answer questions about the 600
  // that matter.
  const flagged = scored.filter((s) => s.breakdown.needsVehicle || s.breakdown.score >= 40);

  const insertSnapshot = env.DB.prepare(
    `INSERT OR REPLACE INTO snapshot
       (station_id, t, score, category, signal, bikes, docks, needs_vehicle)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const upsertStation = env.DB.prepare(
    `INSERT INTO station (station_id, name, borough, capacity, lat, lon, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(station_id) DO UPDATE SET
       name = excluded.name,
       borough = excluded.borough,
       capacity = excluded.capacity,
       updated_at = excluded.updated_at`,
  );

  await env.DB.batch([
    ...flagged.map(({ station, breakdown }) =>
      insertSnapshot.bind(
        station.stationId,
        t,
        breakdown.score,
        breakdown.category,
        breakdown.signal,
        breakdown.fill.bikes,
        breakdown.fill.docks,
        breakdown.needsVehicle ? 1 : 0,
      ),
    ),
    ...flagged.map(({ station }) =>
      upsertStation.bind(
        station.stationId,
        station.name,
        station.borough,
        station.capacity,
        station.lat,
        station.lon,
        t,
      ),
    ),
  ]);
}
