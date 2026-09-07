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
  { label: `${CRITICAL_THRESHOLD}–100`, gloss: 'critical, send a vehicle now', tone: 'empty' },
  {
    label: `${NEEDS_VEHICLE_THRESHOLD}–${CRITICAL_THRESHOLD - 1}`,
    gloss: 'at or above the dispatch threshold',
    tone: 'warn',
  },
  { label: `0–${NEEDS_VEHICLE_THRESHOLD - 1}`, gloss: 'drifting, still serving riders', tone: 'ok' },
  { label: '?', gloss: `silent over ${STALENESS_MAX_MINUTES} min, not scored`, tone: 'mute' },
];

/**
 * Definitions for every column whose header is not self-explanatory.
 *
 * The test applied: could somebody read the header and be confidently wrong?
 * "Fill" does not say fill of what. "Condition" and "Fault" sit next to each
 * other and sound like synonyms. Columns that pass the test, such as Station
 * and Rank, get nothing, because an icon on an obvious header is noise that
 * trains people to ignore icons.
 */

export const COLUMN_HELP: Record<string, ColumnHelpSpec> = {
  /*
   * A hover is read standing still, with the pointer held. Every entry below
   * was cut to what somebody would actually finish reading in that posture.
   *
   * `score` was five paragraphs once, and the one genuinely surprising fact in
   * it (dead docks shrink the denominator) sat in the last of them, where
   * nobody reached it. The long form has a page of its own now.
   */
  score: {
    what: (
      <>
        How badly the bikes here are in the wrong place, 0 to 100. Higher is worse. Four things move
        it: which way the station failed, how many riders it serves, how fresh the reading is, and
        how long it has been failing.
      </>
    ),
    good: (
      <>
        At {NEEDS_VEHICLE_THRESHOLD} the board says send a vehicle. Broken bikes and dead docks are
        not part of the score, but they do shrink the slots it measures fill against. So a station
        can read full because it is full, or because most of it is broken.
      </>
    ),
    values: SCORE_BANDS,
    more: { to: '/scoring', label: 'Every constant behind this number' },
  },

  /* No column of its own. The arrow rides in the Urgency cell, and one glyph
     does not earn a header. */
  trend: {
    what: 'Which way this station has moved since the board first flagged it today.',
    good: 'Only bad movement is marked. When two stations score the same, the one still sliding is ranked first.',
    values: [
      { label: '▲', gloss: 'getting worse, by more than 5 points', tone: 'empty' },
      { label: '▼', gloss: 'recovering on its own', tone: 'mute' },
      { label: 'blank', gloss: 'holding steady, or new this poll' },
    ],
  },

  /* Headed "Bikes / Free". A one-word "Docks" was tidier and it lied: above
     "86 / 0" it called the first number docks when it is bikes. */
  docks: {
    what: 'Bikes ready to rent, over docks standing open.',
    good: '"0 / 40" means nobody can rent. "40 / 0" means nobody can return. Sorting orders by fill, since the two counts are one fact from opposite ends. Both count what the feed says is working rather than the nameplate, because hundreds of stations disagree with their own. Where those differ, the station line says how many docks actually work.',
  },

  move: {
    what: 'What a vehicle should do here, and how many bikes it involves.',
    good: 'Warm means drop bikes off, cool means pick them up. The count is what brings the station back to about half full. Below the dispatch line it says watch instead, because a station still serving riders does not need a run. Not sortable: a 40 bike surplus would outrank a station with nothing at all.',
  },

  fill: {
    what: 'The share of working slots holding a bike.',
    good: 'Around 50% is balanced. Near 0% it has run out of bikes. Near 100% it has run out of docks.',
  },

  status: {
    what: 'How the station is failing. A vehicle can fix all four of these.',
    good: 'Outage and Stale stations are routed off this board, because moving bikes will not help them. Search still finds them and points you to the right screen.',
    values: [
      { label: 'Empty', gloss: 'no bikes at all' },
      { label: 'Low', gloss: 'under 15% of slots hold a bike' },
      { label: 'Flooded', gloss: 'over 85% full' },
      { label: 'Full', gloss: 'no free docks' },
      { label: 'Outage →', gloss: 'switched off' },
      {
        label: 'Stale →',
        gloss: `silent over ${STALENESS_MAX_MINUTES} min, lives on Not Reporting`,
      },
    ],
  },

  updated: {
    what: 'How long ago the station last reported to the feed. This is its heartbeat, not how long it has been failing.',
    good: 'The dot matches how the score treats the reading. Green is taken at face value, amber adds an uncertainty penalty, red drops the station off the ranking.',
    values: [
      { label: 'Fresh', gloss: 'reported in the last 15 minutes', tone: 'ok' },
      { label: 'Aging', gloss: '15 to 60 minutes, so the score now carries a penalty', tone: 'warn' },
      { label: 'Not reporting', gloss: 'silent over an hour, routed off this board', tone: 'empty' },
    ],
  },

  thresholdExcess: {
    what: `How far past the ${STALENESS_MAX_MINUTES} minute cutoff a silent station is: time since its last report, minus the hour it is allowed. Nothing to do with the dispatch threshold. This is about silence, not urgency.`,
    good: 'Small values may just be a dropped connection worth a modem reset. Hours or days mean somebody has to go and look.',
  },

  heartbeat: {
    what: 'Time since the station last checked in at all.',
    good: '"never" means the feed has never carried a usable timestamp for it. It does not mean the station reported zero.',
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
    what: 'The category the scoring model assigned. Fault says the same thing as a sentence; this is the label it files under.',
  },

  pressure: {
    what: 'The share of a borough’s stations that need a vehicle right now.',
    good: 'Low is calm. High means the trouble is concentrated there, which is where the next vehicle should go.',
  },

  urgency: {
    what: 'The same 0 to 100 score the rebalancing board ranks by, for stations in this zone.',
    good: `At ${NEEDS_VEHICLE_THRESHOLD} or above, send a vehicle.`,
  },

  fillStatus: {
    what: 'Bikes over free docks, with the fill bar underneath.',
    good: 'A long bar means the station is close to full. An empty track means it has run out of bikes.',
  },

  failingFor: {
    what: 'How long this station has been above the dispatch line, counted from the first poll that flagged it.',
    good: 'Minutes is normal churn. Hours means the queue kept showing it to people who chose something else.',
  },

  disposition: {
    what: 'What to do next, and what you already decided. The only column a person sets rather than the feed.',
    good: 'A row worth a vehicle shows a Dispatch button. Once you have acted, the cell remembers which call you made. None of it touches the score. It is a note to yourself and to whoever has the next shift.',
    values: [
      { label: 'Dispatch', gloss: 'send a vehicle to this station now' },
      { label: 'Dispatched', gloss: 'a vehicle is on its way' },
      { label: 'Watching', gloss: 'aware of it, still deciding' },
      { label: 'Snoozed', gloss: 'deliberately skipped, hidden from the default view' },
      { label: 'Known issue', gloss: 'understood, and not worth a trip' },
    ],
  },
};
