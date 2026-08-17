import type { ColumnHelpSpec } from '../ui/primitives';
import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD, STALENESS_MAX_MINUTES } from '../model/score';

/**
 * Definitions for every column whose header is not self-explanatory.
 *
 * The test applied: could somebody read the header and be confidently wrong?
 * "Bikes / Open" invites "open stations". "Fill" does not say fill of what.
 * "Condition" and "Fault" sit next to each other and sound like synonyms.
 * Columns that pass the test — Station, Borough, Rank — get nothing, because
 * an icon on an obvious header is noise that trains people to ignore icons.
 */

export const COLUMN_HELP: Record<string, ColumnHelpSpec> = {
  score: {
    what: `Urgency from 0 to 100. Higher is worse — it combines how the station is failing, how many riders it serves, and how fresh the reading is.`,
    good: `At or above ${NEEDS_TRUCK_THRESHOLD} the board says send a truck. Below that a station is drifting but still serving riders.`,
    values: [
      { label: `${CRITICAL_THRESHOLD}–100`, gloss: 'critical — send a truck now' },
      {
        label: `${NEEDS_TRUCK_THRESHOLD}–${CRITICAL_THRESHOLD - 1}`,
        gloss: 'at or above the dispatch threshold',
      },
      { label: `0–${NEEDS_TRUCK_THRESHOLD - 1}`, gloss: 'drifting, still usable' },
      { label: '?', gloss: 'not scored — the station is silent' },
    ],
  },

  bikesOpen: {
    what: 'Bikes available right now, over docks standing empty right now. Both are counts of physical objects at the station.',
    good: 'Roughly even is healthy. "0 / 40" means nobody can rent; "40 / 0" means nobody can return.',
    values: [
      { label: 'Open', gloss: 'free docks — not open stations' },
      {
        label: 'Why not capacity',
        gloss: 'hundreds of stations disagree with their own nameplate, so the board counts what is reported working',
      },
    ],
  },

  fill: {
    what: 'The share of this station’s working slots that currently hold a bike.',
    good: 'Around 50% is balanced. Near 0% it is out of bikes; near 100% it is out of docks.',
  },

  status: {
    what: 'How the station is failing, and what a truck would do about it. These four are the only values that appear here — a truck can fix all of them.',
    good: 'Outage and Stale stations are routed off this queue entirely, because no amount of moving bikes helps. Search still finds them and will point you to the right screen.',
    values: [
      { label: 'Empty', gloss: 'no bikes at all — nobody can rent' },
      { label: 'Low', gloss: 'under 15% of slots hold a bike — nearly out' },
      { label: 'Flooded', gloss: 'over 85% full — nearly out of docks' },
      { label: 'Full', gloss: 'no free docks — nobody can return' },
      { label: 'Outage →', gloss: 'switched off — lives on Maintenance Ops' },
      {
        label: 'Stale →',
        gloss: `silent over ${STALENESS_MAX_MINUTES} min — lives on Unverified Stations`,
      },
    ],
  },

  updated: {
    what: 'How long ago this station last reported its own counts to the feed.',
    good: 'Under 15 minutes is taken at face value. Older readings add an uncertainty penalty; past an hour the station is dropped from the ranking.',
  },

  thresholdExcess: {
    what: `How far beyond the ${STALENESS_MAX_MINUTES}-minute reporting cutoff a silent station is — time since its last report, minus the hour it is allowed. Nothing to do with the dispatch threshold; this is about silence, not urgency.`,
    good: 'Small values may just be a dropped connection worth a modem reset. Hours or days mean somebody has to physically visit.',
  },

  heartbeat: {
    what: 'Time since the station last checked in at all.',
    good: '"never" means the feed has never carried a usable timestamp for it — not that it reported zero.',
  },

  fault: {
    what: 'What the operator’s own flags say is wrong, in plain words.',
    values: [
      { label: 'Not renting or returning', gloss: 'the station is switched off entirely' },
      { label: 'Rentals closed', gloss: 'bikes cannot be taken out' },
      { label: 'Returns closed', gloss: 'bikes cannot be put back' },
      { label: 'Reports no usable slots', gloss: 'the whole rack reads as dead' },
    ],
  },

  condition: {
    what: 'The category the scoring model assigned — the machine-readable counterpart to Fault, which is the human sentence.',
  },

  pressure: {
    what: 'The share of a borough’s stations that need a truck right now.',
    good: 'Low is calm. High means the trouble is concentrated there, which is where the next vehicle should go.',
  },

  urgency: {
    what: 'The same 0–100 urgency score the Priority Queue ranks by, for stations in this zone.',
    good: `At or above ${NEEDS_TRUCK_THRESHOLD} means send a truck.`,
  },

  fillStatus: {
    what: 'Bikes over free docks, with the fill bar underneath.',
    good: 'A long bar means the station is close to full; an empty track means it has run out of bikes.',
  },

  failingFor: {
    what: 'How long this station has been continuously above the dispatch threshold, measured from the first poll that flagged it.',
    good: 'Minutes is normal churn. Hours means the queue has been showing it to people who keep choosing something else.',
  },

  disposition: {
    what: 'What you decided about this station — the one column on the board a person sets rather than the feed.',
    good: 'Nothing in the data changes this, and it never affects the score. It is a note to yourself and to whoever has the next shift.',
    values: [
      { label: 'Not set', gloss: 'nobody has decided about this one yet' },
      { label: 'Dispatched', gloss: 'a truck is on its way' },
      { label: 'Watching', gloss: 'aware of it, deciding' },
      { label: 'Snoozed', gloss: 'deliberately skipped — hidden from the default view' },
      { label: 'Known issue', gloss: 'understood and not worth a trip' },
    ],
  },
};
