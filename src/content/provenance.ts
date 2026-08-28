import type { Tone } from '../ui/tone';

/**
 * Where every number on screen comes from.
 *
 * The app now shows individual bikes, battery levels, dock faults, staff and
 * work orders — none of which exist in GBFS. Each of those is labelled at the
 * point of use, but a pill saying "Simulated" answers a local question, and the
 * one a reader actually forms after seeing three of them is global: *how much
 * of this is real?* Without somewhere to answer that, the labels stop reassuring
 * and start unsettling.
 *
 * This is that answer, in one table.
 *
 * ## The distinction that matters most
 *
 * "Simulated" and "fixture" are not the same claim and are kept apart here.
 *
 * A **simulated** field is invented but *sized by a real count*: the app models
 * fourteen individual bikes at a station because the operator's own feed says
 * twelve available and two disabled. The identities are fiction; the number is
 * not, and the fiction cannot contradict it.
 *
 * A **fixture** is invented with nothing behind it. The trucks, the roster and
 * the seed work orders are anchored to no feed value at all — GBFS carries no
 * vehicles and no people, so there is nothing to anchor to. That is a weaker
 * claim and it should look like one.
 *
 * Collapsing the two into a single "not real" would flatter the fixtures by
 * association with the simulation, which is the opposite of what a page like
 * this is for.
 */

export type DataSource = 'feed' | 'derived' | 'session' | 'simulated' | 'fixture';

export const SOURCE_LABEL: Record<DataSource, string> = {
  feed: 'Live feed',
  derived: 'Derived',
  session: 'Observed this session',
  simulated: 'Simulated',
  fixture: 'Fixture',
};

export const SOURCE_TONE: Record<DataSource, Tone> = {
  feed: 'ok',
  derived: 'flood',
  session: 'warn',
  simulated: 'mute',
  fixture: 'empty',
};

export const SOURCE_MEANING: Record<DataSource, string> = {
  feed: "Read straight from Citi Bike's public GBFS endpoints, unmodified.",
  derived: 'Computed from feed values by a tested, pure module. No new facts, just arithmetic.',
  session:
    'Genuinely observed, but only while this tab has been open. Refreshing loses it. The scheduled worker in /worker is the fix, and it is not deployed.',
  simulated:
    'Invented — but sized by a real count from the feed, so it can elaborate what GBFS omits without ever contradicting what GBFS states.',
  fixture:
    'Invented with nothing behind it. GBFS carries no vehicles, staff or work orders, so there is no real number to anchor these to.',
};

export interface DataField {
  label: string;
  source: DataSource;
  detail: string;
  /** For simulated fields: the real value that fixes the size of the invention. */
  anchor?: string;
}

export interface ProvenanceGroup {
  key: string;
  label: string;
  note: string;
  fields: DataField[];
}

export const PROVENANCE_GROUPS: ProvenanceGroup[] = [
  {
    key: 'station',
    label: 'Stations',
    note: 'Everything the operator publishes about a site.',
    fields: [
      {
        label: 'Name, coordinates, nameplate capacity',
        source: 'feed',
        detail: 'From station_information, followed via the GBFS auto-discovery document.',
      },
      {
        label: 'Bikes available, e-bikes available, free docks',
        source: 'feed',
        detail: 'From station_status, refreshed every 60 seconds.',
      },
      {
        label: 'Bikes disabled, docks disabled',
        source: 'feed',
        detail:
          'Real counts, and disjoint from the available figures — a station reporting 12 available and 2 disabled has fourteen bikes present.',
      },
      {
        label: 'Renting / returning / installed flags',
        source: 'feed',
        detail: 'The operator’s own service flags. What routes a station to Maintenance.',
      },
      {
        label: 'Borough',
        source: 'derived',
        detail:
          'GBFS has no borough field. Coordinates are tested against hand-simplified outlines; the regions it does publish are districts and junk zones.',
      },
      {
        label: 'Fill ratio and usable slots',
        source: 'derived',
        detail:
          'bikes ÷ (bikes + free docks). Deliberately not divided by nameplate capacity, which hundreds of stations disagree with — which is also why dead docks shrink the denominator.',
      },
      {
        label: 'Urgency score, category, triage lane',
        source: 'derived',
        detail:
          'From src/model/score.ts. Every constant behind it is listed above with its own provenance.',
      },
    ],
  },
  {
    key: 'assets',
    label: 'Individual bikes and docks',
    note: 'GBFS counts machines. It never identifies one.',
    fields: [
      {
        label: 'Frame numbers',
        source: 'simulated',
        detail:
          'Seeded from the station id and dock index, so the same bike is there on the next poll, after a reload, and in another tab.',
        anchor: 'bikes available + bikes disabled',
      },
      {
        label: 'Which bikes are electric',
        source: 'simulated',
        detail:
          'The count is real. Which specific frames carry it is not, and a disabled bike’s type is drawn — the feed does not break disabled bikes down by type.',
        anchor: 'e-bikes available',
      },
      {
        label: 'Which bikes are broken',
        source: 'simulated',
        detail:
          'The number broken is exact. The split between “needs a check” and “out of service” is invented — the feed says a bike is unavailable, never how badly.',
        anchor: 'bikes disabled',
      },
      {
        label: 'Fault reasons (flat tyre, brakes, stuck release…)',
        source: 'simulated',
        detail:
          'Entirely invented. The feed reports that a machine is out, never why. Drawn from the failures riders actually report on dock-based systems.',
        anchor: 'bikes disabled, docks disabled',
      },
      {
        label: 'Battery charge',
        source: 'simulated',
        detail:
          'No state of charge exists in GBFS at any level. Modelled as drift from the station’s last report, so a stale station also has flat batteries rather than the two stories disagreeing.',
        anchor: 'last reported timestamp',
      },
      {
        label: 'Which stations charge their docks',
        source: 'simulated',
        detail:
          'Grid-connected stations are real and Lyft is adding them to cut manual swaps, but which ones is not published. Drawn from the station id, stable, about a third of the network.',
      },
    ],
  },
  {
    key: 'operations',
    label: 'Fleet, staff and work',
    note: 'None of this is in any public feed. Anchored to nothing.',
    fields: [
      {
        label: 'Trucks — positions, load, capacity, state',
        source: 'fixture',
        detail:
          'GBFS has no vehicles. Coordinates are real points so travel estimates are arithmetic rather than invented numbers wearing a precise costume, but the vehicles themselves are made up.',
      },
      {
        label: 'The roster — people, shifts, roles, depots',
        source: 'fixture',
        detail:
          'Eleven invented staff over three shifts. Who is on shift is computed from the clock, and what each is doing is computed from the work orders — but the people are not real.',
      },
      {
        label: 'Seed work orders',
        source: 'fixture',
        detail:
          'Two, opened relative to page load so their SLA clocks actually run. Anything you raise from a station or a bike is stamped when you raised it.',
      },
      {
        label: 'SLA response targets',
        source: 'fixture',
        detail:
          'No published Citi Bike SLA breaks down by work type. Ordered by what strands riders fastest, and tightest for rebalancing because it is the only one that decays.',
      },
      {
        label: 'Runs per driver per shift',
        source: 'fixture',
        detail:
          'Five. The number that decides whether the Shift screen calls a backlog winnable, and the first thing worth replacing with a measurement.',
      },
    ],
  },
  {
    key: 'history',
    label: 'History',
    note: 'Real observation with a real limit.',
    fields: [
      {
        label: 'How long a station has been failing',
        source: 'session',
        detail:
          'Measured by watching consecutive polls. Genuinely observed, and genuinely gone when you refresh — which is why the score’s duration weight is capped rather than trusted.',
      },
      {
        label: 'Dispatch outcomes and recovery rate',
        source: 'session',
        detail:
          'Each run captures the station before and after. Accumulates only while the tab is open, so it is a session log rather than evidence.',
      },
    ],
  },
];

/** Counts per source, for the summary line. */
export function sourceTally(): { source: DataSource; count: number }[] {
  const counts = new Map<DataSource, number>();
  for (const g of PROVENANCE_GROUPS) {
    for (const f of g.fields) counts.set(f.source, (counts.get(f.source) ?? 0) + 1);
  }
  return (Object.keys(SOURCE_LABEL) as DataSource[])
    .map((source) => ({ source, count: counts.get(source) ?? 0 }))
    .filter((r) => r.count > 0);
}
