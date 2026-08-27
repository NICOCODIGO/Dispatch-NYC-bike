import { describe, expect, it } from 'vitest';
import type { StationStatus } from '../data/gbfs';
import { LOW_CHARGE, bikesAt, summarize } from './fleet';

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);

function status(over: Partial<StationStatus> & { stationId?: string } = {}): StationStatus {
  return {
    stationId: over.stationId ?? 's1',
    bikesAvailable: over.bikesAvailable ?? 12,
    ebikesAvailable: over.ebikesAvailable ?? 3,
    docksAvailable: over.docksAvailable ?? 8,
    bikesDisabled: over.bikesDisabled ?? 2,
    docksDisabled: over.docksDisabled ?? 0,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
    lastReportedMs: over.lastReportedMs ?? NOW - 60_000,
  };
}

describe('simulated fleet', () => {
  // The whole justification for inventing bikes at all: the invented set is
  // sized by the feed. If these drift, the simulation is contradicting the one
  // source of truth it has.
  describe('reconciles with the feed', () => {
    it('produces exactly as many bikes as the station reports available', () => {
      expect(bikesAt(status({ bikesAvailable: 12 }), NOW)).toHaveLength(12);
      expect(bikesAt(status({ bikesAvailable: 0 }), NOW)).toHaveLength(0);
    });

    it('produces exactly the reported number of electric bikes', () => {
      const bikes = bikesAt(status({ bikesAvailable: 12, ebikesAvailable: 3 }), NOW);
      expect(bikes.filter((b) => b.kind === 'electric')).toHaveLength(3);
      expect(bikes.filter((b) => b.kind === 'classic')).toHaveLength(9);
    });

    it('flags exactly the reported number of disabled bikes', () => {
      const bikes = bikesAt(status({ bikesAvailable: 12, bikesDisabled: 2 }), NOW);
      expect(bikes.filter((b) => b.condition !== 'ok')).toHaveLength(2);
    });

    it('never invents more bikes than are present, however the feed misbehaves', () => {
      // Both of these occur in the live feed: more disabled than available, and
      // an e-bike count exceeding the total.
      const overBroken = bikesAt(status({ bikesAvailable: 3, bikesDisabled: 99 }), NOW);
      expect(overBroken).toHaveLength(3);
      expect(overBroken.filter((b) => b.condition !== 'ok')).toHaveLength(3);

      const overElectric = bikesAt(status({ bikesAvailable: 3, ebikesAvailable: 99 }), NOW);
      expect(overElectric.filter((b) => b.kind === 'electric')).toHaveLength(3);
    });

    it('survives negative counts without producing negative fleets', () => {
      expect(bikesAt(status({ bikesAvailable: -5 }), NOW)).toHaveLength(0);
      expect(bikesAt(status({ bikesAvailable: 4, ebikesAvailable: -2 }), NOW)).toHaveLength(4);
    });
  });

  // A fleet that reshuffles every 60s poll cannot be tracked, assigned or
  // argued with — the identity has to outlive the refresh.
  describe('is stable across polls', () => {
    it('returns the same frame numbers for the same station', () => {
      const a = bikesAt(status(), NOW).map((b) => b.id);
      const b = bikesAt(status(), NOW + 60_000).map((b) => b.id);
      expect(a).toEqual(b);
    });

    it('gives different stations different bikes', () => {
      const a = bikesAt(status({ stationId: 'alpha' }), NOW).map((b) => b.id);
      const b = bikesAt(status({ stationId: 'bravo' }), NOW).map((b) => b.id);
      expect(a).not.toEqual(b);
    });

    it('does not hand adjacent docks near-identical frame numbers', () => {
      const ids = bikesAt(status({ bikesAvailable: 8 }), NOW).map((b) => Number(b.id.slice(1)));
      const gaps = ids.slice(1).map((n, i) => Math.abs(n - (ids[i] ?? 0)));
      // A weak hash would leave these clustered; every gap should be wide.
      expect(Math.min(...gaps)).toBeGreaterThan(100);
    });
  });

  describe('charge', () => {
    it('gives electric bikes a charge and classics none', () => {
      const bikes = bikesAt(status({ bikesAvailable: 6, ebikesAvailable: 2 }), NOW);
      for (const b of bikes) {
        if (b.kind === 'electric') expect(b.charge).toBeGreaterThan(0);
        else expect(b.charge).toBeNull();
      }
    });

    it('stays within 2–100 even after an implausibly long standing time', () => {
      const ancient = status({ lastReportedMs: NOW - 400 * 3_600_000 });
      for (const b of bikesAt(ancient, NOW)) {
        if (b.charge === null) continue;
        expect(b.charge).toBeGreaterThanOrEqual(2);
        expect(b.charge).toBeLessThanOrEqual(100);
      }
    });

    it('moves charge as standing time grows', () => {
      const fresh = bikesAt(status({ lastReportedMs: NOW - 60_000 }), NOW);
      const stale = bikesAt(status({ lastReportedMs: NOW - 20 * 3_600_000 }), NOW);
      const chargeOf = (bs: typeof fresh) => bs.find((b) => b.kind === 'electric')?.charge ?? null;
      expect(chargeOf(stale)).not.toEqual(chargeOf(fresh));
    });

    it('treats a station with no timestamp as standing for no time', () => {
      // Not as standing forever: a missing timestamp is an absence of evidence,
      // and draining a battery to 2% on the strength of it would be an invented
      // fact dressed as a measurement.
      const noStamp = bikesAt(status({ lastReportedMs: null }), NOW);
      const justNow = bikesAt(status({ lastReportedMs: NOW }), NOW);
      expect(noStamp.map((b) => b.charge)).toEqual(justNow.map((b) => b.charge));
    });
  });

  describe('summary', () => {
    it('counts low-charge electric bikes without counting scrapped ones', () => {
      const bikes = bikesAt(status({ bikesAvailable: 12, ebikesAvailable: 4 }), NOW);
      const s = summarize(bikes, 's1');
      const expected = bikes.filter(
        (b) => b.kind === 'electric' && b.condition !== 'out-of-service' && (b.charge ?? 100) < LOW_CHARGE,
      ).length;
      expect(s.lowCharge).toBe(expected);
    });

    it('reports no mean charge for an all-classic station rather than zero', () => {
      const s = summarize(bikesAt(status({ bikesAvailable: 5, ebikesAvailable: 0 }), NOW), 's1');
      expect(s.meanCharge).toBeNull();
      expect(s.electric).toBe(0);
      expect(s.classic).toBe(5);
    });

    it('adds up to the fleet it was given', () => {
      const bikes = bikesAt(status({ bikesAvailable: 12, ebikesAvailable: 3, bikesDisabled: 4 }), NOW);
      const s = summarize(bikes, 's1');
      expect(s.electric + s.classic).toBe(s.total);
      expect(s.flagged + s.outOfService).toBe(4);
    });

    it('agrees with itself about whether a station is grid-connected', () => {
      const a = summarize(bikesAt(status({ stationId: 'x' }), NOW), 'x').gridConnected;
      const b = summarize(bikesAt(status({ stationId: 'x' }), NOW + 9_999), 'x').gridConnected;
      expect(a).toBe(b);
    });
  });
});
