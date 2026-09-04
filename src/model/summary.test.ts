import { describe, expect, it } from 'vitest';
import type { JoinedStation } from '../data/gbfs';
import type { Borough } from '../data/boroughs';
import { applyFilters } from './queue';
import { scoreNetwork, summarize, summarizeAll } from './summary';
import { laneOf, triage } from './triage';
import type { Filters } from '../store/useDispatch';

const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const P90 = 54;

let seq = 0;

function station(over: {
  bikes?: number;
  docks?: number;
  capacity?: number;
  borough?: Borough;
  name?: string;
  installed?: boolean;
  renting?: boolean;
  returning?: boolean;
  ageMin?: number;
}): JoinedStation {
  const bikes = over.bikes ?? 10;
  const docks = over.docks ?? 10;
  const usableSlots = bikes + docks;
  const id = `s${seq++}`;
  return {
    stationId: id,
    name: over.name ?? `Station ${id}`,
    shortName: null,
    lat: 40.75,
    lon: -73.98,
    capacity: over.capacity ?? 27,
    regionId: '71',
    borough: over.borough ?? 'Manhattan',
    usableSlots,
    fillRatio: usableSlots > 0 ? bikes / usableSlots : null,
    status: {
      stationId: id,
      bikesAvailable: bikes,
      ebikesAvailable: 0,
      docksAvailable: docks,
      bikesDisabled: 0,
      docksDisabled: 0,
      isInstalled: over.installed ?? true,
      isRenting: over.renting ?? true,
      isReturning: over.returning ?? true,
      lastReportedMs: NOW - (over.ageMin ?? 1) * 60_000,
    },
  };
}

const score = (stations: JoinedStation[]) => scoreNetwork(stations, NOW, P90);
const summaryOf = (stations: JoinedStation[]) => summarizeAll(score(stations));

// A vehicle-actionable failure, a mechanical one, and an untrustworthy one.
const EMPTY = () => station({ bikes: 0, docks: 40 });
const FULL = () => station({ bikes: 40, docks: 0 });
const BROKEN = () => station({ renting: false, returning: false });
const STALE = () => station({ bikes: 0, docks: 40, ageMin: 120 });

describe('triage', () => {
  it('routes vehicle-fixable failures to the vehicle lane', () => {
    const lanes = triage(score([EMPTY(), FULL(), station({ bikes: 2, docks: 38 })]));
    expect(lanes.vehicle).toHaveLength(3);
    expect(lanes.mechanic).toHaveLength(0);
  });

  it('routes mechanical failures away from the vehicle lane', () => {
    const lanes = triage(score([BROKEN(), station({ returning: false })]));
    expect(lanes.vehicle).toHaveLength(0);
    expect(lanes.mechanic).toHaveLength(2);
  });

  it('quarantines stale readings ahead of every other verdict', () => {
    // Unusable *and* stale. The "unusable" verdict is derived from counts we
    // have already said we do not trust, so it cannot be the reason to
    // dispatch a technician.
    const lanes = triage(score([station({ bikes: 0, docks: 0, ageMin: 200 })]));
    expect(lanes.unverified).toHaveLength(1);
    expect(lanes.mechanic).toHaveLength(0);
  });

  it('keeps healthy and uninstalled stations out of every dispatch lane', () => {
    const lanes = triage(
      score([station({ bikes: 20, docks: 20 }), station({ installed: false, bikes: 0, docks: 0 })]),
    );
    expect(lanes.quiet).toHaveLength(2);
    expect(lanes.vehicle).toHaveLength(0);
  });

  it('assigns every station to exactly one lane', () => {
    const scored = score([EMPTY(), FULL(), BROKEN(), STALE(), station({ bikes: 20, docks: 20 })]);
    const lanes = triage(scored);
    const total =
      lanes.vehicle.length + lanes.mechanic.length + lanes.unverified.length + lanes.quiet.length;
    expect(total).toBe(scored.length);
  });

  it('never puts an outage-signalled station in the vehicle lane', () => {
    const lanes = triage(score([BROKEN(), EMPTY(), station({ renting: false, bikes: 5 })]));
    for (const s of lanes.vehicle) expect(s.breakdown.signal).not.toBe('outage');
  });

  it('preserves worst-first order within a lane', () => {
    const lanes = triage(score([station({ bikes: 4, docks: 36 }), EMPTY(), FULL()]));
    const scores = lanes.vehicle.map((s) => s.breakdown.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('summary counts only vehicle work as vehicle work', () => {
  it('excludes mechanic and unverified stations from the vehicle total', () => {
    const s = summaryOf([EMPTY(), FULL(), BROKEN(), BROKEN(), STALE()]);
    expect(s.needsVehicle).toBe(2);
    expect(s.mechanic).toBe(2);
    expect(s.unverified).toBe(1);
  });

  it('separates the two failure sides, which need opposite vehicle actions', () => {
    const s = summaryOf([EMPTY(), EMPTY(), FULL(), station({ bikes: 10, docks: 10 })]);
    expect(s.emptySide).toBe(2);
    expect(s.fullSide).toBe(1);
    expect(s.dominant).toMatchObject({ signal: 'empty', count: 2 });
  });

  it('names the worst vehicle-actionable station, never a broken one', () => {
    // The broken station scores higher, but a vehicle cannot fix it.
    const stations = [BROKEN(), EMPTY()];
    const scored = score(stations);
    const lanes = triage(scored);
    const s = summarize(scored, lanes);
    expect(scored[0]!.breakdown.category).toBe('unusable'); // it does outrank
    expect(s.worstVehicle?.name).toBe(lanes.vehicle[0]!.station.name);
    expect(laneOf(scored[0]!.breakdown)).toBe('mechanic');
  });

  it('measures network fill across every installed station', () => {
    const s = summaryOf([station({ bikes: 10, docks: 10 }), station({ installed: false })]);
    expect(s.networkFill).toBe(0.5);
    expect(s.ranked).toBe(1);
  });

  it('reports a null network fill rather than NaN when nothing is usable', () => {
    const s = summaryOf([station({ bikes: 0, docks: 0 })]);
    expect(s.networkFill).toBeNull();
  });

  it('tallies the worst ten from vehicle-actionable stations only', () => {
    const s = summaryOf([
      ...Array.from({ length: 4 }, () => station({ bikes: 0, docks: 40, borough: 'Brooklyn' })),
      ...Array.from({ length: 6 }, () => station({ renting: false, returning: false, borough: 'Queens' })),
    ]);
    expect(s.worstTen).toMatchObject({ borough: 'Brooklyn', count: 4 });
  });
});


describe('queue filtering', () => {
  const base: Filters = {
    search: '',
    borough: 'all',
    categories: [],
    sortKey: 'score',
    sortDir: 'desc',
  };

  const fixture = () =>
    triage(
      score([
        station({ name: 'Alpha St', bikes: 0, docks: 40, borough: 'Manhattan' }),
        station({ name: 'Bravo Ave', bikes: 40, docks: 0, borough: 'Brooklyn' }),
        station({ name: 'Charlie Rd', bikes: 10, docks: 10, borough: 'Queens' }),
        station({ name: 'Delta Way', renting: false, returning: false, borough: 'Bronx' }),
        station({ name: 'Echo Pl', bikes: 0, docks: 40, ageMin: 200, borough: 'Bronx' }),
      ]),
    );

  it('shows only vehicle-actionable stations by default', () => {
    const names = applyFilters(fixture(), base).map((s) => s.station.name);
    expect(names).toEqual(['Alpha St', 'Bravo Ave']);
  });

  it('never lets a mechanic or unverified station into the table, even when filtered', () => {
    const all = applyFilters(fixture(), {
      ...base,
      categories: ['unusable', 'outage', 'empty', 'full', 'starving', 'flooded', 'healthy'],
    });
    const names = all.map((s) => s.station.name);
    expect(names).not.toContain('Delta Way'); // mechanic
    expect(names).not.toContain('Echo Pl'); // unverified
  });

  it('admits healthy stations only when explicitly asked for', () => {
    expect(applyFilters(fixture(), base).map((s) => s.station.name)).not.toContain('Charlie Rd');
    expect(
      applyFilters(fixture(), { ...base, categories: ['healthy'] }).map((s) => s.station.name),
    ).toEqual(['Charlie Rd']);
  });

  it('searches name and borough together', () => {
    expect(applyFilters(fixture(), { ...base, search: 'bravo' })).toHaveLength(1);
    expect(applyFilters(fixture(), { ...base, search: 'brooklyn' })).toHaveLength(1);
    expect(applyFilters(fixture(), { ...base, search: 'nope' })).toHaveLength(0);
  });

  it('filters by borough', () => {
    expect(
      applyFilters(fixture(), { ...base, borough: 'Brooklyn' }).map((s) => s.station.name),
    ).toEqual(['Bravo Ave']);
  });

  it('sorts names alphabetically', () => {
    const out = applyFilters(fixture(), { ...base, sortKey: 'name', sortDir: 'asc' });
    expect(out.map((s) => s.station.name)).toEqual(['Alpha St', 'Bravo Ave']);
  });

  // The Borough header used to sort by 'category' — failure severity — which is
  // the one thing it does not say. Grouping by borough is the point of the
  // column, and worst-first inside each group is what makes the grouping useful.
  it('sorts by borough, worst-first within each one', () => {
    const boroughs = triage(
      score([
        station({ name: 'Queens empty', bikes: 0, docks: 40, borough: 'Queens' }),
        station({ name: 'Bronx full', bikes: 40, docks: 0, borough: 'Bronx' }),
        station({ name: 'Bronx empty', bikes: 0, docks: 40, borough: 'Bronx' }),
        station({ name: 'Manhattan empty', bikes: 0, docks: 40, borough: 'Manhattan' }),
      ]),
    );

    const asc = applyFilters(boroughs, { ...base, sortKey: 'borough', sortDir: 'asc' });
    expect(asc.map((s) => s.station.borough)).toEqual([
      'Bronx',
      'Bronx',
      'Manhattan',
      'Queens',
    ]);
    // Empty outranks full, so the tie inside the Bronx breaks on urgency.
    expect(asc.slice(0, 2).map((s) => s.station.name)).toEqual(['Bronx empty', 'Bronx full']);

    const desc = applyFilters(boroughs, { ...base, sortKey: 'borough', sortDir: 'desc' });
    expect(desc.map((s) => s.station.borough)).toEqual([
      'Queens',
      'Manhattan',
      'Bronx',
      'Bronx',
    ]);
  });

  it('produces a stable order for tied scores so refresh does not shuffle rows', () => {
    const tied = triage(
      score([
        station({ name: 'Zulu', bikes: 0, docks: 40, capacity: 30 }),
        station({ name: 'Alpha', bikes: 0, docks: 40, capacity: 30 }),
      ]),
    );
    expect(applyFilters(tied, base).map((s) => s.station.name)).toEqual(['Alpha', 'Zulu']);
    expect(applyFilters(tied, base).map((s) => s.station.name)).toEqual(['Alpha', 'Zulu']);
  });
});
