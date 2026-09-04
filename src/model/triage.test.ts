import { describe, expect, it } from 'vitest';
import type { StationInfo, StationStatus } from '../data/gbfs';
import type { StationCategory } from './score';
import { DEFAULT_P90_CAPACITY, scoreStation } from './score';
import { QUIET_CATEGORIES, VEHICLE_CATEGORIES, laneOf } from './triage';

const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const MINUTE = 60_000;

/**
 * Lane assignment never reads the score, only the classification and the
 * staleness flag, so capacity is pinned at the neutral value to make it obvious
 * that nothing here depends on the magnitude of the number.
 */
const NEUTRAL_CAPACITY = DEFAULT_P90_CAPACITY / 2;

function info(over: Partial<StationInfo> = {}): StationInfo {
  return {
    stationId: 'S1',
    name: 'Test St & Test Ave',
    shortName: '0000.00',
    lat: 40.75,
    lon: -73.98,
    capacity: NEUTRAL_CAPACITY,
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

const breakdown = (i: Partial<StationInfo>, s: Partial<StationStatus>, now = NOW) =>
  scoreStation(info(i), status(s), now);

const lane = (s: Partial<StationStatus>, i: Partial<StationInfo> = {}) =>
  laneOf(breakdown(i, s));

const STALE = { lastReportedMs: NOW - 61 * MINUTE };

describe('lane assignment', () => {
  it('sends an unscored station to quiet', () => {
    const b = breakdown({}, { isInstalled: false, bikesAvailable: 0, docksAvailable: 0 });
    expect(b.scored).toBe(false);
    expect(laneOf(b)).toBe('quiet');
  });

  it('sends a not-reporting station to unverified', () => {
    const b = breakdown({}, { bikesAvailable: 0, docksAvailable: 20, ...STALE });
    expect(b.staleness.notReporting).toBe(true);
    expect(laneOf(b)).toBe('unverified');
  });

  it('sends a never-reported station to unverified too', () => {
    const b = breakdown({}, { bikesAvailable: 0, docksAvailable: 20, lastReportedMs: null });
    expect(b.staleness.reason).toBe('never-reported');
    expect(laneOf(b)).toBe('unverified');
  });

  it('sends an outage signal to the mechanic', () => {
    const b = breakdown({}, { isRenting: false, bikesAvailable: 8 });
    expect(b.category).toBe('outage');
    expect(laneOf(b)).toBe('mechanic');
  });

  it('sends an unusable station to the mechanic, not a vehicle', () => {
    // Unusable is a distinct category but shares the outage signal: both are
    // mechanical failures, and a vehicle full of bikes cannot fix either.
    const b = breakdown({}, { isRenting: false, isReturning: false });
    expect(b.category).toBe('unusable');
    expect(b.signal).toBe('outage');
    expect(laneOf(b)).toBe('mechanic');
  });

  it('sends a healthy station to quiet', () => {
    const b = breakdown({}, { bikesAvailable: 10, docksAvailable: 10 });
    expect(b.category).toBe('healthy');
    expect(laneOf(b)).toBe('quiet');
  });

  it('sends a healthy station to quiet even when it has drifted', () => {
    const b = breakdown({}, { bikesAvailable: 7, docksAvailable: 13 });
    expect(b.category).toBe('healthy');
    expect(laneOf(b)).toBe('quiet');
  });

  it('sends every supply problem to the vehicle', () => {
    expect(lane({ bikesAvailable: 0, docksAvailable: 20 })).toBe('vehicle'); // empty
    expect(lane({ bikesAvailable: 20, docksAvailable: 0 })).toBe('vehicle'); // full
    expect(lane({ bikesAvailable: 3, docksAvailable: 17 })).toBe('vehicle'); // starving
    expect(lane({ bikesAvailable: 17, docksAvailable: 3 })).toBe('vehicle'); // flooded
  });

  it('sends a below-threshold starving station to the vehicle lane anyway', () => {
    // Lane answers "who can fix it", not "do we go now". A starving station
    // scoring 45 is still a vehicle's job; the verdict is what holds it back.
    const b = breakdown({}, { bikesAvailable: 3, docksAvailable: 17 });
    expect(b.needsVehicle).toBe(false);
    expect(laneOf(b)).toBe('vehicle');
  });
});

describe('lane precedence', () => {
  it('routes a stale outage to unverified, not to the mechanic', () => {
    // The outage verdict is derived from counts we have already admitted are
    // worthless, so dispatching a technician on it is dispatching on nothing.
    const b = breakdown({}, { isRenting: false, bikesAvailable: 8, ...STALE });
    expect(b.signal).toBe('outage');
    expect(b.staleness.notReporting).toBe(true);
    expect(laneOf(b)).toBe('unverified');
  });

  it('routes a stale unusable station to unverified, not to the mechanic', () => {
    const b = breakdown({}, { isRenting: false, isReturning: false, ...STALE });
    expect(b.category).toBe('unusable');
    expect(b.staleness.notReporting).toBe(true);
    expect(laneOf(b)).toBe('unverified');
  });

  it('routes a stale empty station to unverified, not to the vehicle', () => {
    const b = breakdown({}, { bikesAvailable: 0, docksAvailable: 20, ...STALE });
    expect(b.category).toBe('empty');
    expect(laneOf(b)).toBe('unverified');
  });

  it('keeps a stale healthy station out of the queue as unverified', () => {
    const b = breakdown({}, { bikesAvailable: 10, docksAvailable: 10, ...STALE });
    expect(b.category).toBe('healthy');
    expect(laneOf(b)).toBe('unverified');
  });

  it('keeps a never-reported, not-installed station quiet', () => {
    // Unscored outranks staleness: there is nothing to go and verify.
    const b = breakdown(
      {},
      { isInstalled: false, bikesAvailable: 0, docksAvailable: 0, lastReportedMs: null },
    );
    expect(b.staleness.notReporting).toBe(true);
    expect(laneOf(b)).toBe('quiet');
  });

  it('still charges staleness at 60 minutes without changing the lane', () => {
    const b = breakdown({}, { bikesAvailable: 0, docksAvailable: 20, lastReportedMs: NOW - 60 * MINUTE });
    expect(b.staleness.penalty).toBeGreaterThan(0);
    expect(b.staleness.notReporting).toBe(false);
    expect(laneOf(b)).toBe('vehicle');
  });
});

describe('lane constants agree with laneOf', () => {
  const CASES: Record<StationCategory, Partial<StationStatus>> = {
    unusable: { isRenting: false, isReturning: false },
    outage: { isRenting: false, bikesAvailable: 8 },
    empty: { bikesAvailable: 0, docksAvailable: 20 },
    full: { bikesAvailable: 20, docksAvailable: 0 },
    starving: { bikesAvailable: 3, docksAvailable: 17 },
    flooded: { bikesAvailable: 17, docksAvailable: 3 },
    healthy: { bikesAvailable: 10, docksAvailable: 10 },
    not_installed: { isInstalled: false, bikesAvailable: 0, docksAvailable: 0 },
  };

  it('routes every VEHICLE_CATEGORY to the vehicle lane', () => {
    for (const category of VEHICLE_CATEGORIES) {
      const b = breakdown({}, CASES[category]);
      expect(b.category).toBe(category);
      expect(laneOf(b)).toBe('vehicle');
    }
  });

  it('routes every QUIET_CATEGORY to the quiet lane', () => {
    for (const category of QUIET_CATEGORIES) {
      const b = breakdown({}, CASES[category]);
      expect(b.category).toBe(category);
      expect(laneOf(b)).toBe('quiet');
    }
  });
});
