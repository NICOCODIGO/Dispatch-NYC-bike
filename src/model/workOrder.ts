import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD } from './score';

/**
 * A unit of field work, with a clock on it.
 *
 * This replaces `Ticket`, which was a card rather than a model: `where` was a
 * pre-formatted sentence, `severity` was a display label, and `reported` was
 * the string "13:45". None of those can be measured. A maintenance system whose
 * age field is a rendered clock cannot answer how long anything has been open,
 * which is the only question anybody asks of one.
 *
 * The important change is that `openedAt` is an epoch timestamp. Everything
 * worth knowing — age, whether the response target was met, how much of the
 * backlog is late — falls out of that one field being a number.
 *
 * ## What this deliberately does not absorb
 *
 * `DispatchRun` stays where it is. A rebalance order *references* its run by id
 * rather than restating it, because the run carries before/after snapshots and
 * the outcome arithmetic that Verify depends on. Folding that in would put
 * tested measurement logic at risk to make one type look tidier.
 *
 * Kept free of React and of the UI vocabulary for the same reason `score.ts`
 * is: the scheduled worker has to be able to import it.
 */

/**
 * Note that `battery-swap` and `station-power` are different jobs.
 *
 * "Battery" is two things in this domain and conflating them is easy: an e-bike
 * carries a battery a crew swaps in seconds, and a station carries its own
 * power — solar or mains — which keeps the dock and the cellular modem alive.
 * A dead bike battery costs one rider a ride. A dead station battery takes the
 * whole site off the feed, which is how a station ends up in the unverified
 * lane. Different crews, different urgency, different fix.
 */
export type WorkOrderType =
  | 'rebalance'
  | 'battery-swap'
  | 'station-power'
  | 'dock-repair'
  | 'bike-repair'
  | 'inspection';

export const WORK_ORDER_LABEL: Record<WorkOrderType, string> = {
  rebalance: 'Rebalance',
  'battery-swap': 'Battery swap',
  'station-power': 'Station power',
  'dock-repair': 'Dock repair',
  'bike-repair': 'Bike repair',
  inspection: 'Inspection',
};

/**
 * `open` means nobody has it. `assigned` means somebody owns it but has not
 * started. `active` means they are on site. The split matters because the
 * middle state is where work goes to die — an order can sit assigned for a
 * whole shift and look handled on every count that only asks "is it open?".
 */
export type WorkOrderStatus = 'open' | 'assigned' | 'active' | 'done' | 'cancelled';

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: 'Unassigned',
  assigned: 'Assigned',
  active: 'On site',
  done: 'Done',
  cancelled: 'Cancelled',
};

/**
 * Response targets, in minutes.
 *
 * **These are guesses.** No published Citi Bike SLA breaks down by work type,
 * so they are ordered by what strands riders fastest rather than measured: a
 * jammed dock takes capacity out of the network and cannot self-correct, while
 * a single dead bike is one machine among thirty-five thousand. Rebalancing is
 * tightest because it is the only one that decays — a station left empty an
 * hour is a different problem from a station left empty ten minutes.
 *
 * Surfaced as `Guess` wherever they are shown. The honest way to fix them is
 * the same as for the dispatch threshold: enough recorded outcomes to see which
 * target actually predicts recovery.
 */
export const SLA_MINUTES: Record<WorkOrderType, number> = {
  rebalance: 60,
  'battery-swap': 180,
  // Level with dock repair: both take a whole station's capacity out of the
  // network, and a site that loses power stops reporting, which costs the board
  // its own visibility on top of costing riders the docks.
  'station-power': 240,
  'dock-repair': 240,
  'bike-repair': 480,
  inspection: 720,
};

/** Fraction of the target at which an order starts warning rather than sitting quiet. */
const DUE_SOON_AT = 0.75;

export interface WorkOrderTarget {
  /** Null for an order about a depot or a vehicle rather than a station. */
  stationId: string | null;
  stationName: string;
  borough: string;
  /** Set when the order is about one frame rather than the whole rack. */
  bikeId?: string;
}

export interface WorkOrder {
  id: string;
  type: WorkOrderType;
  target: WorkOrderTarget;
  /** The station's urgency at the moment the order was raised, 0–100. */
  priority: number | null;
  status: WorkOrderStatus;
  /** Staff id, or null while unassigned. */
  assignee: string | null;
  openedAt: number;
  closedAt: number | null;
  detail: string;
  /** Operator fault code, rendered inline where present. */
  faultCode?: string;
  /** Rebalance orders point at their execution record rather than copying it. */
  runId?: string;
}

/* ---------------------------------------------------------------------------
   The clock.
--------------------------------------------------------------------------- */

/** Open orders age; closed ones freeze at the age they were closed. */
export function ageMinutes(order: WorkOrder, now: number): number {
  const end = order.closedAt ?? now;
  return Math.max(0, Math.round((end - order.openedAt) / 60_000));
}

export function dueAt(order: WorkOrder): number {
  return order.openedAt + SLA_MINUTES[order.type] * 60_000;
}

export type SlaState = 'ok' | 'due-soon' | 'breached' | 'closed';

/**
 * A closed order reports `closed`, not `ok`.
 *
 * Whether it was *finished in time* is a separate question from whether it is
 * currently in trouble, and collapsing the two would let a wall of late-but-
 * finished work read as healthy. `wasLate` answers the other one.
 */
export function slaState(order: WorkOrder, now: number): SlaState {
  if (order.status === 'done' || order.status === 'cancelled') return 'closed';
  const elapsed = now - order.openedAt;
  const target = SLA_MINUTES[order.type] * 60_000;
  if (elapsed >= target) return 'breached';
  return elapsed >= target * DUE_SOON_AT ? 'due-soon' : 'ok';
}

/** Cancelled orders are never late — nobody was asked to do them. */
export function wasLate(order: WorkOrder): boolean {
  if (order.status !== 'done' || order.closedAt === null) return false;
  return order.closedAt > dueAt(order);
}

export function isOpen(order: WorkOrder): boolean {
  return order.status === 'open' || order.status === 'assigned' || order.status === 'active';
}

/* ---------------------------------------------------------------------------
   Urgency band, borrowed rather than reinvented.
--------------------------------------------------------------------------- */

export type Urgency = 'critical' | 'high' | 'routine';

export const URGENCY_LABEL: Record<Urgency, string> = {
  critical: 'Critical',
  high: 'High',
  routine: 'Routine',
};

/**
 * Read off the same two constants the board ranks on.
 *
 * An order's urgency and its station's score have to agree, or the maintenance
 * screen calls something routine that the queue is calling critical, and a
 * coordinator has to hold two scales in their head at once.
 */
export function urgencyOf(order: WorkOrder): Urgency {
  if (order.priority === null) return 'routine';
  if (order.priority >= CRITICAL_THRESHOLD) return 'critical';
  return order.priority >= NEEDS_TRUCK_THRESHOLD ? 'high' : 'routine';
}

/* ---------------------------------------------------------------------------
   Rollups.
--------------------------------------------------------------------------- */

export interface BacklogStats {
  open: number;
  unassigned: number;
  breached: number;
  dueSoon: number;
  /** Mean age of everything still open, in minutes. Null with nothing open. */
  meanOpenAge: number | null;
  /** Oldest open order, for the "worst of it" line. */
  oldest: WorkOrder | null;
  byType: Record<WorkOrderType, number>;
}

export function backlog(orders: WorkOrder[], now: number): BacklogStats {
  const byType: Record<WorkOrderType, number> = {
    rebalance: 0,
    'battery-swap': 0,
    'station-power': 0,
    'dock-repair': 0,
    'bike-repair': 0,
    inspection: 0,
  };

  let unassigned = 0;
  let breached = 0;
  let dueSoon = 0;
  let ageSum = 0;
  let oldest: WorkOrder | null = null;

  const live = orders.filter(isOpen);
  for (const o of live) {
    byType[o.type] += 1;
    if (o.status === 'open') unassigned += 1;

    const sla = slaState(o, now);
    if (sla === 'breached') breached += 1;
    else if (sla === 'due-soon') dueSoon += 1;

    ageSum += ageMinutes(o, now);
    if (!oldest || o.openedAt < oldest.openedAt) oldest = o;
  }

  return {
    open: live.length,
    unassigned,
    breached,
    dueSoon,
    meanOpenAge: live.length > 0 ? Math.round(ageSum / live.length) : null,
    oldest,
    byType,
  };
}

/**
 * Worst first, the same shape of ordering the queue uses.
 *
 * Breached before due-soon before fine; within a band, oldest first. Urgency
 * breaks ties last rather than first: a critical order raised a minute ago is
 * genuinely less at risk than a high one that has already blown its target.
 */
export function sortByPressure(orders: WorkOrder[], now: number): WorkOrder[] {
  const rank: Record<SlaState, number> = { breached: 0, 'due-soon': 1, ok: 2, closed: 3 };
  const urgencyRank: Record<Urgency, number> = { critical: 0, high: 1, routine: 2 };

  return [...orders].sort((a, b) => {
    const bySla = rank[slaState(a, now)] - rank[slaState(b, now)];
    if (bySla !== 0) return bySla;
    if (a.openedAt !== b.openedAt) return a.openedAt - b.openedAt;
    return urgencyRank[urgencyOf(a)] - urgencyRank[urgencyOf(b)];
  });
}
