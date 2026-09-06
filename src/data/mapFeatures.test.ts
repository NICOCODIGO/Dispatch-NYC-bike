import { describe, expect, it } from 'vitest';
import type { JoinedStation } from './gbfs';
import { scoreNetwork } from '../model/summary';
import { stationFeatures, swapFeatures, tierCounts, tierOf } from './mapFeatures';
import { findSwapPairs } from './swaps';
import { triage } from '../model/triage';

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
  installed?: boolean;
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
    borough: 'Manhattan',
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
      isRenting: true,
      isReturning: true,
      lastReportedMs: NOW - (over.ageMin ?? 1) * 60_000,
    },
  };
}

const scored = (s: JoinedStation[]) => scoreNetwork(s, NOW, P90);

describe('tierOf', () => {
  it('reads a zero-bike station as critical', () => {
    const [s] = scored([station({ bikes: 0, docks: 40 })]);
    expect(tierOf(s!.breakdown)).toBe('critical');
  });

  it('reads a balanced station as healthy', () => {
    const [s] = scored([station({ bikes: 20, docks: 20 })]);
    expect(tierOf(s!.breakdown)).toBe('healthy');
  });

  it('reads a silent station as silent regardless of what its counts imply', () => {
    const [s] = scored([station({ bikes: 0, docks: 40, ageMin: 400 })]);
    expect(tierOf(s!.breakdown)).toBe('silent');
  });

  it('reads a not-installed station as silent', () => {
    const [s] = scored([station({ installed: false })]);
    expect(tierOf(s!.breakdown)).toBe('silent');
  });
});

describe('stationFeatures', () => {
  it('drops stations with no usable coordinate', () => {
    const fc = stationFeatures(scored([station({ lat: NaN }), station({})]));
    expect(fc.features).toHaveLength(1);
  });

  it('sizes an urgent station by its bikes-to-move, not its capacity', () => {
    const [s] = scored([station({ bikes: 0, docks: 40, capacity: 40 })]);
    const fc = stationFeatures([s!]);
    // midpoint of 40 usable slots is 20, and it holds none.
    expect(fc.features[0]?.properties.bikesToMove).toBe(20);
  });

  it('carries zero bikes-to-move for a silent station', () => {
    const [s] = scored([station({ bikes: 0, docks: 40, ageMin: 400 })]);
    const fc = stationFeatures([s!]);
    expect(fc.features[0]?.properties.bikesToMove).toBe(0);
    expect(fc.features[0]?.properties.score).toBe(-1);
    expect(fc.features[0]?.properties.bikes).toBe(-1);
  });

  it('exposes the strings the hover card needs', () => {
    const [s] = scored([station({ name: 'Grand Army Plaza', bikes: 0, docks: 40 })]);
    const p = stationFeatures([s!]).features[0]?.properties;
    expect(p?.name).toBe('Grand Army Plaza');
    expect(p?.status).toBe('Empty');
    expect(p?.reported).toMatch(/ago|now/);
  });
});

describe('tierCounts', () => {
  it('totals every station across the four tiers', () => {
    const list = scored([
      station({ bikes: 0, docks: 40 }), // critical
      station({ bikes: 20, docks: 20 }), // healthy
      station({ bikes: 20, docks: 20 }), // healthy
      station({ installed: false }), // silent
    ]);
    const c = tierCounts(list);
    expect(c.critical).toBe(1);
    expect(c.healthy).toBe(2);
    expect(c.silent).toBe(1);
    expect(c.critical + c['needs-vehicle'] + c.healthy + c.silent).toBe(4);
  });
});

describe('swapFeatures', () => {
  it('draws one connector per pair with the move size in the label', () => {
    const list = scored([
      station({ name: 'Full', bikes: 40, docks: 0, lat: 40.75 }),
      station({ name: 'Empty', bikes: 0, docks: 40, lat: 40.754 }),
    ]);
    const fc = swapFeatures(findSwapPairs(triage(list).vehicle));
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.geometry.coordinates).toHaveLength(2);
    expect(fc.features[0]?.properties.label).toMatch(/^swap \d+$/);
  });
});
