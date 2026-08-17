import { create } from 'zustand';
import { ACTIVITY_LOG, TICKETS, type ActivityEntry, type Ticket } from '../mock/data';
import {
  outcomeOf,
  runSummary,
  type DispatchRun,
  type RunSnapshot,
} from '../data/dispatchRun';

/**
 * Wall clock, "23:05".
 *
 * Real, now that the rail shows real time. The two seeded tickets still carry
 * fixture stamps (13:45, 10:12) and that is fine — they are fixtures and
 * labelled as such. Anything the console actually creates is stamped when it
 * happened.
 */
function clock(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Console UI state.
 *
 * Deliberately separate from `src/store/useDispatch.ts`, which owns the live
 * GBFS feed and stays untouched. This store holds the things the *screens*
 * share with each other: which station's receipt is open, and the work that
 * one screen creates for another.
 *
 * Tickets live here rather than in `src/mock` because they are no longer a
 * fixture — dispatching a mechanic from Unverified appends to this list, and
 * Maintenance Operations reads it back. That round trip is the whole point.
 */

/**
 * Everything needed to raise a work order, from whichever screen raised it.
 *
 * Deliberately not a station type: Unverified escalates a station that has
 * stopped reporting, Maintenance escalates one the feed says is broken, and a
 * human can raise one about anything. The store should not care which.
 */
export interface MechRequest {
  /** Stable id, so the same subject cannot be escalated twice. */
  key: string;
  name: string;
  /** The "Grand Army Plaza · Station #442 · Brooklyn" line. */
  where: string;
  region: string;
  /** One sentence of why, written by the screen that knows. */
  detail: string;
  icon?: Ticket['icon'];
}

/* ---------------------------------------------------------------------------
   Dispositions — the one field on the board a person owns.
--------------------------------------------------------------------------- */

export type Disposition = 'dispatched' | 'watching' | 'snoozed' | 'known-issue';

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  dispatched: 'Dispatched',
  watching: 'Watching',
  snoozed: 'Snoozed',
  'known-issue': 'Known issue',
};

/** Past tense, for the activity log. */
const DISPOSITION_VERB: Record<Disposition, string> = {
  dispatched: 'marked dispatched',
  watching: 'started watching',
  snoozed: 'snoozed',
  'known-issue': 'flagged as a known issue',
};

interface ConsoleState {
  /** The station whose Score Breakdown drawer is open, app-wide. */
  openStationId: string | null;
  openStation: (id: string) => void;
  closeStation: () => void;

  tickets: Ticket[];
  activity: ActivityEntry[];
  /** Keys already escalated, so a screen can show what it has already done. */
  dispatched: string[];
  dispatchMechanic: (req: MechRequest) => void;

  /**
   * Per-station judgement, keyed by station id.
   *
   * Nothing in the feed writes here and nothing here changes a score. It
   * exists because with several hundred stations over the threshold there was
   * no way to work the list — no way to mark one handled, deliberately
   * skipped, or already understood — so every shift saw the same
   * undifferentiated pile.
   */
  dispositions: Record<string, Disposition>;
  setDisposition: (stationId: string, name: string, next: Disposition | null) => void;

  /**
   * Which truck was sent where, keyed by truck id.
   *
   * Invented, like the fleet itself — but invented *consistently*: once a
   * coordinator sends #2 to a station, Fleet Operations shows #2 carrying that
   * task, the row reads Dispatched, and the log records who decided it. A
   * fixture that changes when you act on it is worth more than a fixture that
   * sits still, because it exercises the real shape of the workflow.
   */
  assignments: Record<string, TruckAssignment>;
  dispatchTruck: (req: DispatchRequest) => void;

  /**
   * Every truck sent, with the station captured before and after.
   *
   * Kept separate from `assignments` because an assignment is *current* — one
   * per truck, overwritten on re-tasking — while a run is a historical fact
   * that must survive the truck being sent somewhere else.
   */
  runs: DispatchRun[];
  completeRun: (runId: string, after: RunSnapshot, auto: boolean) => void;
  cancelRun: (runId: string) => void;
}

export interface TruckAssignment {
  truckId: string;
  stationId: string;
  stationName: string;
  borough: string;
  /** "drop 33 bikes" / "collect 12 bikes". */
  instruction: string;
  at: string;
}

export interface DispatchRequest {
  truckId: string;
  depot: string;
  stationId: string;
  stationName: string;
  borough: string;
  instruction: string;
  /** What was ordered, so realization can be measured against it. */
  kind: 'drop' | 'collect';
  ordered: number;
  etaMinutes: number;
  /** The station as it stood when the order went out. */
  before: RunSnapshot;
}

export const useConsole = create<ConsoleState>((set, get) => ({
  openStationId: null,
  openStation: (id) => set({ openStationId: id }),
  closeStation: () => set({ openStationId: null }),

  tickets: TICKETS,
  activity: ACTIVITY_LOG,
  dispatched: [],

  dispatchMechanic: (req) => {
    if (get().dispatched.includes(req.key)) return;

    const at = clock();

    const ticket: Ticket = {
      id: `mech-${req.key}`,
      title: req.name,
      severity: 'CRITICAL',
      tone: 'empty',
      icon: req.icon ?? 'wrench',
      where: req.where,
      reported: at,
      fault: req.detail,
      assignment: { kind: 'pending', label: 'PENDING MECHANIC' },
    };

    const entry: ActivityEntry = {
      who: 'System',
      verb: 'dispatched',
      what: `Mechanic to ${req.name}.`,
      time: at,
      where: req.region,
      tone: 'empty',
    };

    set((s) => ({
      tickets: [ticket, ...s.tickets],
      activity: [entry, ...s.activity],
      dispatched: [...s.dispatched, req.key],
    }));
  },

  dispositions: {},

  setDisposition: (stationId, name, next) =>
    set((s) => {
      const dispositions = { ...s.dispositions };
      if (next === null) delete dispositions[stationId];
      else dispositions[stationId] = next;

      // Every judgement lands in the same log the maintenance side writes to,
      // so "who decided to skip this and when" has one answer.
      const entry: ActivityEntry = {
        who: 'Ops Center',
        verb: next === null ? 'cleared the disposition on' : DISPOSITION_VERB[next],
        what: name,
        time: clock(),
        where: 'Priority Queue',
        tone: next === 'snoozed' ? 'mute' : next === 'dispatched' ? 'ok' : 'warn',
      };

      return { dispositions, activity: [entry, ...s.activity] };
    }),

  assignments: {},

  dispatchTruck: (req) =>
    set((s) => {
      const at = clock();
      const sentAt = Date.now();

      const entry: ActivityEntry = {
        who: 'Ops Center',
        verb: `sent Truck ${req.truckId} to`,
        what: `${req.stationName} — ${req.instruction}.`,
        time: at,
        where: req.borough,
        tone: 'ok',
      };

      const run: DispatchRun = {
        id: `${req.truckId}:${sentAt}`,
        truckId: req.truckId,
        depot: req.depot,
        stationId: req.stationId,
        stationName: req.stationName,
        borough: req.borough,
        kind: req.kind,
        ordered: req.ordered,
        sentAt,
        etaMinutes: req.etaMinutes,
        before: req.before,
        completedAt: null,
        after: null,
        auto: false,
      };

      return {
        assignments: {
          ...s.assignments,
          [req.truckId]: {
            truckId: req.truckId,
            stationId: req.stationId,
            stationName: req.stationName,
            borough: req.borough,
            instruction: req.instruction,
            at,
          },
        },
        // Sending a truck *is* a disposition. Making the coordinator set it
        // separately would guarantee the two drift apart.
        dispositions: { ...s.dispositions, [req.stationId]: 'dispatched' },
        activity: [entry, ...s.activity],
        runs: [run, ...s.runs],
      };
    }),

  runs: [],

  completeRun: (runId, after, auto) =>
    set((s) => {
      const run = s.runs.find((r) => r.id === runId);
      if (!run || run.completedAt !== null) return s;

      const done: DispatchRun = { ...run, completedAt: Date.now(), after, auto };
      const outcome = outcomeOf(done);

      const entry: ActivityEntry = {
        who: auto ? 'System' : 'Ops Center',
        verb: auto ? `closed Truck ${run.truckId}'s run at` : `marked Truck ${run.truckId} done at`,
        what: `${run.stationName} — ${runSummary(done) ?? 'no reading'}.`,
        time: clock(),
        where: run.borough,
        tone: outcome === 'recovered' ? 'ok' : outcome === 'worse' ? 'empty' : 'warn',
      };

      // A finished run releases the truck; leaving the assignment in place
      // would show a vehicle permanently committed to a job it has done.
      const assignments = { ...s.assignments };
      if (assignments[run.truckId]?.stationId === run.stationId) delete assignments[run.truckId];

      return {
        runs: s.runs.map((r) => (r.id === runId ? done : r)),
        assignments,
        activity: [entry, ...s.activity],
      };
    }),

  cancelRun: (runId) =>
    set((s) => {
      const run = s.runs.find((r) => r.id === runId);
      if (!run) return s;
      const assignments = { ...s.assignments };
      if (assignments[run.truckId]?.stationId === run.stationId) delete assignments[run.truckId];
      const dispositions = { ...s.dispositions };
      if (dispositions[run.stationId] === 'dispatched') delete dispositions[run.stationId];
      return { runs: s.runs.filter((r) => r.id !== runId), assignments, dispositions };
    }),
}));

/** Tickets nobody has picked up yet — the "N dispatch pending" figure. */
export function pendingCount(tickets: Ticket[]): number {
  return tickets.filter((t) => t.assignment.kind === 'pending').length;
}
