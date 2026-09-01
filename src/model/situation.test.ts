import { describe, expect, it } from 'vitest';
import type { JoinedStation } from '../data/gbfs';
import type { Duration } from '../data/duration';
import type { HardwareTotals } from '../data/hardware';
import { CRITICAL_THRESHOLD } from './score';
import { scoreNetwork, summarize } from './summary';
import { triage } from './triage';
import type { Track } from './verify';
import { assessSituation, type SituationInput } from './situation';

const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const P90 = 54;
let seq = 0;

function station(over: Partial<{
  bikes: number;
  docks: number;
  capacity: number;
  name: string;
  borough: string;
  renting: boolean;
  returning: boolean;
  ageMin: number;
}> = {}): JoinedStation {
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
    capacity: over.capacity ?? 30,
    regionId: '71',
    borough: (over.borough ?? 'Manhattan') as JoinedStation['borough'],
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
      isRenting: over.renting ?? true,
      isReturning: over.returning ?? true,
      lastReportedMs: NOW - (over.ageMin ?? 1) * 60_000,
    },
  };
}

const EMPTY = () => station({ bikes: 0, docks: 40 });
const HEALTHY = () => station({ bikes: 15, docks: 15 });
const BROKEN = () => station({ renting: false, returning: false });
const DARK = () => station({ bikes: 0, docks: 40, capacity: 40, ageMin: 180 });

const NO_HARDWARE: HardwareTotals = {
  stations: 0,
  deadDocks: 0,
  brokenBikes: 0,
  lowCharge: 0,
  crippled: 0,
  siteFaults: 0,
};

function input(stations: JoinedStation[], over: Partial<SituationInput> = {}): SituationInput {
  const scored = scoreNetwork(stations, NOW, P90);
  const lanes = triage(scored);
  return {
    phase: 'ready',
    summary: summarize(scored, lanes),
    lanes,
    networkDocks: stations.reduce((n, s) => n + s.capacity, 0),
    hardware: NO_HARDWARE,
    tracks: null,
    durations: new Map(),
    activeRunIds: new Set(),
    raisedFaultIds: new Set(),
    ...over,
  };
}

/** A session track + matching duration entry for one truck-lane station. */
function stuckTrack(
  s: JoinedStation,
  opts: { score: number; minutes: number; delta?: number; confident?: boolean },
): { track: Track; duration: Duration } {
  const failingSince = NOW - opts.minutes * 60_000;
  return {
    track: {
      stationId: s.stationId,
      name: s.name,
      borough: s.borough,
      readings: [],
      scores: [opts.score],
      firstScore: opts.score - (opts.delta ?? 0),
      currentScore: opts.score,
      delta: opts.delta ?? 0,
      signal: 'empty',
      category: 'empty',
      outcome: (opts.delta ?? 0) > 5 ? 'worsened' : 'still-failing',
      firstSeen: failingSince,
      lastSeen: NOW,
    },
    duration: {
      failingSince,
      minutes: opts.minutes,
      points: 0,
      confident: opts.confident ?? true,
    },
  };
}

describe('assessSituation — severity ranking', () => {
  it('is loading before the first poll resolves', () => {
    expect(assessSituation(input([], { phase: 'loading' })).kind).toBe('loading');
  });

  it('is clear when nothing needs a truck', () => {
    const s = assessSituation(input([HEALTHY(), HEALTHY()]));
    expect(s.kind).toBe('clear');
  });

  it('falls back to the worst station when there is only routine truck work', () => {
    const s = assessSituation(input([EMPTY(), EMPTY(), HEALTHY()]));
    expect(s.kind).toBe('worst');
  });

  it('an unraised out-of-service station outranks routine truck work', () => {
    const s = assessSituation(input([EMPTY(), EMPTY(), BROKEN()]));
    expect(s.kind).toBe('faults-unraised');
  });

  it('a raised fault does not headline', () => {
    const stations = [EMPTY(), EMPTY(), BROKEN()];
    const scored = scoreNetwork(stations, NOW, P90);
    const brokenId = triage(scored).mechanic[0]!.station.stationId;
    const s = assessSituation(
      input(stations, { raisedFaultIds: new Set([brokenId]) }),
    );
    expect(s.kind).toBe('worst');
  });

  it('hardware failing at scale outranks an unraised fault', () => {
    const stations = [EMPTY(), BROKEN()];
    const s = assessSituation(
      input(stations, {
        hardware: { ...NO_HARDWARE, deadDocks: 999, brokenBikes: 40, crippled: 4 },
      }),
    );
    expect(s.kind).toBe('hardware-crippled');
  });

  it('a neglected critical station outranks hardware at scale', () => {
    const crit = station({ bikes: 0, docks: 60, capacity: 60 });
    const { track, duration } = stuckTrack(crit, { score: 92, minutes: 130, delta: 9 });
    const s = assessSituation(
      input([crit, EMPTY()], {
        hardware: { ...NO_HARDWARE, deadDocks: 999, crippled: 20 },
        tracks: [track],
        durations: new Map([[crit.stationId, duration]]),
      }),
    );
    expect(s.kind).toBe('critical-stuck');
    if (s.kind === 'critical-stuck') {
      expect(s.name).toBe(crit.name);
      expect(s.minutes).toBe(130);
    }
  });

  it('the blind-board alarm outranks everything else', () => {
    const dark = Array.from({ length: 10 }, () => DARK());
    const crit = station({ bikes: 0, docks: 60, capacity: 60 });
    const { track, duration } = stuckTrack(crit, { score: 92, minutes: 130 });
    const s = assessSituation(
      input([...dark, crit, EMPTY()], {
        tracks: [track],
        durations: new Map([[crit.stationId, duration]]),
      }),
    );
    expect(s.kind).toBe('blind');
  });
});

describe('assessSituation — critical-stuck gates', () => {
  const crit = () => station({ bikes: 0, docks: 60, capacity: 60 });

  it('ignores a stuck station whose score is below critical', () => {
    const c = crit();
    const { track, duration } = stuckTrack(c, { score: CRITICAL_THRESHOLD - 5, minutes: 200 });
    const s = assessSituation(
      input([c, EMPTY()], { tracks: [track], durations: new Map([[c.stationId, duration]]) }),
    );
    expect(s.kind).not.toBe('critical-stuck');
  });

  it('ignores a stuck station whose duration is not yet confident', () => {
    const c = crit();
    const { track, duration } = stuckTrack(c, { score: 90, minutes: 130, confident: false });
    const s = assessSituation(
      input([c, EMPTY()], { tracks: [track], durations: new Map([[c.stationId, duration]]) }),
    );
    expect(s.kind).not.toBe('critical-stuck');
  });

  it('ignores a stuck station that already has a truck on the way', () => {
    const c = crit();
    const { track, duration } = stuckTrack(c, { score: 90, minutes: 130 });
    const s = assessSituation(
      input([c, EMPTY()], {
        tracks: [track],
        durations: new Map([[c.stationId, duration]]),
        activeRunIds: new Set([c.stationId]),
      }),
    );
    expect(s.kind).not.toBe('critical-stuck');
  });

  it('ignores a stuck station that has not been failing long enough', () => {
    const c = crit();
    const { track, duration } = stuckTrack(c, { score: 90, minutes: 40 });
    const s = assessSituation(
      input([c, EMPTY()], { tracks: [track], durations: new Map([[c.stationId, duration]]) }),
    );
    expect(s.kind).not.toBe('critical-stuck');
  });
});
