/**
 * Which dead bikes come off the rack now, and which ride out on the next sweep.
 *
 * The board has always answered "where does the next vehicle go" using bikes and
 * docks alone. Broken bikes were counted — `num_bikes_disabled` is real, and the
 * Hardware screen ranks on it — but they never reached the vehicle that was
 * already being sent to the same station. A crew was dispatched to drop twelve
 * bikes at a rack holding four dead ones and told nothing about the four.
 *
 * That is the gap this closes. It does not change the urgency score and it does
 * not move anything between lanes: it answers a second question about a station
 * the board is already looking at, which is what the crew should take away.
 *
 * ## The decision, in the order the field makes it
 *
 * 1. **Unconfirmed reports are not pickups.** A rider pressing the repair button
 *    locks the dock, but it does not establish that anything is broken — riders
 *    hit it by accident, or in frustration at a docking or billing failure. The
 *    field check comes first, and it frequently clears the bike. Loading a rack
 *    on the strength of an unverified report is how a working bike ends up in a
 *    warehouse queue behind genuinely broken ones.
 * 2. **Hazards leave immediately.** A bike whose brakes or battery have failed
 *    should not stay locked to a public rack waiting for a scheduled circuit.
 * 3. **A dead bike in a scarce dock leaves immediately.** At a station riders
 *    cannot return to, the dock the bike is occupying is worth more than the
 *    bike. This is the one case where a *rebalancing* problem is solved by a
 *    *repair* action, which is exactly why it has to be decided here rather than
 *    in either screen on its own.
 * 4. **Everything else rides the routine sweep.** Non-hazardous heavy damage
 *    stays locked in a red dock and is collected on the next scheduled circuit.
 *
 * ## Rejected
 *
 * Folding dead bikes into the urgency score. A rack with four broken bikes is
 * not more *empty* than one without, and the score answers how badly a station
 * needs bikes moved. Feeding hardware into it would make a station look like it
 * needed a rebalance when what it needs is a collection — the same conflation
 * that once put dead docks at the top of a rebalancing queue.
 *
 * Ranking pickups against each other with a second score. There is one scoring
 * model in this app and every constant in it has to be defensible; a competing
 * hardware score would need invented weights and would immediately disagree with
 * the first one somewhere. This returns a band and a reason, and the station's
 * existing urgency does the ordering.
 */

import type { Bike, BikeFault } from '../sim/fleet';
import type { ScoreBreakdown } from './score';

/* ---------------------------------------------------------------------------
   Triage: what the mechanic found when they actually looked.
--------------------------------------------------------------------------- */

/**
 * The two ways a red dock ends.
 *
 * `confirmed` promotes a report to a real fault: the bike is dead, the dock
 * stays locked, and it joins the collection list. `no-fault` is the other and
 * more common outcome — the mechanic ran the check, found nothing, and released
 * the latch back to green.
 *
 * Modelling the second one is the point. A maintenance system that can only
 * record faults will show a rising backlog whether the network is degrading or
 * riders are simply leaning on the button, and those need opposite responses.
 */
export type TriageOutcome = 'confirmed' | 'no-fault';

export const TRIAGE_LABEL: Record<TriageOutcome, string> = {
  confirmed: 'Fault confirmed',
  'no-fault': 'No fault found',
};

/** Triage decisions this session, keyed by frame number. */
export type TriageLog = Record<string, TriageOutcome>;

/**
 * The rack as it stands after the checks a mechanic has logged.
 *
 * A cleared bike becomes indistinguishable from one that was never reported:
 * condition `ok`, no fault, no source. That is what releasing the dock means,
 * and leaving a cleared bike visibly marked would keep it out of the available
 * count on every screen that reads this rack.
 *
 * Applied as an overlay rather than by mutating the simulation because the
 * simulation is derived from the feed and must stay reproducible — the same
 * station yields the same rack on every poll, and a triage decision is a fact
 * about this session laid on top of it.
 */
export function applyTriage(bikes: Bike[], log: TriageLog): Bike[] {
  return bikes.map((bike) => {
    const outcome = log[bike.id];
    if (!outcome || bike.condition === 'ok') return bike;

    return outcome === 'no-fault'
      ? { ...bike, condition: 'ok', fault: null, source: null }
      : { ...bike, condition: 'out-of-service' };
  });
}

/** Bikes still waiting on somebody to look at them. */
export function awaitingTriage(bikes: Bike[], log: TriageLog): Bike[] {
  return bikes.filter((b) => b.condition === 'flagged' && !log[b.id]);
}

export interface FaultCount {
  fault: BikeFault;
  count: number;
}

/**
 * What is actually wrong with the bikes on a rack, tallied.
 *
 * So a summary can say "brakes not working, bent wheel" rather than "2 broken
 * bikes" and send the reader off to another panel to find out which two. The
 * hazards lead regardless of how many there are: one set of failed brakes is
 * the thing worth reading first even on a rack holding six flat tyres.
 *
 * `confirmedOnly` is the distinction that matters when this feeds an
 * instruction. Unchecked rider reports are worth *showing* — they explain the
 * red docks — but they are not established facts about the rack, and mixing
 * them into one list would let three accidental button presses read as three
 * broken bikes.
 */
export function faultTally(bikes: Bike[], confirmedOnly = false): FaultCount[] {
  const counts = new Map<BikeFault, number>();

  for (const bike of bikes) {
    if (bike.fault === null) continue;
    if (confirmedOnly && bike.condition !== 'out-of-service') continue;
    if (bike.condition === 'ok') continue;
    counts.set(bike.fault, (counts.get(bike.fault) ?? 0) + 1);
  }

  return [...counts]
    .map(([fault, count]) => ({ fault, count }))
    .sort((a, b) => {
      const byHazard = Number(isHazard(b.fault)) - Number(isHazard(a.fault));
      if (byHazard !== 0) return byHazard;
      if (b.count !== a.count) return b.count - a.count;
      // Alphabetical last, so a repoll cannot reorder an unchanged rack.
      return a.fault.localeCompare(b.fault);
    });
}

/**
 * Faults that make a bike unsafe to leave locked to a public rack.
 *
 * Drawn from what the operator treats as a safety or security matter rather than
 * a repair: failed braking, and a compromised battery, which is a fire risk and
 * a theft target. The remaining faults strand the next rider and nothing worse —
 * a flat tyre on a locked bike hurts nobody.
 *
 * `handlebars` is the judgement call. Loose bars are genuinely dangerous to ride
 * and it is a category riders report often, which is the problem: it is also the
 * most common thing a rider misreads, and the dock lock already prevents anyone
 * from riding it. It stays routine, and the confirmed report is what a mechanic
 * acts on. Move it here if the field disagrees — that is the one line to change.
 */
export const HAZARD_FAULTS: readonly BikeFault[] = ['brakes', 'battery-fault'];

export function isHazard(fault: BikeFault | null): boolean {
  return fault !== null && HAZARD_FAULTS.includes(fault);
}

/** `none` is a real answer: most racks have nothing to collect. */
export type PickupUrgency = 'immediate' | 'routine' | 'none';

export const PICKUP_LABEL: Record<PickupUrgency, string> = {
  immediate: 'Collect now',
  routine: 'Collect on the next sweep',
  none: 'Nothing to collect',
};

export interface PickupCall {
  urgency: PickupUrgency;
  /** Confirmed dead bikes for the vehicle to load. */
  load: number;
  /** Reported but unconfirmed — a mechanic checks these before anything moves. */
  inspect: number;
  /** Of `load`, how many are unsafe to leave on the street. */
  hazards: number;
  /** Plain sentence stating why, for the crew's instruction line. */
  reason: string;
}

/**
 * Exported so a caller can skip the rack simulation entirely.
 *
 * A station the feed reports zero disabled bikes at cannot produce a pickup —
 * only the broken slots are ever given a condition — so the thousand-odd rows
 * in the queue that have nothing wrong with their hardware do not need a rack
 * invented for them on every poll to be told so.
 */
export const NO_PICKUP: PickupCall = {
  urgency: 'none',
  load: 0,
  inspect: 0,
  hazards: 0,
  reason: 'Nothing on this rack needs collecting.',
};

const EMPTY = NO_PICKUP;

/**
 * `bikes` is the simulated rack, sized by the feed's own disabled count.
 * `breakdown` supplies the station's dock pressure and nothing else — this never
 * reads the score, so tuning the scoring model cannot silently change what a
 * crew is told to load.
 */
export function pickupFor(bikes: Bike[], breakdown: ScoreBreakdown): PickupCall {
  let load = 0;
  let inspect = 0;
  let hazards = 0;

  for (const bike of bikes) {
    if (bike.condition === 'flagged') {
      inspect += 1;
      continue;
    }
    if (bike.condition !== 'out-of-service') continue;

    load += 1;
    if (isHazard(bike.fault)) hazards += 1;
  }

  if (load === 0) {
    return inspect === 0
      ? EMPTY
      : {
          ...EMPTY,
          inspect,
          reason: `${inspect} reported ${plural(inspect, 'bike')} still to be checked. Nothing is confirmed dead yet, so there is nothing to load.`,
        };
  }

  if (hazards > 0) {
    return {
      urgency: 'immediate',
      load,
      inspect,
      hazards,
      reason: `${hazards} of the ${load} dead ${plural(load, 'bike')} ${plural(hazards, 'is', 'are')} a brake or battery fault, which should not sit locked to a public rack.`,
    };
  }

  // The full side is the whole point of this branch: at a station riders cannot
  // return to, a dead bike is not a repair job, it is a blocked dock. Read off
  // the signal the scoring model already publishes rather than a second fill
  // threshold that would drift away from it.
  if (breakdown.signal === 'full') {
    return {
      urgency: 'immediate',
      load,
      inspect,
      hazards,
      reason: `Riders cannot return here, and ${load} dead ${plural(load, 'bike is', 'bikes are')} holding ${plural(load, 'a dock', 'docks')} shut. Taking ${plural(load, 'it', 'them')} away frees ${plural(load, 'it', 'them')} up.`,
    };
  }

  return {
    urgency: 'routine',
    load,
    inspect,
    hazards,
    reason: `${load} dead ${plural(load, 'bike')} to collect. Nothing hazardous and docks are not scarce here, so ${plural(load, 'it rides', 'they ride')} out on the next scheduled sweep.`,
  };
}

function plural(n: number, one: string, many?: string): string {
  if (n === 1) return one;
  return many ?? `${one}s`;
}
