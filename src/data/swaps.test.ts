import { describe, expect, it } from 'vitest';
import type { JoinedStation } from './gbfs';
import type { Borough } from './boroughs';
import { scoreNetwork } from '../model/summary';
import { triage } from '../model/triage';
import { findSwapPairs } from './swaps';

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);
const P90 = 54;

let seq = 0;
function station(over: {
  name?: string;
  bikes?: number;
  docks?: number;
  lat?: number;
  lon?: number;
  capacity?: number;
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
    lat: over.lat ?? 40.75,
    lon: over.lon ?? -73.98,
    capacity: over.capacity ?? 40,
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
      isInstalled: true,
      isRenting: true,
      isReturning: true,
      lastReportedMs: NOW - (over.ageMin ?? 1) * 60_000,
    },
  };
}

const pairs = (stations: JoinedStation[]) =>
  findSwapPairs(triage(scoreNetwork(stations, NOW, P90)).vehicle);

// ~0.004° of latitude is roughly 440 m; ~0.009° is roughly 1 km.
const NEAR = 0.004;
const FAR = 0.009;

describe('findSwapPairs', () => {
  it('pairs an overfull station with a nearby empty one', () => {
    const list = pairs([
      station({ name: 'Full', bikes: 40, docks: 0, lat: 40.75 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.75 + NEAR }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.from.station.name).toBe('Full');
    expect(list[0]?.to.station.name).toBe('Empty');
  });

  it('moves the smaller of the two needs', () => {
    // Full sits just 11 over its midpoint; Empty is a full 20 short of its own.
    const list = pairs([
      station({ name: 'Full', bikes: 22, docks: 0, lat: 40.75 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.75 + NEAR }),
    ]);
    expect(list[0]?.bikes).toBe(11);
  });

  it('leaves a healthy mid-fill station out of it', () => {
    const list = pairs([
      station({ name: 'Balanced', bikes: 20, docks: 20, lat: 40.75 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.75 + NEAR }),
    ]);
    expect(list).toHaveLength(0);
  });

  it('pairs only stations the queue would actually dispatch', () => {
    const list = pairs([
      station({ name: 'Full', bikes: 40, docks: 0, lat: 40.75 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.75 + NEAR }),
    ]);
    for (const p of list) {
      expect(p.from.breakdown.needsVehicle).toBe(true);
      expect(p.to.breakdown.needsVehicle).toBe(true);
    }
  });

  it('does not pair across more than the radius', () => {
    const list = pairs([
      station({ name: 'Full', bikes: 40, docks: 0, lat: 40.75 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.75 + FAR }),
    ]);
    expect(list).toHaveLength(0);
  });

  it('claims each empty-side partner only once', () => {
    const list = pairs([
      station({ name: 'FullA', bikes: 40, docks: 0, lat: 40.75 }),
      station({ name: 'FullB', bikes: 38, docks: 0, lat: 40.75 + 0.0005 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.75 + NEAR }),
    ]);
    expect(list).toHaveLength(1);
  });

  it('lets the worst surplus pick its partner first', () => {
    // Two empties in range of one full; the closer one wins, but the worse full
    // gets to choose before the milder one.
    const list = pairs([
      station({ name: 'BadFull', bikes: 60, docks: 0, capacity: 60, lat: 40.75 }),
      station({ name: 'MildFull', bikes: 40, docks: 0, capacity: 40, lat: 40.75 + 0.001 }),
      station({ name: 'EmptyNear', bikes: 0, docks: 40, lat: 40.75 + 0.001 }),
      station({ name: 'EmptyFar', bikes: 0, docks: 40, lat: 40.75 + NEAR }),
    ]);
    const bad = list.find((p) => p.from.station.name === 'BadFull');
    expect(bad?.to.station.name).toBe('EmptyNear');
  });

  it('reports the straight-line separation in metres', () => {
    const [pair] = pairs([
      station({ name: 'Full', bikes: 40, docks: 0, lat: 40.75 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.75 + NEAR }),
    ]);
    expect(pair?.meters).toBeGreaterThan(300);
    expect(pair?.meters).toBeLessThan(500);
  });

  it('returns nothing when the network is balanced', () => {
    expect(pairs([station({ bikes: 20, docks: 20 }), station({ bikes: 20, docks: 20 })])).toEqual(
      [],
    );
  });
});
