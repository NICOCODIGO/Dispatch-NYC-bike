import { create } from 'zustand';
import {
  ACTIVITY_LOG,
  CONSOLE_CLOCK,
  TICKETS,
  type ActivityEntry,
  type Ticket,
  type UnverifiedRow,
} from '../mock/data';

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

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

interface ConsoleState {
  /** The station whose Score Breakdown drawer is open, app-wide. */
  openStationId: string | null;
  openStation: (id: string) => void;
  closeStation: () => void;

  tickets: Ticket[];
  activity: ActivityEntry[];
  /** Device IDs already escalated, so Unverified can show what it has done. */
  dispatched: string[];
  dispatchMechanic: (row: UnverifiedRow) => void;
}

export const useConsole = create<ConsoleState>((set, get) => ({
  openStationId: null,
  openStation: (id) => set({ openStationId: id }),
  closeStation: () => set({ openStationId: null }),

  tickets: TICKETS,
  activity: ACTIVITY_LOG,
  dispatched: [],

  dispatchMechanic: (row) => {
    if (get().dispatched.includes(row.deviceId)) return;

    const at = CONSOLE_CLOCK;

    const ticket: Ticket = {
      id: `mech-${row.deviceId}`,
      title: `${row.name} — Modem Unresponsive`,
      severity: 'CRITICAL',
      tone: 'empty',
      icon: 'radio-tower',
      where: `${row.name} · Station ${row.deviceId} · ${titleCase(row.region)}`,
      reported: at,
      fault: `No heartbeat for ${row.heartbeat} (${row.excess}). Escalated from Unverified Stations; cellular modem or power fault suspected. Station is excluded from Priority Queue scoring until it reports.`,
      assignment: { kind: 'pending', label: 'PENDING MECHANIC' },
    };

    const entry: ActivityEntry = {
      who: 'System',
      verb: 'dispatched',
      what: `Mechanic to ${row.name}.`,
      time: at,
      where: titleCase(row.region),
      tone: 'empty',
    };

    set((s) => ({
      tickets: [ticket, ...s.tickets],
      activity: [entry, ...s.activity],
      dispatched: [...s.dispatched, row.deviceId],
    }));
  },
}));

/** Tickets nobody has picked up yet — the "N dispatch pending" figure. */
export function pendingCount(tickets: Ticket[]): number {
  return tickets.filter((t) => t.assignment.kind === 'pending').length;
}
