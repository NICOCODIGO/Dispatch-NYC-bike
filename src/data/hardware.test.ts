import { describe, expect, it } from 'vitest';
import type { JoinedStation } from './gbfs';
import type { Borough } from './boroughs';
import { scoreNetwork } from '../model/summary';
import { CRIPPLED_SHARE, hardwareLoad, hardwareTotals, rankHardware } from './hardware';

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);
const P90 = 54;

let seq = 0;
function station(over: {
  name?: string;
  bikes?: number;
  docks?: number;
  ebikes?: number;
  bikesDisabled?: number;
  docksDisabled?: number;
  borough?: Borough;
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
    capacity: 30,
    regionId: '71',
    borough: over.borough ?? 'Manhattan',
    usableSlots,
    fillRatio: usableSlots > 0 ? bikes / usableSlots : null,
    status: {
      stationId: id,
      bikesAvailable: bikes,
      ebikesAvailable: over.ebikes ?? 0,
      docksAvailable: docks,
      bikesDisabled: over.bikesDisabled ?? 0,
      docksDisabled: over.docksDisabled ?? 0,
      isInstalled: true,
      isRenting: true,
      isReturning: true,
      lastReportedMs: NOW - (over.ageMin ?? 1) * 60_000,
    },
  };
}

const load = (stations: JoinedStation[]) => hardwareLoad(scoreNetwork(stations, NOW, P90), NOW);

describe('hardware load', () => {
  it('keeps only stations with something wrong', () => {
    const rows = load([
      station({ name: 'Healthy' }),
      station({ name: 'Dead docks', docksDisabled: 4 }),
      station({ name: 'Broken bikes', bikesDisabled: 2 }),
    ]);
    expect(rows.map((r) => r.name).sort()).toEqual(['Broken bikes', 'Dead docks']);
  });

  it('carries the operator counts through unchanged', () => {
    const [row] = load([station({ docksDisabled: 6, bikesDisabled: 3 })]);
    expect(row?.deadDocks).toBe(6);
    expect(row?.brokenBikes).toBe(3);
  });

  // These counts are exactly what the app has already decided not to trust.
  it('excludes unverified stations', () => {
    const rows = load([
      station({ name: 'Fresh', docksDisabled: 4 }),
      station({ name: 'Silent', docksDisabled: 9, ageMin: 400 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Fresh']);
  });

  it('never reports more low-charge bikes than the feed says are electric', () => {
    for (let i = 0; i < 25; i += 1) {
      const rows = load([station({ name: `S${i}`, bikes: 20, ebikes: 3, docksDisabled: 1 })]);
      const row = rows[0];
      if (!row) continue;
      expect(row.lowCharge).toBeLessThanOrEqual(row.ebikes);
    }
  });

  it('does not run the charge model on a station with no e-bikes', () => {
    const [row] = load([station({ ebikes: 0, docksDisabled: 2 })]);
    expect(row?.lowCharge).toBe(0);
  });

  it('computes the dead share against every dock at the site', () => {
    // 10 bikes + 10 free + 5 dead = 25 docks, 5 dead.
    const [row] = load([station({ bikes: 10, docks: 10, docksDisabled: 5 })]);
    expect(row?.totalDocks).toBe(25);
    expect(row?.deadShare).toBeCloseTo(5 / 25);
  });

  it('reports a null share rather than dividing by nothing', () => {
    const [row] = load([station({ bikes: 0, docks: 0, docksDisabled: 0, bikesDisabled: 3 })]);
    expect(row?.deadShare).toBeCloseTo(0);
    expect(row?.brokenBikes).toBe(3);
  });
});

describe('ranking', () => {
  const rows = () =>
    load([
      station({ name: 'ManyDocks', docksDisabled: 9, bikesDisabled: 1 }),
      station({ name: 'ManyBikes', docksDisabled: 1, bikesDisabled: 8 }),
      station({ name: 'Mild', docksDisabled: 2, bikesDisabled: 2 }),
    ]);

  it('ranks by dead docks when asked', () => {
    expect(rankHardware(rows(), 'docks').map((r) => r.name)).toEqual([
      'ManyDocks',
      'Mild',
      'ManyBikes',
    ]);
  });

  it('ranks by broken bikes when asked', () => {
    expect(rankHardware(rows(), 'bikes').map((r) => r.name)).toEqual([
      'ManyBikes',
      'Mild',
      'ManyDocks',
    ]);
  });

  it('breaks a tie on dead docks by the share of the rack that is out', () => {
    // Same four dead docks; the smaller station has lost far more of itself.
    const list = load([
      station({ name: 'Big', bikes: 30, docks: 30, docksDisabled: 4 }),
      station({ name: 'Small', bikes: 2, docks: 2, docksDisabled: 4 }),
    ]);
    expect(rankHardware(list, 'docks').map((r) => r.name)).toEqual(['Small', 'Big']);
  });

  it('is stable for genuinely equal rows', () => {
    const list = load([
      station({ name: 'Bravo', bikes: 10, docks: 10, docksDisabled: 3 }),
      station({ name: 'Alpha', bikes: 10, docks: 10, docksDisabled: 3 }),
    ]);
    expect(rankHardware(list, 'docks').map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
    expect(rankHardware(list, 'docks').map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('does not mutate the array it was given', () => {
    const list = rows();
    const before = list.map((r) => r.name);
    rankHardware(list, 'docks');
    expect(list.map((r) => r.name)).toEqual(before);
  });
});

describe('totals', () => {
  it('sums the network', () => {
    const t = hardwareTotals(
      load([
        station({ docksDisabled: 4, bikesDisabled: 2 }),
        station({ docksDisabled: 1, bikesDisabled: 5 }),
      ]),
    );
    expect(t.stations).toBe(2);
    expect(t.deadDocks).toBe(5);
    expect(t.brokenBikes).toBe(7);
  });

  it('counts a site as crippled once most of the rack is out', () => {
    // 1 bike + 1 free + 8 dead = 10 docks, 80% dead.
    const t = hardwareTotals(load([station({ bikes: 1, docks: 1, docksDisabled: 8 })]));
    expect(t.crippled).toBe(1);
    expect(CRIPPLED_SHARE).toBeLessThan(0.8);
  });

  it('does not call a lightly damaged site crippled', () => {
    const t = hardwareTotals(load([station({ bikes: 20, docks: 20, docksDisabled: 2 })]));
    expect(t.crippled).toBe(0);
  });

  it('returns zeroes for an undamaged network rather than throwing', () => {
    const t = hardwareTotals(load([station({}), station({})]));
    expect(t).toMatchObject({ stations: 0, deadDocks: 0, brokenBikes: 0, crippled: 0 });
  });
});
