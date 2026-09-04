import { describe, expect, it } from 'vitest';
import type { StationInfo, StationStatus } from '../data/gbfs';
import type { Bike, BikeFault } from '../sim/fleet';
import { scoreStation } from './score';
import {
  HAZARD_FAULTS,
  applyTriage,
  awaitingTriage,
  faultTally,
  isHazard,
  pickupFor,
} from './pickup';

const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);

function info(over: Partial<StationInfo> = {}): StationInfo {
  return {
    stationId: 'S1',
    name: 'Test St & Test Ave',
    shortName: '0000.00',
    lat: 40.75,
    lon: -73.98,
    capacity: 27,
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
    lastReportedMs: NOW - 60_000,
    ...over,
  };
}

const breakdown = (over: Partial<StationStatus> = {}) =>
  scoreStation(info(), status(over), NOW);

/** A balanced station: docks are not scarce, so capacity never forces a pickup. */
const CALM = breakdown();
/** Zero open docks — the case where a dead bike is a blocked dock. */
const FULL = breakdown({ bikesAvailable: 20, docksAvailable: 0 });

let seq = 0;
function bike(condition: Bike['condition'], fault: BikeFault | null = null): Bike {
  seq += 1;
  return {
    id: `B${seq}`,
    kind: 'classic',
    charge: null,
    condition,
    fault,
    source: fault === null ? null : 'rider',
    dock: seq,
  };
}

const dead = (fault: BikeFault = 'flat-tyre') => bike('out-of-service', fault);
const reported = (fault: BikeFault = 'flat-tyre') => bike('flagged', fault);
const fine = () => bike('ok');

describe('isHazard', () => {
  it('treats brake and battery faults as hazards', () => {
    expect(isHazard('brakes')).toBe(true);
    expect(isHazard('battery-fault')).toBe(true);
  });

  it('leaves the rest routine', () => {
    for (const fault of ['flat-tyre', 'drivetrain', 'wheel', 'handlebars'] as BikeFault[]) {
      expect(isHazard(fault)).toBe(false);
    }
  });

  it('treats a working bike as no hazard at all', () => {
    expect(isHazard(null)).toBe(false);
  });

  it('agrees with the exported list', () => {
    for (const fault of HAZARD_FAULTS) expect(isHazard(fault)).toBe(true);
  });
});

describe('nothing to collect', () => {
  it('returns none for a rack of working bikes', () => {
    const r = pickupFor([fine(), fine(), fine()], CALM);
    expect(r.urgency).toBe('none');
    expect(r.load).toBe(0);
  });

  it('returns none for an empty rack', () => {
    expect(pickupFor([], CALM).urgency).toBe('none');
  });
});

describe('unconfirmed reports are not pickups', () => {
  it('counts a reported bike for inspection, not for loading', () => {
    // The rider pressed the button and the dock locked. That is not yet
    // evidence the bike is broken, and the field check often clears it.
    const r = pickupFor([reported(), reported()], CALM);
    expect(r.inspect).toBe(2);
    expect(r.load).toBe(0);
    expect(r.urgency).toBe('none');
  });

  it('does not let an unconfirmed hazard report force a collection', () => {
    const r = pickupFor([reported('brakes')], CALM);
    expect(r.hazards).toBe(0);
    expect(r.urgency).toBe('none');
  });

  it('reports both numbers when a rack has confirmed and unconfirmed bikes', () => {
    const r = pickupFor([dead(), reported(), reported()], CALM);
    expect(r.load).toBe(1);
    expect(r.inspect).toBe(2);
  });

  it('says why there is nothing to load when only reports are outstanding', () => {
    expect(pickupFor([reported()], CALM).reason).toMatch(/still to be checked/i);
  });
});

describe('hazards leave immediately', () => {
  it('pulls a confirmed brake fault from a calm station', () => {
    const r = pickupFor([dead('brakes')], CALM);
    expect(r.urgency).toBe('immediate');
    expect(r.hazards).toBe(1);
  });

  it('pulls a confirmed battery fault', () => {
    expect(pickupFor([dead('battery-fault')], CALM).urgency).toBe('immediate');
  });

  it('outranks dock pressure, and loads the whole rack either way', () => {
    const r = pickupFor([dead('brakes'), dead('flat-tyre')], FULL);
    expect(r.urgency).toBe('immediate');
    expect(r.load).toBe(2);
    expect(r.hazards).toBe(1);
    expect(r.reason).toMatch(/brake or battery/i);
  });
});

describe('a dead bike in a scarce dock', () => {
  it('is collected immediately when riders cannot return', () => {
    const r = pickupFor([dead('flat-tyre')], FULL);
    expect(r.urgency).toBe('immediate');
    expect(r.hazards).toBe(0);
    expect(r.reason).toMatch(/cannot return/i);
  });

  it('is routine at a station with docks to spare', () => {
    // Same bike, same fault. Only the station's dock pressure differs, which is
    // the whole distinction this branch exists to draw.
    expect(pickupFor([dead('flat-tyre')], CALM).urgency).toBe('routine');
  });

  it('applies to a flooded station, not only a completely full one', () => {
    const flooded = breakdown({ bikesAvailable: 17, docksAvailable: 3 });
    expect(flooded.signal).toBe('full');
    expect(pickupFor([dead('wheel')], flooded).urgency).toBe('immediate');
  });

  it('does not fire on the empty side, where docks are plentiful', () => {
    const empty = breakdown({ bikesAvailable: 0, docksAvailable: 20 });
    expect(empty.signal).toBe('empty');
    expect(pickupFor([dead('wheel')], empty).urgency).toBe('routine');
  });
});

describe('the routine sweep', () => {
  it('collects non-hazardous damage on the next circuit', () => {
    const r = pickupFor([dead('drivetrain'), dead('wheel')], CALM);
    expect(r.urgency).toBe('routine');
    expect(r.load).toBe(2);
    expect(r.reason).toMatch(/next scheduled sweep/i);
  });

  it('keeps loose handlebars routine', () => {
    // Documented judgement call: the dock lock already stops anyone riding it,
    // and it is the category riders most often misreport.
    expect(pickupFor([dead('handlebars')], CALM).urgency).toBe('routine');
  });
});

describe('triage', () => {
  it('releases the dock when the mechanic finds nothing', () => {
    const b = reported('brakes');
    const [out] = applyTriage([b], { [b.id]: 'no-fault' });
    // Indistinguishable from a bike nobody ever reported — that is what
    // releasing the latch back to green means.
    expect(out?.condition).toBe('ok');
    expect(out?.fault).toBeNull();
    expect(out?.source).toBeNull();
  });

  it('promotes a confirmed report to out of service', () => {
    const b = reported('drivetrain');
    const [out] = applyTriage([b], { [b.id]: 'confirmed' });
    expect(out?.condition).toBe('out-of-service');
    expect(out?.fault).toBe('drivetrain');
  });

  it('leaves untouched bikes exactly as they were', () => {
    const rack = [reported(), dead(), fine()];
    expect(applyTriage(rack, {})).toEqual(rack);
  });

  it('never resurrects a working bike', () => {
    const b = fine();
    expect(applyTriage([b], { [b.id]: 'confirmed' })[0]).toEqual(b);
  });

  it('turns a cleared report into nothing to collect', () => {
    const b = reported('brakes');
    expect(pickupFor(applyTriage([b], { [b.id]: 'no-fault' }), CALM).urgency).toBe('none');
  });

  it('turns a confirmed hazard into an immediate collection', () => {
    // The whole lifecycle in one line: reported, checked, confirmed, collected.
    const b = reported('brakes');
    const before = pickupFor([b], CALM);
    const after = pickupFor(applyTriage([b], { [b.id]: 'confirmed' }), CALM);

    expect(before.urgency).toBe('none');
    expect(before.inspect).toBe(1);
    expect(after.urgency).toBe('immediate');
    expect(after.load).toBe(1);
    expect(after.hazards).toBe(1);
  });

  it('lists only the bikes nobody has looked at yet', () => {
    const untouched = reported();
    const cleared = reported();
    const rack = [untouched, cleared, dead(), fine()];
    const waiting = awaitingTriage(rack, { [cleared.id]: 'no-fault' });

    expect(waiting.map((b) => b.id)).toEqual([untouched.id]);
  });
});

describe('faultTally', () => {
  it('groups repeats into a count', () => {
    const r = faultTally([dead('flat-tyre'), dead('flat-tyre'), dead('wheel')]);
    expect(r).toEqual([
      { fault: 'flat-tyre', count: 2 },
      { fault: 'wheel', count: 1 },
    ]);
  });

  it('leads with the hazard even when it is outnumbered', () => {
    // One set of failed brakes is the thing worth reading first on a rack
    // holding six flat tyres.
    const rack = [dead('flat-tyre'), dead('flat-tyre'), dead('flat-tyre'), dead('brakes')];
    expect(faultTally(rack)[0]).toEqual({ fault: 'brakes', count: 1 });
  });

  it('ignores working bikes', () => {
    expect(faultTally([fine(), fine()])).toEqual([]);
  });

  it('counts unchecked reports by default', () => {
    expect(faultTally([reported('wheel')])).toEqual([{ fault: 'wheel', count: 1 }]);
  });

  it('excludes unchecked reports when only confirmed faults are wanted', () => {
    // Three accidental button presses must not read as three broken bikes.
    const rack = [reported('brakes'), reported('wheel'), dead('flat-tyre')];
    expect(faultTally(rack, true)).toEqual([{ fault: 'flat-tyre', count: 1 }]);
  });

  it('drops a bike the mechanic cleared', () => {
    const b = reported('brakes');
    expect(faultTally(applyTriage([b], { [b.id]: 'no-fault' }))).toEqual([]);
  });

  it('is stable across repeated calls on an unchanged rack', () => {
    const rack = [dead('wheel'), dead('drivetrain'), dead('handlebars')];
    expect(faultTally(rack)).toEqual(faultTally([...rack].reverse()));
  });
});

describe('the call is self-consistent', () => {
  it('never claims more hazards than bikes to load', () => {
    const racks: Bike[][] = [
      [],
      [fine()],
      [reported('brakes')],
      [dead('brakes'), dead('flat-tyre'), reported(), fine()],
      [dead('battery-fault'), dead('brakes')],
    ];
    for (const rack of racks) {
      for (const b of [CALM, FULL]) {
        const r = pickupFor(rack, b);
        expect(r.hazards).toBeLessThanOrEqual(r.load);
        expect(r.load + r.inspect).toBeLessThanOrEqual(rack.length);
        expect(r.urgency === 'none').toBe(r.load === 0);
      }
    }
  });

  it('always explains itself', () => {
    for (const rack of [[], [reported()], [dead()], [dead('brakes')]]) {
      expect(pickupFor(rack, CALM).reason.length).toBeGreaterThan(0);
    }
  });
});
