import { describe, expect, it } from 'vitest';
import type { WorkOrder, WorkOrderType } from './workOrder';
import {
  RUNS_PER_DRIVER_PER_SHIFT,
  type Staff,
  currentOrder,
  isOnShift,
  shiftAt,
  shiftCapacity,
  statusOf,
  verdict,
} from './roster';

const at = (hour: number) => new Date(2026, 7, 27, hour, 30, 0);

let seq = 0;
function person(over: Partial<Staff> = {}): Staff {
  return {
    id: over.id ?? `p${seq++}`,
    name: over.name ?? 'Test Person',
    role: over.role ?? 'field-mechanic',
    shift: over.shift ?? 'am',
    depot: over.depot ?? 'E 18 St',
    ...(over.vehicleId ? { vehicleId: over.vehicleId } : {}),
  };
}

function order(over: Partial<WorkOrder> = {}): WorkOrder {
  const type: WorkOrderType = over.type ?? 'dock-repair';
  return {
    id: over.id ?? `wo${seq++}`,
    type,
    target: { stationId: 's1', stationName: 'Somewhere', borough: 'Brooklyn' },
    priority: null,
    status: over.status ?? 'open',
    assignee: over.assignee ?? null,
    openedAt: Date.now(),
    closedAt: over.closedAt ?? null,
    detail: '',
  };
}

describe('shift windows', () => {
  it('maps hours to the three shifts', () => {
    expect(shiftAt(at(6))).toBe('am');
    expect(shiftAt(at(13))).toBe('am');
    expect(shiftAt(at(14))).toBe('pm');
    expect(shiftAt(at(21))).toBe('pm');
    expect(shiftAt(at(22))).toBe('night');
  });

  it('wraps night across midnight', () => {
    expect(shiftAt(at(23))).toBe('night');
    expect(shiftAt(at(0))).toBe('night');
    expect(shiftAt(at(5))).toBe('night');
  });

  it('puts every hour of the day in exactly one shift', () => {
    const seen = new Set<number>();
    for (let h = 0; h < 24; h += 1) {
      expect(['am', 'pm', 'night']).toContain(shiftAt(at(h)));
      seen.add(h);
    }
    expect(seen.size).toBe(24);
  });

  it('knows whether a person is on', () => {
    const amPerson = person({ shift: 'am' });
    expect(isOnShift(amPerson, at(9))).toBe(true);
    expect(isOnShift(amPerson, at(20))).toBe(false);
  });
});

describe('derived status', () => {
  const p = person({ id: 'mark', shift: 'am' });

  it('is off-shift outside the window whatever they are assigned', () => {
    const orders = [order({ assignee: 'mark', status: 'active' })];
    expect(statusOf(p, orders, at(23))).toBe('off-shift');
  });

  it('is available on shift with nothing assigned', () => {
    expect(statusOf(p, [], at(9))).toBe('available');
  });

  it('is assigned when an order points at them', () => {
    expect(statusOf(p, [order({ assignee: 'mark', status: 'assigned' })], at(9))).toBe('assigned');
  });

  it('prefers on-site over assigned when they have both', () => {
    const orders = [
      order({ assignee: 'mark', status: 'assigned' }),
      order({ assignee: 'mark', status: 'active' }),
    ];
    expect(statusOf(p, orders, at(9))).toBe('on-site');
  });

  // The bug the old hand-written `status` string had by construction.
  it('returns to available once their order closes', () => {
    const closed = [order({ assignee: 'mark', status: 'done', closedAt: Date.now() })];
    expect(statusOf(p, closed, at(9))).toBe('available');
  });

  it('ignores orders assigned to somebody else', () => {
    expect(statusOf(p, [order({ assignee: 'sarah', status: 'active' })], at(9))).toBe('available');
  });

  it('reports the active order as the current one', () => {
    const orders = [
      order({ id: 'idle', assignee: 'mark', status: 'assigned' }),
      order({ id: 'live', assignee: 'mark', status: 'active' }),
    ];
    expect(currentOrder(p, orders)?.id).toBe('live');
  });

  it('has no current order when everything of theirs is closed', () => {
    const orders = [order({ assignee: 'mark', status: 'done', closedAt: Date.now() })];
    expect(currentOrder(p, orders)).toBeNull();
  });
});

describe('shift capacity', () => {
  const roster: Staff[] = [
    person({ id: 'd1', role: 'rebalance-driver', shift: 'am' }),
    person({ id: 'd2', role: 'rebalance-driver', shift: 'am' }),
    person({ id: 'd3', role: 'rebalance-driver', shift: 'pm' }),
    person({ id: 'm1', role: 'field-mechanic', shift: 'am' }),
    person({ id: 's1', role: 'swap-tech', shift: 'pm' }),
  ];

  const base = { relocatable: 1000, truckCapacity: 100, date: at(9) };

  it('splits the roster into on and off shift', () => {
    const cap = shiftCapacity(roster, [], base);
    expect(cap.shift).toBe('am');
    expect(cap.onShift.map((p) => p.id).sort()).toEqual(['d1', 'd2', 'm1']);
    expect(cap.off.map((p) => p.id).sort()).toEqual(['d3', 's1']);
  });

  it('counts each role on shift against its total', () => {
    const cap = shiftCapacity(roster, [], base);
    expect(cap.byRole['rebalance-driver']).toEqual({ on: 2, total: 3 });
    expect(cap.byRole['swap-tech']).toEqual({ on: 0, total: 1 });
  });

  it('derives runs available from drivers on shift only', () => {
    const cap = shiftCapacity(roster, [], base);
    expect(cap.drivers).toBe(2);
    expect(cap.runsAvailable).toBe(2 * RUNS_PER_DRIVER_PER_SHIFT);
  });

  it('derives runs needed from demand over fleet capacity', () => {
    const cap = shiftCapacity(roster, [], { ...base, relocatable: 1000, truckCapacity: 100 });
    expect(cap.runsNeeded).toBe(10);
    expect(cap.shortfall).toBe(cap.runsAvailable - 10);
  });

  // "No trucks" and "no work" are opposite situations that would divide to the
  // same number, so the no-fleet case must not report zero.
  it('reports null rather than zero when the fleet has no capacity', () => {
    const cap = shiftCapacity(roster, [], { ...base, truckCapacity: 0 });
    expect(cap.runsNeeded).toBeNull();
    expect(cap.shortfall).toBeNull();
    expect(verdict(cap)).toMatch(/no active truck capacity/i);
  });

  it('counts orders no role on shift can take', () => {
    // AM has drivers and a field mechanic; nobody who does battery swaps.
    const orders = [order({ type: 'battery-swap' }), order({ type: 'dock-repair' })];
    const cap = shiftCapacity(roster, orders, base);
    expect(cap.unassignable).toBe(1);
  });

  it('does not count closed orders as unassignable', () => {
    const orders = [order({ type: 'battery-swap', status: 'done', closedAt: Date.now() })];
    expect(shiftCapacity(roster, orders, base).unassignable).toBe(0);
  });
});

describe('verdict', () => {
  const drivers = (n: number, shift: 'am' | 'pm' = 'am') =>
    Array.from({ length: n }, (_, i) =>
      person({ id: `d${i}`, role: 'rebalance-driver', shift }),
    );

  it('says the backlog is clearable when it is', () => {
    const cap = shiftCapacity(drivers(4), [], {
      relocatable: 100,
      truckCapacity: 100,
      date: at(9),
    });
    expect(cap.shortfall).toBeGreaterThanOrEqual(0);
    expect(verdict(cap)).toMatch(/can clear/i);
  });

  it('names the shortfall and what carries over when it is not', () => {
    const cap = shiftCapacity(drivers(1), [], {
      relocatable: 5000,
      truckCapacity: 100,
      date: at(9),
    });
    expect(cap.shortfall).toBeLessThan(0);
    expect(verdict(cap)).toMatch(/short by 45 runs/i);
    expect(verdict(cap)).toMatch(/carries to the next shift/i);
  });

  it('calls out an empty rota rather than reporting a shortfall', () => {
    const cap = shiftCapacity(drivers(2, 'pm'), [], {
      relocatable: 1000,
      truckCapacity: 100,
      date: at(9),
    });
    expect(cap.drivers).toBe(0);
    expect(verdict(cap)).toMatch(/no rebalance drivers on shift/i);
  });
});
