import { describe, expect, it } from 'vitest';
import type { Truck } from '../mock/data';
import type { ScoredStation } from '../model/summary';
import {
  FREE_SHORTLY_MINUTES,
  availabilityOf,
  bestMatch,
  formatFreeIn,
  groupFleet,
  openJobs,
  travelMinutes,
} from './fleet';

function truck(over: Partial<Truck> = {}): Truck {
  return {
    id: '#1',
    depot: 'E 18 St',
    state: 'idle',
    where: 'Depot',
    load: 0,
    capacity: 48,
    lat: 40.74,
    lon: -73.99,
    freeInMin: 0,
    ...over,
  };
}

/** A station needing `bikes` moved in `dir`, at a given distance-ish position. */
function station(
  id: string,
  dir: 'drop' | 'collect',
  bikes: number,
  score: number,
  lat = 40.74,
  lon = -73.99,
): ScoredStation {
  // drop  => empty signal, bikes below the midpoint
  // collect => full signal, bikes above it
  const usableSlots = 40;
  const target = 20;
  return {
    station: { stationId: id, name: `Station ${id}`, lat, lon, capacity: usableSlots },
    breakdown: {
      needsTruck: true,
      score,
      signal: dir === 'drop' ? 'empty' : 'full',
      fill: { bikes: dir === 'drop' ? target - bikes : target + bikes, usableSlots },
    },
  } as unknown as ScoredStation;
}

describe('availabilityOf', () => {
  it('is free-now only at zero', () => {
    expect(availabilityOf(0)).toBe('free-now');
    expect(availabilityOf(1)).toBe('free-shortly');
  });

  it('is free-shortly up to and including the cutoff', () => {
    expect(availabilityOf(FREE_SHORTLY_MINUTES)).toBe('free-shortly');
    expect(availabilityOf(FREE_SHORTLY_MINUTES + 1)).toBe('committed');
  });
});

describe('bestMatch — direction is a hard constraint', () => {
  /**
   * The failure this guards. An empty truck offered a "drop 30 bikes" job sends
   * somebody across the city to deliver nothing.
   */
  it('never offers an empty truck a drop job', () => {
    const jobs = openJobs([station('a', 'drop', 30, 90)], new Set());
    expect(bestMatch(truck({ load: 0 }), jobs)).toBeNull();
  });

  it('never offers a full truck a collect job', () => {
    const jobs = openJobs([station('a', 'collect', 30, 90)], new Set());
    expect(bestMatch(truck({ load: 48, capacity: 48 }), jobs)).toBeNull();
  });

  it('offers a loaded truck the drop job', () => {
    const jobs = openJobs([station('a', 'drop', 30, 90)], new Set());
    const m = bestMatch(truck({ load: 26 }), jobs);
    expect(m?.job.action.kind).toBe('drop');
    expect(m?.servable).toBe(26);
    expect(m?.complete).toBe(false);
  });

  it('marks a job complete when the truck can finish it in one visit', () => {
    const jobs = openJobs([station('a', 'drop', 20, 90)], new Set());
    const m = bestMatch(truck({ load: 26 }), jobs);
    expect(m?.complete).toBe(true);
    expect(m?.servable).toBe(20);
  });
});

describe('bestMatch — ranking', () => {
  it('prefers the worse station when distance is equal', () => {
    const jobs = openJobs(
      [station('near-mild', 'collect', 10, 60), station('near-bad', 'collect', 10, 88)],
      new Set(),
    );
    expect(bestMatch(truck(), jobs)?.job.station.station.stationId).toBe('near-bad');
  });

  it('prefers the nearer station when urgency is equal', () => {
    const jobs = openJobs(
      [
        station('far', 'collect', 10, 80, 40.85, -73.85),
        station('near', 'collect', 10, 80, 40.741, -73.991),
      ],
      new Set(),
    );
    expect(bestMatch(truck(), jobs)?.job.station.station.stationId).toBe('near');
  });
});

describe('openJobs', () => {
  it('skips stations already assigned to somebody', () => {
    const lane = [station('a', 'collect', 10, 90), station('b', 'collect', 10, 80)];
    expect(openJobs(lane, new Set(['a'])).map((j) => j.station.station.stationId)).toEqual(['b']);
  });
});

describe('groupFleet', () => {
  const lane = [
    station('a', 'collect', 10, 90),
    station('b', 'collect', 10, 88),
    station('c', 'collect', 10, 86),
  ];

  it('buckets trucks by when they can take work', () => {
    const g = groupFleet(
      [truck({ id: '#1', freeInMin: 0 }), truck({ id: '#2', freeInMin: 5 }), truck({ id: '#3', freeInMin: 90 })],
      (t) => t.freeInMin,
      openJobs(lane, new Set()),
    );
    expect(g['free-now'].map((r) => r.truck.id)).toEqual(['#1']);
    expect(g['free-shortly'].map((r) => r.truck.id)).toEqual(['#2']);
    expect(g.committed.map((r) => r.truck.id)).toEqual(['#3']);
  });

  it('never proposes the same station to two trucks', () => {
    const g = groupFleet(
      [truck({ id: '#1' }), truck({ id: '#2' }), truck({ id: '#3' })],
      (t) => t.freeInMin,
      openJobs(lane, new Set()),
    );
    const picked = g['free-now'].map((r) => r.match?.job.station.station.stationId);
    expect(new Set(picked).size).toBe(picked.length);
  });

  it('leaves committed trucks unmatched — there is nothing to decide', () => {
    const g = groupFleet([truck({ freeInMin: 90 })], (t) => t.freeInMin, openJobs(lane, new Set()));
    expect(g.committed[0]!.match).toBeNull();
  });
});

describe('formatting', () => {
  it('reads "now" at zero rather than "0 min"', () => {
    expect(formatFreeIn(0)).toBe('now');
    expect(formatFreeIn(-5)).toBe('now');
  });

  it('rolls over to hours', () => {
    expect(formatFreeIn(6)).toBe('~6 min');
    expect(formatFreeIn(59)).toBe('~59 min');
    expect(formatFreeIn(65)).toBe('~1h 05m');
  });

  it('never reports a zero-minute drive', () => {
    expect(travelMinutes(0)).toBe(1);
  });
});
