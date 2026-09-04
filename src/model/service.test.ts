import { describe, expect, it } from 'vitest';
import type { StationInfo, StationStatus } from '../data/gbfs';
import { DEFAULT_P90_CAPACITY, scoreStation } from './score';
import type { ScoredStation } from './summary';
import {
  SERVICE_TARGET,
  SERVICE_WARN_MARGIN,
  isServing,
  serviceBand,
  serviceLevel,
  targetCutIndex,
} from './service';

const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const MINUTE = 60_000;

function info(over: Partial<StationInfo> = {}): StationInfo {
  return {
    stationId: 'S1',
    name: 'Test St & Test Ave',
    shortName: '0000.00',
    lat: 40.75,
    lon: -73.98,
    capacity: DEFAULT_P90_CAPACITY / 2,
    regionId: '71',
    ...over,
  };
}

function status(over: Partial<StationStatus> = {}): StationStatus {
  return {
    stationId: 'S1',
    bikesAvailable: 10,
    ebikesAvailable: 0,
    docksAvailable: 10,
    bikesDisabled: 0,
    docksDisabled: 0,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
    lastReportedMs: NOW - MINUTE, // fresh
    ...over,
  };
}

/**
 * A scored station built from a status patch. `serviceLevel` reads the station
 * and its breakdown together — the breakdown decides whether it is measured at
 * all, the status decides whether it is serving — so the two must come from the
 * same inputs, as they do in the store.
 */
function station(id: string, over: Partial<StationStatus> = {}): ScoredStation {
  const s = status({ stationId: id, ...over });
  const i = info({ stationId: id });
  const usableSlots = s.bikesAvailable + s.docksAvailable;
  return {
    station: {
      ...i,
      status: s,
      borough: 'Manhattan',
      usableSlots,
      fillRatio: usableSlots > 0 ? s.bikesAvailable / usableSlots : null,
    },
    breakdown: scoreStation(i, s, NOW),
  };
}

const SERVING = {};
const NO_BIKES = { bikesAvailable: 0, docksAvailable: 20 };
const NO_DOCKS = { bikesAvailable: 20, docksAvailable: 0 };
const SILENT = { lastReportedMs: NOW - 61 * MINUTE };

describe('isServing', () => {
  it('accepts a station with at least one bike and one dock', () => {
    expect(isServing(status({ bikesAvailable: 1, docksAvailable: 1 }))).toBe(true);
  });

  it('rejects a station with no bikes to take', () => {
    expect(isServing(status(NO_BIKES))).toBe(false);
  });

  it('rejects a station with nowhere to park', () => {
    expect(isServing(status(NO_DOCKS))).toBe(false);
  });

  it('rejects a station whose bikes nobody is allowed to rent', () => {
    // The counts say there are forty bikes; the operator says none may leave.
    expect(isServing(status({ bikesAvailable: 40, isRenting: false }))).toBe(false);
  });

  it('rejects a station that will not accept a returning bike', () => {
    expect(isServing(status({ isReturning: false }))).toBe(false);
  });

  it('rejects a station that is not installed', () => {
    expect(isServing(status({ isInstalled: false }))).toBe(false);
  });

  it('does not care how comfortable the station is, only that it works', () => {
    // One bike left is a station about to fail, and it is still serving the
    // next rider. Urgency is the score's job; this is not a second opinion.
    expect(isServing(status({ bikesAvailable: 1, docksAvailable: 99 }))).toBe(true);
    expect(isServing(status({ bikesAvailable: 99, docksAvailable: 1 }))).toBe(true);
  });
});

describe('serviceLevel', () => {
  it('is the share of reporting stations a rider can use', () => {
    const r = serviceLevel([
      station('a', SERVING),
      station('b', SERVING),
      station('c', SERVING),
      station('d', NO_BIKES),
    ]);
    expect(r.measured).toBe(4);
    expect(r.usable).toBe(3);
    expect(r.level).toBe(0.75);
  });

  it('leaves silent stations out of the measurement entirely', () => {
    // Their counts are the exact thing this measure would have to read, and the
    // board has already ruled those counts inadmissible.
    const r = serviceLevel([
      station('a', SERVING),
      station('b', { ...NO_BIKES, ...SILENT }),
    ]);
    expect(r.measured).toBe(1);
    expect(r.unverified).toBe(1);
    expect(r.level).toBe(1);
  });

  it('leaves uninstalled stations out of both counts', () => {
    const r = serviceLevel([
      station('a', SERVING),
      station('b', { isInstalled: false, bikesAvailable: 0, docksAvailable: 0 }),
    ]);
    expect(r.measured).toBe(1);
    expect(r.unverified).toBe(0);
    expect(r.level).toBe(1);
  });

  it('reports no level at all when nothing is measurable', () => {
    const r = serviceLevel([]);
    expect(r.level).toBeNull();
    expect(r.meetsTarget).toBe(false);
    expect(r.shortfall).toBe(0);
  });

  it('counts a fully served network as meeting the target', () => {
    const r = serviceLevel([station('a'), station('b'), station('c')]);
    expect(r.level).toBe(1);
    expect(r.meetsTarget).toBe(true);
    expect(r.shortfall).toBe(0);
  });

  it('states the shortfall as stations, not as a percentage', () => {
    // 10 stations, 6 usable. The target needs 9, so 3 have to come back — which
    // is a number of trips, the unit a dispatcher plans in.
    const list = [
      ...Array.from({ length: 6 }, (_, i) => station(`ok${i}`)),
      ...Array.from({ length: 4 }, (_, i) => station(`bad${i}`, NO_BIKES)),
    ];
    const r = serviceLevel(list);
    expect(r.measured).toBe(10);
    expect(r.usable).toBe(6);
    expect(r.shortfall).toBe(3);
    expect(r.meetsTarget).toBe(false);
  });

  it('agrees with itself at the boundary', () => {
    // Whatever the float division says, meeting the target and having no
    // shortfall have to be the same statement — two comparisons that can
    // disagree by a rounding error is how a card ends up reading "90%, 1 short".
    for (let measured = 1; measured <= 200; measured++) {
      for (const usable of [
        Math.floor(SERVICE_TARGET * measured),
        Math.ceil(SERVICE_TARGET * measured),
      ]) {
        const list = [
          ...Array.from({ length: usable }, (_, i) => station(`ok${i}`)),
          ...Array.from({ length: measured - usable }, (_, i) => station(`bad${i}`, NO_BIKES)),
        ];
        const r = serviceLevel(list);
        expect(r.meetsTarget).toBe(r.shortfall === 0);
        if (r.meetsTarget) expect(r.usable).toBeGreaterThanOrEqual(SERVICE_TARGET * r.measured);
      }
    }
  });

  it('carries the target it compared against', () => {
    expect(serviceLevel([station('a')]).target).toBe(SERVICE_TARGET);
  });
});

describe('serviceBand', () => {
  it('is good at exactly the target', () => {
    expect(serviceBand(SERVICE_TARGET)).toBe('good');
  });

  it('is fair one point below the target', () => {
    expect(serviceBand(SERVICE_TARGET - 0.01)).toBe('fair');
  });

  it('is fair at exactly the warning margin', () => {
    expect(serviceBand(SERVICE_TARGET - SERVICE_WARN_MARGIN)).toBe('fair');
  });

  it('is poor just below the margin', () => {
    expect(serviceBand(SERVICE_TARGET - SERVICE_WARN_MARGIN - 0.001)).toBe('poor');
  });

  it('reports unknown when there is nothing to measure', () => {
    expect(serviceBand(null)).toBe('unknown');
  });

  it('agrees with meetsTarget wherever both have an opinion', () => {
    // The colour and the "N stations short" line are read together. Green above
    // a shortfall, or amber with nothing left to do, is the contradiction this
    // pairing exists to prevent.
    for (let measured = 1; measured <= 120; measured++) {
      for (let usable = 0; usable <= measured; usable++) {
        const list = [
          ...Array.from({ length: usable }, (_, i) => station(`ok${i}`)),
          ...Array.from({ length: measured - usable }, (_, i) => station(`bad${i}`, NO_BIKES)),
        ];
        const r = serviceLevel(list);
        expect(serviceBand(r.level) === 'good').toBe(r.meetsTarget);
      }
    }
  });

  it('never gets worse as the level rises', () => {
    const rank = { poor: 0, fair: 1, good: 2, unknown: -1 };
    let last = -1;
    for (let i = 0; i <= 100; i++) {
      const r = rank[serviceBand(i / 100)];
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });
});

describe('targetCutIndex', () => {
  it('draws no line when the target is already met', () => {
    expect(targetCutIndex([true, true, true], 0)).toBeNull();
  });

  it('counts only the rows that would restore a station', () => {
    // Rows 0 and 2 are real failures; row 1 is a drifting station that already
    // serves riders, so clearing it moves the service level by nothing.
    expect(targetCutIndex([true, false, true, false], 2)).toBe(3);
  });

  it('lands immediately after the last row it needs', () => {
    expect(targetCutIndex([true, true, true], 1)).toBe(1);
    expect(targetCutIndex([true, true, true], 2)).toBe(2);
  });

  it('skips a run of rows that change nothing', () => {
    expect(targetCutIndex([false, false, false, true], 1)).toBe(4);
  });

  it('draws no line when the queue cannot close the gap', () => {
    // The rest of the shortfall is somewhere a vehicle cannot reach — a mechanic
    // fault, or a station that has gone silent. Drawing the line at the bottom
    // would promise a target this list cannot deliver.
    expect(targetCutIndex([true, false, true], 5)).toBeNull();
    expect(targetCutIndex([], 3)).toBeNull();
  });

  it('never returns a line past the end of the list', () => {
    const restores = [true, false, true, true];
    for (let shortfall = 1; shortfall <= 3; shortfall++) {
      const cut = targetCutIndex(restores, shortfall);
      expect(cut).not.toBeNull();
      expect(cut!).toBeLessThanOrEqual(restores.length);
    }
  });
});
