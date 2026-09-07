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
 * "Docks" does not say which of its two numbers is the open one. "Fill" does
 * not say fill of what. "Condition" and "Fault" sit next to each other and
 * sound like synonyms. Columns that pass the test — Station, Borough, Rank —
 * get nothing, because an icon on an obvious header is noise that trains
 * people to ignore icons.
 */

export const COLUMN_HELP: Record<string, ColumnHelpSpec> = {
  /*
   * Four lines and a key, not an essay.
   *
   * This was five paragraphs — the full argument for what the score does and
   * does not measure, in a 290px hover. Nobody reads a wall of text with the
   * pointer held still, and the one genuinely surprising fact (dead docks
   * shrink the denominator) sat in the last of them, where it was never
   * reached. The long form belongs on the method sheet and the drawer's
   * receipt, both of which stay open while you read them.
   */
  score: {
    what: (
      <>
        How badly the <strong>distribution</strong> of bikes has failed here, 0 to 100, higher being
        worse. Built from which way it failed, how many riders it serves, how fresh the reading is,
        and how long it has been failing.
      </>
    ),
    good: (
      <>
        At or above {NEEDS_VEHICLE_THRESHOLD} the board says send a vehicle. Broken bikes and dead
        docks are not terms in it — but they do shrink the slots the fill ratio divides by, so a
        station can read as full because it is full, or because most of it is broken.
      </>
    ),
    values: SCORE_BANDS,
    more: { to: '/scoring', label: 'Every constant behind this number' },
  },

  /*
   * Not a column of its own — the arrow rides in the Urgency cell, and this is
   * the ⓘ that explains it there. A separate header for one glyph would cost
   * more width than the glyph does.
   */
  trend: {
    what: 'Which way this station has moved since the board first flagged it this session.',
    good: 'Only movement worth acting on is marked, and only in the bad direction. Where two stations score the same, the one still sliding is ranked first — the score says how bad, this says whether it is still getting worse.',
    values: [
      { label: '▲', gloss: 'worsening — more than 5 points worse than when first seen', tone: 'empty' },
      { label: '▼', gloss: 'improving — recovering on its own, still shown until it clears', tone: 'mute' },
      { label: 'blank', gloss: 'holding steady, or first seen this poll' },
    ],
  },

  /*
   * Headed "Bikes / Free", not "Docks". The one-word header was tidier and it
   * lied: above "86 / 0" it says the first number is docks when it is bikes,
   * and a header that needs its own tooltip to avoid misleading is not doing
   * its job. Two words, both labelled.
   */
  docks: {
    what: 'Bikes parked and ready to rent, over docks standing open.',
    good: '"0 / 40" means nobody can rent here; "40 / 0" means nobody can return. Sorting orders by fill — the two counts are one fact from opposite ends. Both count what the feed reports working, not the nameplate, because hundreds of stations disagree with their own; where they differ the station line says how many docks actually work.',
  },

  move: {
    what: 'What a vehicle should do on arrival, and how many bikes it involves.',
    good: 'Warm means the station is short and a vehicle drops bikes off; cool means it is full and a vehicle picks them up. The count is the number that would return the station to about half full — the same figure the fleet screen totals into runs. Not sortable: ordering by size would put a 40-bike surplus above a station with nothing at all.',
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
    what: 'How long ago this station last sent its own counts to the feed — the heartbeat, not how long it has been failing (that is on the score receipt).',
    good: 'The dot colours match the score: green readings are taken at face value, amber ones are old enough to add an uncertainty penalty, and past an hour the station drops off the ranking entirely.',
    values: [
      { label: 'Fresh', gloss: 'reported within the last 15 minutes', tone: 'ok' },
      { label: 'Aging', gloss: '15–60 minutes — the score now carries a penalty for it', tone: 'warn' },
      { label: 'Not reporting', gloss: 'silent over an hour — routed off this board', tone: 'empty' },
    ],
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
