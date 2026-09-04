import { describe, expect, it } from 'vitest';
import type { StationInfo, StationStatus } from '../data/gbfs';
import {
  BASE_EMPTY,
  BASE_FLOODED,
  BASE_FULL,
  BASE_OUTAGE,
  BASE_STARVING,
  BASE_UNUSABLE,
  CAPACITY_WEIGHT_CAP,
  CAPACITY_WEIGHT_FLOOR,
  DEFAULT_P90_CAPACITY,
  HEALTHY_MAX_BASE,
  NEEDS_VEHICLE_THRESHOLD,
  STALENESS_MAX_PENALTY,
  scoreStation,
} from './score';

const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const MINUTE = 60_000;

/**
 * Capacity 27 against the default p90 of 54 gives a capacity weight of exactly
 * 1.0, so tests that are about classification can read the base score straight
 * off the final score without the modifier in the way.
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

const score = (i: Partial<StationInfo>, s: Partial<StationStatus>, now = NOW) =>
  scoreStation(info(i), status(s), now);

describe('classification priority', () => {
  it('excludes not-installed stations from scoring', () => {
    const r = score({}, { isInstalled: false, bikesAvailable: 0, docksAvailable: 0 });
    expect(r.category).toBe('not_installed');
    expect(r.scored).toBe(false);
    expect(r.score).toBe(0);
    expect(r.needsVehicle).toBe(false);
  });

  it('ranks neither-renting-nor-returning as unusable', () => {
    const r = score({}, { isRenting: false, isReturning: false });
    expect(r.category).toBe('unusable');
    expect(r.base).toBe(BASE_UNUSABLE);
  });

  it('ranks zero bikes AND zero docks as unusable, not merely empty', () => {
    const r = score({}, { bikesAvailable: 0, docksAvailable: 0 });
    expect(r.category).toBe('unusable');
    expect(r.base).toBe(BASE_UNUSABLE);
    expect(r.fill.ratio).toBeNull();
  });

  it('ranks a rental outage with bikes present as an outage', () => {
    const r = score({}, { isRenting: false, bikesAvailable: 8 });
    expect(r.category).toBe('outage');
    expect(r.base).toBe(BASE_OUTAGE);
  });

  it('ranks a return outage as an outage', () => {
    const r = score({}, { isReturning: false });
    expect(r.category).toBe('outage');
    expect(r.base).toBe(BASE_OUTAGE);
  });

  it('does not double-count closed rentals at a station with no bikes', () => {
    // Rentals closed AND no bikes, but returns still work. The outage rule
    // requires bikes to be "theoretically present" precisely so this reads as
    // Empty rather than being promoted to Outage: with nothing to rent, the
    // closed-rental flag tells a dispatcher nothing the empty count did not.
    const r = score({}, { isRenting: false, bikesAvailable: 0, docksAvailable: 12 });
    expect(r.category).toBe('empty');
    expect(r.base).toBe(BASE_EMPTY);
  });

  it('promotes to unusable once returns are closed too', () => {
    const r = score({}, { isRenting: false, isReturning: false, bikesAvailable: 0, docksAvailable: 12 });
    expect(r.category).toBe('unusable');
  });
});

describe('boundary: exactly 0 bikes', () => {
  it('is Empty at base 70 with docks still open', () => {
    const r = score({}, { bikesAvailable: 0, docksAvailable: 20 });
    expect(r.category).toBe('empty');
    expect(r.base).toBe(BASE_EMPTY);
    expect(r.fill.ratio).toBe(0);
    expect(r.score).toBe(BASE_EMPTY); // capacity weight is exactly 1.0
    expect(r.needsVehicle).toBe(true);
  });

  it('is Full at base 70 with exactly 0 open docks', () => {
    const r = score({}, { bikesAvailable: 20, docksAvailable: 0 });
    expect(r.category).toBe('full');
    expect(r.base).toBe(BASE_FULL);
    expect(r.fill.ratio).toBe(1);
    expect(r.signal).toBe('full');
  });

  it('gives empty and full opposite signals so the vehicle action differs', () => {
    expect(score({}, { bikesAvailable: 0, docksAvailable: 20 }).signal).toBe('empty');
    expect(score({}, { bikesAvailable: 20, docksAvailable: 0 }).signal).toBe('full');
  });
});

describe('boundary: exactly 15% fill', () => {
  it('is Starving at exactly base 45', () => {
    // 3 / (3 + 17) = 0.15 exactly
    const r = score({}, { bikesAvailable: 3, docksAvailable: 17 });
    expect(r.fill.ratio).toBeCloseTo(0.15, 10);
    expect(r.category).toBe('starving');
    expect(r.base).toBe(BASE_STARVING);
    expect(r.needsVehicle).toBe(false); // 45 is below the 55 threshold
  });

  it('is Healthy just above 15% fill', () => {
    // 4 / (4 + 21) = 0.16
    const r = score({}, { bikesAvailable: 4, docksAvailable: 21 });
    expect(r.category).toBe('healthy');
    expect(r.base).toBeLessThan(HEALTHY_MAX_BASE);
  });

  it('ramps starving continuously toward the empty base as bikes run out', () => {
    const at15 = score({}, { bikesAvailable: 3, docksAvailable: 17 }).base;
    const at7 = score({}, { bikesAvailable: 7, docksAvailable: 93 }).base; // 7%
    const at1 = score({}, { bikesAvailable: 1, docksAvailable: 99 }).base; // 1%
    expect(at15).toBe(BASE_STARVING);
    expect(at7).toBeGreaterThan(at15);
    expect(at1).toBeGreaterThan(at7);
    expect(at1).toBeLessThan(BASE_EMPTY);
    // The ramp must approach BASE_EMPTY, not jump to it.
    expect(at1).toBeGreaterThan(BASE_EMPTY - 5);
  });

  it('is Flooded at exactly 85% fill with base 45', () => {
    // 17 / (17 + 3) = 0.85 exactly
    const r = score({}, { bikesAvailable: 17, docksAvailable: 3 });
    expect(r.fill.ratio).toBeCloseTo(0.85, 10);
    expect(r.category).toBe('flooded');
    expect(r.base).toBe(BASE_FLOODED);
  });

  it('ramps flooded continuously toward the full base', () => {
    const at85 = score({}, { bikesAvailable: 17, docksAvailable: 3 }).base;
    const at99 = score({}, { bikesAvailable: 99, docksAvailable: 1 }).base;
    expect(at85).toBe(BASE_FLOODED);
    expect(at99).toBeGreaterThan(at85);
    expect(at99).toBeLessThan(BASE_FULL);
  });

  it('scores a perfectly balanced station at zero', () => {
    const r = score({}, { bikesAvailable: 10, docksAvailable: 10 });
    expect(r.category).toBe('healthy');
    expect(r.base).toBe(0);
    expect(r.score).toBe(0);
  });

  it('scores healthy drift symmetrically either side of 50%', () => {
    const low = score({}, { bikesAvailable: 30, docksAvailable: 70 });
    const high = score({}, { bikesAvailable: 70, docksAvailable: 30 });
    expect(low.base).toBeCloseTo(high.base, 6);
    expect(low.signal).toBe('ok');
  });
});

describe('capacity weight', () => {
  it('applies the floor to the smallest stations', () => {
    const r = score({ capacity: 0 }, { bikesAvailable: 0, docksAvailable: 10 });
    expect(r.capacity.weight).toBe(CAPACITY_WEIGHT_FLOOR);
    expect(r.score).toBe(Math.round(BASE_EMPTY * CAPACITY_WEIGHT_FLOOR));
  });

  it('caps the weight so huge stations cannot own the queue', () => {
    const r = score({ capacity: 200 }, { bikesAvailable: 0, docksAvailable: 10 });
    expect(r.capacity.weight).toBe(CAPACITY_WEIGHT_CAP);
    expect(r.capacity.capped).toBe(true);
  });

  it('reaches the cap exactly at the p90 capacity', () => {
    const r = score({ capacity: DEFAULT_P90_CAPACITY }, { bikesAvailable: 0, docksAvailable: 10 });
    expect(r.capacity.weight).toBe(CAPACITY_WEIGHT_CAP);
  });

  it('ranks a big empty station above an identical small one', () => {
    const big = score({ capacity: 60 }, { bikesAvailable: 0, docksAvailable: 10 });
    const small = score({ capacity: 12 }, { bikesAvailable: 0, docksAvailable: 10 });
    expect(big.score).toBeGreaterThan(small.score);
  });

  it('reports the contribution it actually made', () => {
    const r = score({ capacity: 54 }, { bikesAvailable: 0, docksAvailable: 10 });
    expect(r.capacity.contribution).toBeCloseTo(BASE_EMPTY * CAPACITY_WEIGHT_CAP - BASE_EMPTY, 1);
  });
});

describe('boundary: staleness at 14 / 16 / 61 minutes', () => {
  const empty = { bikesAvailable: 0, docksAvailable: 20 };

  it('charges nothing at 14 minutes', () => {
    const r = score({}, { ...empty, lastReportedMs: NOW - 14 * MINUTE });
    expect(r.staleness.ageMinutes).toBe(14);
    expect(r.staleness.penalty).toBe(0);
    expect(r.staleness.notReporting).toBe(false);
    expect(r.staleness.reason).toBe('current');
    expect(r.score).toBe(BASE_EMPTY);
  });

  it('charges nothing at exactly 15 minutes', () => {
    const r = score({}, { ...empty, lastReportedMs: NOW - 15 * MINUTE });
    expect(r.staleness.penalty).toBe(0);
    expect(r.staleness.reason).toBe('current');
  });

  it('starts charging just past 15 minutes', () => {
    const r = score({}, { ...empty, lastReportedMs: NOW - 16 * MINUTE });
    expect(r.staleness.ageMinutes).toBe(16);
    expect(r.staleness.penalty).toBeGreaterThan(0);
    expect(r.staleness.penalty).toBeLessThan(1);
    expect(r.staleness.notReporting).toBe(false);
    expect(r.staleness.reason).toBe('aging');
  });

  it('reaches the full penalty at 60 minutes without flagging yet', () => {
    const r = score({}, { ...empty, lastReportedMs: NOW - 60 * MINUTE });
    expect(r.staleness.penalty).toBe(STALENESS_MAX_PENALTY);
    expect(r.staleness.notReporting).toBe(false);
  });

  it('marks not-reporting past 60 minutes and drops it from the vehicle count', () => {
    const r = score({}, { ...empty, lastReportedMs: NOW - 61 * MINUTE });
    expect(r.staleness.ageMinutes).toBe(61);
    expect(r.staleness.penalty).toBe(STALENESS_MAX_PENALTY);
    expect(r.staleness.notReporting).toBe(true);
    expect(r.staleness.reason).toBe('stale');
    // Still scored and shown, but never counted as needing a vehicle.
    expect(r.score).toBeGreaterThan(NEEDS_VEHICLE_THRESHOLD);
    expect(r.needsVehicle).toBe(false);
  });

  it('ramps linearly between the grace window and the cutoff', () => {
    const mid = score({}, { ...empty, lastReportedMs: NOW - 37.5 * MINUTE });
    expect(mid.staleness.penalty).toBeCloseTo(STALENESS_MAX_PENALTY / 2, 1);
  });

  it('treats a missing timestamp as full uncertainty, not as fresh', () => {
    const r = score({}, { ...empty, lastReportedMs: null });
    expect(r.staleness.ageMinutes).toBeNull();
    expect(r.staleness.penalty).toBe(STALENESS_MAX_PENALTY);
    expect(r.staleness.notReporting).toBe(true);
    expect(r.staleness.reason).toBe('never-reported');
    expect(r.needsVehicle).toBe(false);
  });

  it('treats clock skew from the future as just-now, never negative', () => {
    const r = score({}, { ...empty, lastReportedMs: NOW + 30_000 });
    expect(r.staleness.ageMinutes).toBe(0);
    expect(r.staleness.penalty).toBe(0);
  });
});

describe('needs-a-vehicle threshold', () => {
  it('is inclusive at exactly the threshold', () => {
    // Tune capacity so the final score lands exactly on 55.
    const target = NEEDS_VEHICLE_THRESHOLD / BASE_EMPTY; // required weight
    const capacity = ((target - CAPACITY_WEIGHT_FLOOR) / 0.5) * DEFAULT_P90_CAPACITY;
    const r = score({ capacity: Math.round(capacity) }, { bikesAvailable: 0, docksAvailable: 20 });
    expect(r.score).toBe(NEEDS_VEHICLE_THRESHOLD);
    expect(r.needsVehicle).toBe(true);
  });

  it('excludes a station one point below', () => {
    const r = score({ capacity: 12 }, { bikesAvailable: 2, docksAvailable: 18 });
    expect(r.score).toBeLessThan(NEEDS_VEHICLE_THRESHOLD);
    expect(r.needsVehicle).toBe(false);
  });
});

describe('breakdown is self-contained', () => {
  it('clamps and rounds the final score to a 0-100 integer', () => {
    const r = score({ capacity: 200 }, { isRenting: false, isReturning: false });
    expect(Number.isInteger(r.score)).toBe(true);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
    // 90 x 1.25 = 112.5, clamped to 100.
    expect(r.score).toBe(100);
  });

  it('accounts for the whole score in its factors', () => {
    const r = score({ capacity: 60 }, { bikesAvailable: 0, docksAvailable: 30, lastReportedMs: NOW - 30 * MINUTE });
    const sum = r.factors.reduce((n, f) => n + f.delta, 0);
    expect(sum).toBeCloseTo(r.score, 0);
  });

  it('orders factors by how much they moved the score', () => {
    const r = score({ capacity: 60 }, { bikesAvailable: 0, docksAvailable: 30, lastReportedMs: NOW - 45 * MINUTE });
    const magnitudes = r.factors.map((f) => Math.abs(f.delta));
    expect([...magnitudes].sort((a, b) => b - a)).toEqual(magnitudes);
    expect(r.factors[0]?.label).toBe('Empty');
  });

  it('carries every input needed to re-derive the score', () => {
    const r = score({ capacity: 40 }, { bikesAvailable: 2, docksAvailable: 18 });
    expect(r.fill).toEqual({ bikes: 2, docks: 18, usableSlots: 20, ratio: 0.1 });
    expect(r.capacity.capacity).toBe(40);
    expect(r.capacity.p90Capacity).toBe(DEFAULT_P90_CAPACITY);
    expect(r.baseRule).toBeTruthy();
    // The receipt must add up *exactly* as displayed: a dispatcher checking the
    // Explain screen by hand multiplies the printed base by the printed weight.
    expect(r.weighted).toBe(Math.round(r.base * r.capacity.weight * 10) / 10);
    expect(r.score).toBe(Math.round(r.weighted + r.staleness.penalty));
  });

  it('shows a receipt that reconciles for every station in a wide sweep', () => {
    for (let bikes = 0; bikes <= 40; bikes++) {
      for (const capacity of [0, 7, 27, 54, 120]) {
        for (const ageMin of [0, 14, 16, 40, 61]) {
          const r = score(
            { capacity },
            {
              bikesAvailable: bikes,
              docksAvailable: 40 - bikes,
              lastReportedMs: NOW - ageMin * MINUTE,
            },
          );
          expect(r.weighted).toBe(Math.round(r.base * r.capacity.weight * 10) / 10);
          expect(r.score).toBe(
            Math.min(100, Math.max(0, Math.round(r.weighted + r.staleness.penalty))),
          );
          const sum = r.factors.reduce((n, f) => n + f.delta, 0);
          expect(Math.abs(sum - (r.weighted + r.staleness.penalty))).toBeLessThan(0.051);
        }
      }
    }
  });

  it('is a pure function of its inputs', () => {
    const a = scoreStation(info(), status(), NOW);
    const b = scoreStation(info(), status(), NOW);
    expect(a).toEqual(b);
  });
});
