import type { ColumnHelpSpec } from '../ui/primitives';
import type { Tone } from '../ui/tone';
import { CRITICAL_THRESHOLD, NEEDS_VEHICLE_THRESHOLD, STALENESS_MAX_MINUTES } from '../model/score';

/**
 * The four urgency bands, defined once.
 *
 * They lived twice: a `SCORE_GUIDE` array in the Priority Queue's rail and the
 * `values` list on `score` below, both hand-writing the same four bands off the
 * same two constants. That is precisely the drift the rail card's own comment
 * warned about — "a legend that is maintained separately from the thing it
 * explains will eventually describe a different product" — reintroduced one
 * file over. The rail card is gone; its content is the Score column's ⓘ, which
 * was already saying the same thing to anyone who hovered it.
 *
 * `tone` is here because the bands are color-coded on the board, and a key that
 * does not carry the colors is a key to something else.
 */
export const SCORE_BANDS: { label: string; gloss: string; tone: Tone }[] = [
  { label: `${CRITICAL_THRESHOLD}–100`, gloss: 'critical — send a vehicle now', tone: 'empty' },
  {
    label: `${NEEDS_VEHICLE_THRESHOLD}–${CRITICAL_THRESHOLD - 1}`,
    gloss: 'at or above the dispatch threshold',
    tone: 'warn',
  },
  { label: `0–${NEEDS_VEHICLE_THRESHOLD - 1}`, gloss: 'drifting — still serving riders', tone: 'ok' },
  { label: '?', gloss: `silent over ${STALENESS_MAX_MINUTES} min — not scored`, tone: 'mute' },
];

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
    what: (
      <>
        How badly the <strong>distribution</strong> of bikes has failed here, 0 to 100, higher
        being worse. Four things move it: which way the station has failed (empty or full scores
        higher than merely low or crowded), how many riders it serves, how fresh the reading is,
        and how long it has been failing.
      </>
    ),
    good: (
      <>
        At or above {NEEDS_VEHICLE_THRESHOLD} the board says send a vehicle. Below that a station is
        drifting but still serving riders.
        <br />
        <br />
        <strong>What it does not measure:</strong> broken bikes, dead docks, flat station
        batteries, or reported faults. None of those are inputs. A vehicle full of bikes cannot fix
        any of them, so they are ranked separately on Maintenance Operations and a station whose
        hardware has failed outright is routed off this board entirely.
        <br />
        <br />
        Dead docks do reach the number by one indirect route: they shrink the slots the fill ratio
        divides by, so a station can read as full because it is full, or because most of it is
        broken.
      </>
    ),
    values: SCORE_BANDS,
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
    what: 'How the station is failing, and what a vehicle would do about it. These four are the only values that appear here — a vehicle can fix all of them.',
    good: 'Outage and Stale stations are routed off this queue entirely, because no amount of moving bikes helps. Search still finds them and will point you to the right screen.',
    values: [
      { label: 'Empty', gloss: 'no bikes at all' },
      { label: 'Low', gloss: 'under 15% of slots hold a bike' },
      { label: 'Flooded', gloss: 'over 85% full' },
      { label: 'Full', gloss: 'no free docks' },
      { label: 'Outage →', gloss: 'switched off' },
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
    what: 'The share of a borough’s stations that need a vehicle right now.',
    good: 'Low is calm. High means the trouble is concentrated there, which is where the next vehicle should go.',
  },

  urgency: {
    what: 'The same 0–100 urgency score the rebalancing board ranks by, for stations in this zone.',
    good: `At or above ${NEEDS_VEHICLE_THRESHOLD} means send a vehicle.`,
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
      { label: 'Dispatched', gloss: 'a vehicle is on its way' },
      { label: 'Watching', gloss: 'aware of it, deciding' },
      { label: 'Snoozed', gloss: 'deliberately skipped — hidden from the default view' },
      { label: 'Known issue', gloss: 'understood and not worth a trip' },
    ],
  },
};
