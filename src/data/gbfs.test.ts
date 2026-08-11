import { describe, expect, it } from 'vitest';
import {
  MIN_PLAUSIBLE_EPOCH_S,
  joinFeeds,
  p90CapacityOf,
  parseDiscovery,
  parseStationInformation,
  parseStationStatus,
} from './gbfs';

describe('discovery document', () => {
  it('reads the language-keyed 2.x layout, preferring English', () => {
    const { feeds, version } = parseDiscovery({
      version: '2.3',
      data: {
        fr: { feeds: [{ name: 'station_information', url: 'fr-info' }] },
        en: {
          feeds: [
            { name: 'station_information', url: 'en-info' },
            { name: 'station_status', url: 'en-status' },
          ],
        },
      },
    });
    expect(version).toBe('2.3');
    expect(feeds.get('station_information')).toBe('en-info');
    expect(feeds.get('station_status')).toBe('en-status');
  });

  it('reads the flat 3.x layout', () => {
    const { feeds } = parseDiscovery({
      version: '3.0',
      data: {
        feeds: [
          { name: 'station_information', url: 'info' },
          { name: 'station_status', url: 'status' },
        ],
      },
    });
    expect(feeds.get('station_status')).toBe('status');
  });

  it('falls back to the first language when there is no English block', () => {
    const { feeds } = parseDiscovery({
      data: {
        es: {
          feeds: [
            { name: 'station_information', url: 'es-info' },
            { name: 'station_status', url: 'es-status' },
          ],
        },
      },
    });
    expect(feeds.get('station_information')).toBe('es-info');
  });

  it('rejects a document missing the station feeds rather than half-working', () => {
    expect(() =>
      parseDiscovery({ data: { en: { feeds: [{ name: 'system_alerts', url: 'x' }] } } }),
    ).toThrow(/station_information/);
    expect(() => parseDiscovery({ nope: true })).toThrow(/no data object/);
  });
});

describe('station_information parsing', () => {
  const wrap = (stations: unknown[]) => ({ data: { stations } });

  it('parses a well-formed station', () => {
    const [s] = parseStationInformation(
      wrap([
        {
          station_id: 'a',
          name: 'Kingsland Ave & Nassau Ave',
          lat: 40.72577,
          lon: -73.94173,
          capacity: 25,
          region_id: '71',
          short_name: '5613.04',
        },
      ]),
    );
    expect(s).toMatchObject({ stationId: 'a', capacity: 25, regionId: '71' });
  });

  it('drops stations with no usable identity or position, keeping the rest', () => {
    const out = parseStationInformation(
      wrap([
        { station_id: 'a', name: 'Good St', lat: 40.7, lon: -74 },
        { name: 'No id', lat: 40.7, lon: -74 },
        { station_id: 'b', lat: 40.7, lon: -74 },
        { station_id: 'c', name: 'No coords' },
        // 0/0 would silently land in the Gulf of Guinea and be "Unknown" forever.
        { station_id: 'd', name: 'Null Island', lat: 0, lon: 0 },
        { station_id: 'e', name: 'Off planet', lat: 999, lon: -74 },
      ]),
    );
    expect(out.map((s) => s.stationId)).toEqual(['a']);
  });

  it('defaults a missing capacity to 0 rather than dropping the station', () => {
    const [s] = parseStationInformation(
      wrap([{ station_id: 'a', name: 'X', lat: 40.7, lon: -74 }]),
    );
    expect(s?.capacity).toBe(0);
  });

  it('accepts stringified numerics some producers emit', () => {
    const [s] = parseStationInformation(
      wrap([{ station_id: 7, name: 'X', lat: '40.7', lon: '-74', capacity: '31' }]),
    );
    expect(s).toMatchObject({ stationId: '7', lat: 40.7, capacity: 31 });
  });
});

describe('station_status parsing', () => {
  const wrap = (stations: unknown[]) => ({ data: { stations } });

  it('treats the 86400 sentinel as "no timestamp", not as 56 years stale', () => {
    const [s] = parseStationStatus(
      wrap([{ station_id: 'a', last_reported: 86400, num_bikes_available: 0 }]),
    );
    expect(s?.lastReportedMs).toBeNull();
  });

  it('rejects any implausibly small epoch, not just the one sentinel value', () => {
    const [s] = parseStationStatus(
      wrap([{ station_id: 'a', last_reported: MIN_PLAUSIBLE_EPOCH_S - 1 }]),
    );
    expect(s?.lastReportedMs).toBeNull();
  });

  it('converts real POSIX seconds to milliseconds', () => {
    const [s] = parseStationStatus(wrap([{ station_id: 'a', last_reported: 1785527869 }]));
    expect(s?.lastReportedMs).toBe(1785527869000);
  });

  it('passes through producers that already emit milliseconds', () => {
    const [s] = parseStationStatus(wrap([{ station_id: 'a', last_reported: 1785527869000 }]));
    expect(s?.lastReportedMs).toBe(1785527869000);
  });

  it('reads 0/1 flags and real booleans alike', () => {
    const [a, b] = parseStationStatus(
      wrap([
        { station_id: 'a', is_renting: 0, is_returning: 1, is_installed: 1 },
        { station_id: 'b', is_renting: false, is_returning: true, is_installed: true },
      ]),
    );
    expect(a).toMatchObject({ isRenting: false, isReturning: true, isInstalled: true });
    expect(b).toMatchObject({ isRenting: false, isReturning: true, isInstalled: true });
  });

  it('assumes a missing flag means working, so it cannot invent outages', () => {
    const [s] = parseStationStatus(wrap([{ station_id: 'a' }]));
    expect(s).toMatchObject({ isRenting: true, isReturning: true, isInstalled: true });
  });

  it('clamps negative counts to zero', () => {
    const [s] = parseStationStatus(
      wrap([{ station_id: 'a', num_bikes_available: -3, num_docks_available: 5 }]),
    );
    expect(s?.bikesAvailable).toBe(0);
  });
});

describe('joining the two feeds', () => {
  const info = (id: string, capacity = 20) => ({
    stationId: id,
    name: `Station ${id}`,
    shortName: null,
    lat: 40.7128,
    lon: -74.006,
    capacity,
    regionId: '71',
  });
  const status = (id: string, bikes = 5, docks = 15) => ({
    stationId: id,
    bikesAvailable: bikes,
    ebikesAvailable: 0,
    docksAvailable: docks,
    bikesDisabled: 0,
    docksDisabled: 0,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
    lastReportedMs: 1785527869000,
  });
  const meta = { feedUpdatedMs: 1, fetchedAtMs: 2, version: '2.3' };

  it('joins on station_id and derives fill from usable slots', () => {
    const r = joinFeeds([info('a')], [status('a', 5, 15)], meta);
    expect(r.stations).toHaveLength(1);
    expect(r.stations[0]).toMatchObject({ usableSlots: 20, fillRatio: 0.25 });
  });

  it('counts rather than hides stations present in only one feed', () => {
    const r = joinFeeds([info('a'), info('b')], [status('a'), status('c')], meta);
    expect(r.stations.map((s) => s.stationId)).toEqual(['a']);
    expect(r.droppedNoStatus).toBe(1); // b described, never reported
    expect(r.droppedNoInfo).toBe(1); // c reported, never described
  });

  it('derives fill from reported slots, not the unreliable nameplate capacity', () => {
    // Capacity says 40 but only 10 slots are actually usable. Dividing by
    // capacity would call this 25% full; it is physically 50% full.
    const r = joinFeeds([info('a', 40)], [status('a', 5, 5)], meta);
    expect(r.stations[0]?.fillRatio).toBe(0.5);
  });

  it('reports a null fill ratio when nothing is usable, never 0/0 = NaN', () => {
    const r = joinFeeds([info('a')], [status('a', 0, 0)], meta);
    expect(r.stations[0]?.fillRatio).toBeNull();
    expect(r.stations[0]?.usableSlots).toBe(0);
  });
});

describe('p90 capacity', () => {
  it('takes the 90th percentile, not the maximum', () => {
    const caps = Array.from({ length: 10 }, (_, i) => ({ capacity: i + 1 }));
    expect(p90CapacityOf(caps)).toBe(9);
  });

  it('ignores zero-capacity stations so they cannot drag the baseline to zero', () => {
    // 36 real stations report capacity 0. Left in, they dominate the low end
    // and can pull the percentile onto a zero — which would make every
    // capacity weight collapse to the floor.
    const caps = [...Array<{ capacity: number }>(5).fill({ capacity: 0 }), { capacity: 100 }];
    expect(p90CapacityOf(caps)).toBe(100);
  });

  it('falls back to 1 rather than dividing by zero on an empty network', () => {
    expect(p90CapacityOf([])).toBe(1);
    expect(p90CapacityOf([{ capacity: 0 }])).toBe(1);
  });
});
