import { isOpen, type WorkOrder, type WorkOrderType } from './workOrder';

/**
 * Who is on, and what that means for what can get done.
 *
 * This replaces the `MECHANICS` fixture, which was two people carrying a
 * hand-written `status` string — "Solar Deficiency @ Brooklyn" — beside a
 * separate `MECHANICS_ON_SHIFT = { active: 2, total: 5 }` that disagreed with
 * the length of the array next to it. Two facts kept by hand, already drifted.
 *
 * Everything here is derived instead. A person's status comes from their shift
 * window and the work orders that point at them, so it cannot describe a job
 * they are not on.
 *
 * ## Why a roster is worth having at all
 *
 * The method sheet already makes the argument this exists to support: *"The
 * line is not what limits you — capacity is."* That is stated there as a
 * paragraph. Here it is arithmetic — how many runs a shift contains, against
 * how many the queue is asking for. A roster that is only a list of names is
 * decoration; a roster that answers whether tonight is winnable is the screen
 * the paragraph was pointing at.
 *
 * Pure, like `score.ts` and `workOrder.ts`. No React, no UI vocabulary.
 */

export type Role =
  | 'rebalance-driver'
  | 'swap-tech'
  | 'field-mechanic'
  | 'depot-mechanic'
  | 'dispatcher';

export const ROLE_LABEL: Record<Role, string> = {
  'rebalance-driver': 'Rebalance driver',
  'swap-tech': 'Battery swap tech',
  'field-mechanic': 'Field mechanic',
  'depot-mechanic': 'Depot mechanic',
  dispatcher: 'Dispatcher',
};

/**
 * Which work each role can actually take.
 *
 * Used to answer "is there anybody who can do this?" rather than "is anybody
 * free?" — a depot full of idle mechanics does not clear a rebalancing backlog,
 * and an unassignable order is a different problem from an unassigned one.
 */
export const ROLE_HANDLES: Record<Role, WorkOrderType[]> = {
  'rebalance-driver': ['rebalance'],
  'swap-tech': ['battery-swap', 'bike-repair'],
  'field-mechanic': ['dock-repair', 'station-power', 'inspection', 'bike-repair'],
  'depot-mechanic': ['bike-repair'],
  dispatcher: [],
};

export type ShiftKey = 'am' | 'pm' | 'night';

export interface ShiftWindow {
  key: ShiftKey;
  label: string;
  /** Local hours, start inclusive, end exclusive. */
  startHour: number;
  endHour: number;
}

export const SHIFTS: ShiftWindow[] = [
  { key: 'am', label: 'AM · 06–14', startHour: 6, endHour: 14 },
  { key: 'pm', label: 'PM · 14–22', startHour: 14, endHour: 22 },
  { key: 'night', label: 'Night · 22–06', startHour: 22, endHour: 6 },
];

export interface Staff {
  id: string;
  name: string;
  role: Role;
  shift: ShiftKey;
  depot: string;
  /** Set for the roles that take a vehicle out. */
  vehicleId?: string;
}

/**
 * How many loads one driver gets through in an eight-hour shift.
 *
 * **A guess.** A run is load, drive, unload, drive back, and none of those are
 * in any public feed. Five assumes roughly ninety minutes a round trip with
 * breaks and traffic taken out of the day. It is the number that decides
 * whether the shift screen says a backlog is winnable, so it is the first thing
 * to replace with a measurement once dispatch outcomes accumulate — the same
 * fix the dispatch threshold is waiting on.
 */
export const RUNS_PER_DRIVER_PER_SHIFT = 5;

/* ---------------------------------------------------------------------------
   Who is on.
--------------------------------------------------------------------------- */

/** The shift a given moment falls in. Night wraps midnight. */
export function shiftAt(date: Date): ShiftKey {
  const h = date.getHours();
  if (h >= 6 && h < 14) return 'am';
  if (h >= 14 && h < 22) return 'pm';
  return 'night';
}

export function isOnShift(person: Staff, date: Date): boolean {
  return person.shift === shiftAt(date);
}

export type StaffStatus = 'off-shift' | 'available' | 'assigned' | 'on-site';

export const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  'off-shift': 'Off shift',
  available: 'Available',
  assigned: 'Assigned',
  'on-site': 'On site',
};

/**
 * Derived from the shift clock and the orders pointing at this person.
 *
 * Never stored. The old fixture wrote "Solar Deficiency @ Brooklyn" into the
 * person, so closing that ticket would have left them permanently described as
 * working on it.
 */
export function statusOf(person: Staff, orders: WorkOrder[], date: Date): StaffStatus {
  if (!isOnShift(person, date)) return 'off-shift';
  const mine = orders.filter((o) => o.assignee === person.id && isOpen(o));
  if (mine.some((o) => o.status === 'active')) return 'on-site';
  return mine.length > 0 ? 'assigned' : 'available';
}

/** The order a person is on, for the line under their name. */
export function currentOrder(
  person: Staff,
  orders: WorkOrder[],
): WorkOrder | null {
  const mine = orders.filter((o) => o.assignee === person.id && isOpen(o));
  return mine.find((o) => o.status === 'active') ?? mine[0] ?? null;
}

/* ---------------------------------------------------------------------------
   Can this shift clear the queue?
--------------------------------------------------------------------------- */

export interface ShiftCapacity {
  shift: ShiftKey;
  onShift: Staff[];
  off: Staff[];
  byRole: Record<Role, { on: number; total: number }>;
  /** Drivers on shift — the only role that moves bikes. */
  drivers: number;
  /** Loads this shift can realistically complete. */
  runsAvailable: number;
  /** Loads the backlog is asking for. Null when the fleet has no capacity. */
  runsNeeded: number | null;
  /** runsAvailable − runsNeeded. Negative means the shift cannot finish. */
  shortfall: number | null;
  /** Open orders with nobody on shift who could take them. */
  unassignable: number;
}

export function shiftCapacity(
  roster: Staff[],
  orders: WorkOrder[],
  opts: {
    /** Bikes that could usefully be moved — `rebalanceDemand().relocatable`. */
    relocatable: number;
    /** Bikes the active fleet can carry in one round of runs. */
    truckCapacity: number;
    date: Date;
  },
): ShiftCapacity {
  const { relocatable, truckCapacity, date } = opts;
  const shift = shiftAt(date);

  const onShift = roster.filter((p) => isOnShift(p, date));
  const off = roster.filter((p) => !isOnShift(p, date));

  const byRole = {} as Record<Role, { on: number; total: number }>;
  for (const role of Object.keys(ROLE_LABEL) as Role[]) {
    byRole[role] = {
      on: onShift.filter((p) => p.role === role).length,
      total: roster.filter((p) => p.role === role).length,
    };
  }

  const drivers = byRole['rebalance-driver'].on;

  // Null rather than zero when there is no fleet: "no trucks" and "no work" are
  // opposite situations and both would divide to the same number.
  const runsNeeded = truckCapacity > 0 ? Math.ceil(relocatable / truckCapacity) : null;
  const runsAvailable = drivers * RUNS_PER_DRIVER_PER_SHIFT;

  // An order nobody on shift is qualified for. Distinct from merely unassigned:
  // one is a scheduling choice, the other is a hole in the rota.
  const covered = new Set(onShift.flatMap((p) => ROLE_HANDLES[p.role]));
  const unassignable = orders.filter((o) => isOpen(o) && !covered.has(o.type)).length;

  return {
    shift,
    onShift,
    off,
    byRole,
    drivers,
    runsAvailable,
    runsNeeded,
    shortfall: runsNeeded === null ? null : runsAvailable - runsNeeded,
    unassignable,
  };
}

/**
 * The one-sentence answer, in the shift's own terms.
 *
 * Deliberately blunt. A screen that reports a shortfall of nineteen runs and
 * then declines to say what that means is asking the reader to do the last and
 * hardest step of the reasoning themselves.
 */
export function verdict(cap: ShiftCapacity): string {
  if (cap.runsNeeded === null) return 'No active truck capacity — nothing can be rebalanced.';
  if (cap.drivers === 0) return 'No rebalance drivers on shift. The queue will not move tonight.';
  if (cap.shortfall === null) return '';

  if (cap.shortfall >= 0) {
    return `This shift can clear the rebalancing backlog with ${cap.shortfall} run${cap.shortfall === 1 ? '' : 's'} to spare.`;
  }
  return `Short by ${Math.abs(cap.shortfall)} runs. ${cap.runsAvailable} of the ${cap.runsNeeded} needed will get done — the rest carries to the next shift.`;
}
