import { describe, expect, it } from 'vitest';
import type { StationStatus } from '../data/gbfs';
import { LOW_CHARGE, bikesAt, docksAt, summarize, summarizeDocks } from './fleet';

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);

function status(over: Partial<StationStatus> & { stationId?: string } = {}): StationStatus {
  return {
    stationId: over.stationId ?? 's1',
    bikesAvailable: over.bikesAvailable ?? 12,
    ebikesAvailable: over.ebikesAvailable ?? 3,
    docksAvailable: over.docksAvailable ?? 8,
    bikesDisabled: over.bikesDisabled ?? 2,
    docksDisabled: over.docksDisabled ?? 1,
    isInstalled: true,
    isRenting: true,
    isReturning: true,
    lastReportedMs: over.lastReportedMs ?? NOW - 60_000,
  };
}

describe('simulated fleet', () => {
  // The whole justification for inventing bikes at all: the invented set is
  // sized by the feed. If these drift, the simulation contradicts the one
  // source of truth it has.
  describe('reconciles with the feed', () => {
    // GBFS defines available and disabled as disjoint — a station reporting 12
    // available and 2 disabled has fourteen bikes on the rack. Treating
    // disabled as a subset silently loses every broken bike in the network,
    // which are exactly the machines a mechanic is sent for.
    it('puts both available and disabled bikes on the rack', () => {
      const bikes = bikesAt(status({ bikesAvailable: 12, bikesDisabled: 2 }), NOW);
      expect(bikes).toHaveLength(14);
      expect(bikes.filter((b) => b.condition === 'ok')).toHaveLength(12);
      expect(bikes.filter((b) => b.condition !== 'ok')).toHaveLength(2);
    });

    it('produces exactly the reported number of available electric bikes', () => {
      const bikes = bikesAt(
        status({ bikesAvailable: 12, ebikesAvailable: 3, bikesDisabled: 0 }),
        NOW,
      );
      expect(bikes.filter((b) => b.kind === 'electric')).toHaveLength(3);
      expect(bikes.filter((b) => b.kind === 'classic')).toHaveLength(9);
    });

    it('builds a dock strip covering every dock the feed accounts for', () => {
      const docks = docksAt(
        status({ bikesAvailable: 12, bikesDisabled: 2, docksAvailable: 8, docksDisabled: 1 }),
      );
      expect(docks).toHaveLength(23);
      expect(docks.filter((d) => d.state === 'occupied')).toHaveLength(14);
      expect(docks.filter((d) => d.state === 'free')).toHaveLength(8);
      expect(docks.filter((d) => d.state === 'out-of-service')).toHaveLength(1);
    });

    it('numbers docks contiguously from one', () => {
      const docks = docksAt(status());
      expect(docks.map((d) => d.index)).toEqual(docks.map((_, i) => i + 1));
    });

    it('survives negative counts without producing negative fleets', () => {
      expect(bikesAt(status({ bikesAvailable: -5, bikesDisabled: 0 }), NOW)).toHaveLength(0);

      const bikes = bikesAt(status({ bikesAvailable: 4, ebikesAvailable: -2 }), NOW);
      expect(bikes.filter((b) => b.condition === 'ok')).toHaveLength(4);

      // Negative dock counts clamp to zero, leaving only the positions the
      // bikes occupy — 12 available + 2 disabled on the default fixture.
      const docks = docksAt(status({ docksAvailable: -3, docksDisabled: -1 }));
      expect(docks).toHaveLength(14);
      expect(docks.every((d) => d.state === 'occupied')).toBe(true);
    });

    it('clamps an e-bike count that exceeds the bikes present', () => {
      const bikes = bikesAt(status({ bikesAvailable: 3, ebikesAvailable: 99, bikesDisabled: 0 }), NOW);
      expect(bikes.filter((b) => b.kind === 'electric')).toHaveLength(3);
    });

    it('handles an empty station', () => {
      const empty = status({ bikesAvailable: 0, bikesDisabled: 0, ebikesAvailable: 0 });
      expect(bikesAt(empty, NOW)).toHaveLength(0);
      expect(summarize(bikesAt(empty, NOW), 's1').meanCharge).toBeNull();
    });
  });

  describe('faults', () => {
    it('gives every broken bike a reason and every working one none', () => {
      const bikes = bikesAt(status({ bikesAvailable: 10, bikesDisabled: 6 }), NOW);
      for (const b of bikes) {
        if (b.condition === 'ok') expect(b.fault).toBeNull();
        else expect(b.fault).not.toBeNull();
      }
    });

    // A classic bike has no battery to fault.
    it('never gives a classic bike a battery fault', () => {
      for (let i = 0; i < 40; i += 1) {
        const bikes = bikesAt(
          status({ stationId: `s${i}`, bikesAvailable: 2, bikesDisabled: 8, ebikesAvailable: 0 }),
          NOW,
        );
        for (const b of bikes) {
          if (b.kind === 'classic') expect(b.fault).not.toBe('battery-fault');
        }
      }
    });

    it('gives every dead dock a fault and every live one none', () => {
      const docks = docksAt(status({ docksDisabled: 5 }));
      for (const d of docks) {
        if (d.state === 'out-of-service') expect(d.fault).not.toBeNull();
        else expect(d.fault).toBeNull();
      }
    });
  });

  // A fleet that reshuffles every 60s poll cannot be tracked or assigned.
  describe('is stable across polls', () => {
    it('returns the same frame numbers for the same station', () => {
      const a = bikesAt(status(), NOW).map((b) => b.id);
      const b = bikesAt(status(), NOW + 60_000).map((b) => b.id);
      expect(a).toEqual(b);
    });

    it('keeps dock faults stable across calls', () => {
      const a = docksAt(status({ docksDisabled: 4 })).map((d) => d.fault);
      const b = docksAt(status({ docksDisabled: 4 })).map((d) => d.fault);
      expect(a).toEqual(b);
    });

    it('gives different stations different bikes', () => {
      const a = bikesAt(status({ stationId: 'alpha' }), NOW).map((b) => b.id);
      const b = bikesAt(status({ stationId: 'bravo' }), NOW).map((b) => b.id);
      expect(a).not.toEqual(b);
    });

    it('does not hand adjacent docks near-identical frame numbers', () => {
      const ids = bikesAt(status({ bikesAvailable: 8, bikesDisabled: 0 }), NOW).map((b) =>
        Number(b.id.slice(1)),
      );
      const gaps = ids.slice(1).map((n, i) => Math.abs(n - (ids[i] ?? 0)));
      expect(Math.min(...gaps)).toBeGreaterThan(100);
    });
  });

  describe('charge', () => {
    it('gives electric bikes a charge and classics none', () => {
      for (const b of bikesAt(status({ bikesAvailable: 6, ebikesAvailable: 2 }), NOW)) {
        if (b.kind === 'electric') expect(b.charge).toBeGreaterThan(0);
        else expect(b.charge).toBeNull();
      }
    });

    it('stays within 2–100 after an implausibly long standing time', () => {
      for (const b of bikesAt(status({ lastReportedMs: NOW - 400 * 3_600_000 }), NOW)) {
        if (b.charge === null) continue;
        expect(b.charge).toBeGreaterThanOrEqual(2);
        expect(b.charge).toBeLessThanOrEqual(100);
      }
    });

    it('treats a station with no timestamp as standing for no time', () => {
      // A missing timestamp is an absence of evidence; draining a battery to 2%
      // on the strength of it would be an invented fact dressed as a measurement.
      const noStamp = bikesAt(status({ lastReportedMs: null }), NOW);
      const justNow = bikesAt(status({ lastReportedMs: NOW }), NOW);
      expect(noStamp.map((b) => b.charge)).toEqual(justNow.map((b) => b.charge));
    });
  });

  describe('summaries', () => {
    it('counts low charge among rideable bikes only', () => {
      const bikes = bikesAt(status({ bikesAvailable: 12, ebikesAvailable: 4, bikesDisabled: 4 }), NOW);
      const s = summarize(bikes, 's1');
      const expected = bikes.filter(
        (b) => b.condition === 'ok' && b.kind === 'electric' && (b.charge ?? 100) < LOW_CHARGE,
      ).length;
      expect(s.lowCharge).toBe(expected);
    });

    it('adds up to the rack it was given', () => {
      const bikes = bikesAt(status({ bikesAvailable: 12, ebikesAvailable: 3, bikesDisabled: 4 }), NOW);
      const s = summarize(bikes, 's1');
      expect(s.electric + s.classic).toBe(s.total);
      expect(s.rideable + s.flagged + s.outOfService).toBe(s.total);
      expect(s.total).toBe(16);
    });

    it('agrees with itself about whether a station is grid-connected', () => {
      const a = summarize(bikesAt(status({ stationId: 'x' }), NOW), 'x').gridConnected;
      const b = summarize(bikesAt(status({ stationId: 'x' }), NOW + 9_999), 'x').gridConnected;
      expect(a).toBe(b);
    });

    it('rolls dock faults up largest first and separates site failures', () => {
      const s = summarizeDocks(docksAt(status({ stationId: 'z', docksDisabled: 12 })));
      expect(s.dead).toBe(12);
      const summed = s.byFault.reduce((n, f) => n + f.count, 0);
      expect(summed).toBe(12);
      for (let i = 1; i < s.byFault.length; i += 1) {
        expect(s.byFault[i - 1]!.count).toBeGreaterThanOrEqual(s.byFault[i]!.count);
      }
      expect(s.siteFaults).toBeLessThanOrEqual(s.dead);
    });

    it('adds up the dock strip', () => {
      const s = summarizeDocks(docksAt(status()));
      expect(s.free + s.occupied + s.dead).toBe(s.total);
    });
  });
});
