import {
  BASE_EMPTY,
  BASE_FULL,
  BASE_OUTAGE,
  BASE_STARVING,
  BASE_UNUSABLE,
  CAPACITY_WEIGHT_CAP,
  CAPACITY_WEIGHT_FLOOR,
  CAPACITY_WEIGHT_SPAN,
  CRITICAL_THRESHOLD,
  FLOODED_FILL_RATIO,
  NEEDS_VEHICLE_THRESHOLD,
  STALENESS_GRACE_MINUTES,
  STALENESS_MAX_MINUTES,
  STALENESS_MAX_PENALTY,
  STARVING_FILL_RATIO,
} from '../model/score';
import { DURATION_CAP, DURATION_PER_HOUR } from '../data/duration';
import { DEFAULT_ETA_MINUTES } from '../data/dispatchRun';

/**
 * Every number the score is built from, with where it came from.
 *
 * The receipt shows the arithmetic but presents each constant as a fact. They
 * are not facts — they are judgements, most of them mine, and an operator who
 * cannot see them cannot argue with the score. An operator who cannot argue
 * with the score eventually stops trusting it, which is a worse failure than
 * getting a constant wrong.
 *
 * `provenance` is the honest field. "Measured" means it came out of the live
 * feed; "reasoned" means somebody argued for it; "guess" means exactly that.
 */

/**
 * `simulated` is a different kind of claim from the other three.
 *
 * Measured, reasoned and guessed all describe a *constant* — how much
 * confidence to place in a number the model uses. Simulated describes a whole
 * *field*: one the feed does not carry at all, which the app models so the
 * screens that need it can exist. A guessed threshold is still about real
 * stations. A simulated battery level is about a bike GBFS never mentioned.
 *
 * Kept in the same vocabulary rather than given its own, because a reader who
 * has learned to look for these pills should find every kind of uncertainty
 * wearing one — including the largest kind.
 */
export type Provenance = 'measured' | 'reasoned' | 'guess' | 'simulated';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  measured: 'Measured',
  reasoned: 'Reasoned',
  guess: 'Guess',
  simulated: 'Simulated',
};

export const PROVENANCE_MEANING: Record<Provenance, string> = {
  measured: 'Derived from the live feed rather than chosen.',
  reasoned: 'A judgement with an argument behind it, but not measured.',
  guess: 'Picked because a number was needed. The first thing to test against real outcomes.',
  simulated:
    'Not in the feed at all. Modelled by the app, and sized by a real count so it cannot contradict what the feed does say.',
};

export interface ScoringConstant {
  key: string;
  label: string;
  value: number;
  unit?: string;
  why: string;
  provenance: Provenance;
  /** Only threshold-like values are safe to move from the UI. */
  editable?: { min: number; max: number; step: number };
  group: 'threshold' | 'base' | 'weight' | 'freshness' | 'duration' | 'dispatch';
}

export const SCORING_CONSTANTS: ScoringConstant[] = [
  {
    key: 'NEEDS_VEHICLE_THRESHOLD',
    label: 'Dispatch threshold',
    value: NEEDS_VEHICLE_THRESHOLD,
    why: 'The line between "worth a trip" and "drifting but still serving riders". Nothing has ever measured whether 55 is right — that needs recovery data over weeks.',
    provenance: 'guess',
    editable: { min: 30, max: 90, step: 5 },
    group: 'threshold',
  },
  {
    key: 'CRITICAL_THRESHOLD',
    label: 'Critical line',
    value: CRITICAL_THRESHOLD,
    why: 'The second line, above the dispatch one: at or above this a station is called critical and jumps the queue rather than joining it. Not derived from the dispatch threshold — the two answer different questions and should be free to be wrong separately. Also a guess.',
    provenance: 'guess',
    group: 'threshold',
  },
  {
    key: 'STARVING_FILL_RATIO',
    label: 'Low-stock line',
    value: STARVING_FILL_RATIO,
    unit: 'of usable slots',
    why: 'Below this share of slots holding a bike, the next few riders are likely to find none.',
    provenance: 'reasoned',
    group: 'threshold',
  },
  {
    key: 'FLOODED_FILL_RATIO',
    label: 'Flooded line',
    value: FLOODED_FILL_RATIO,
    unit: 'of usable slots',
    why: 'Above this, a rider arriving is likely to find no dock. The mirror of the low-stock line.',
    provenance: 'reasoned',
    group: 'threshold',
  },

  {
    key: 'BASE_EMPTY',
    label: 'Base · empty',
    value: BASE_EMPTY,
    why: 'No bikes at all. Every arriving rider leaves with nothing.',
    provenance: 'reasoned',
    group: 'base',
  },
  {
    key: 'BASE_FULL',
    label: 'Base · full',
    value: BASE_FULL,
    why: 'No free docks. Deliberately equal to empty — they strand the same number of riders, just in opposite directions.',
    provenance: 'reasoned',
    group: 'base',
  },
  {
    key: 'BASE_STARVING',
    label: 'Base · low stock',
    value: BASE_STARVING,
    why: 'A warning, not a failure. Some riders are still served.',
    provenance: 'reasoned',
    group: 'base',
  },
  {
    key: 'BASE_UNUSABLE',
    label: 'Base · unusable',
    value: BASE_UNUSABLE,
    why: 'Scores highest because nothing about it self-corrects — but it is routed to a mechanic, so it never competes for a vehicle.',
    provenance: 'reasoned',
    group: 'base',
  },
  {
    key: 'BASE_OUTAGE',
    label: 'Base · outage',
    value: BASE_OUTAGE,
    why: 'Switched off. Same reasoning as unusable.',
    provenance: 'reasoned',
    group: 'base',
  },

  {
    key: 'CAPACITY_WEIGHT_FLOOR',
    label: 'Capacity weight floor',
    value: CAPACITY_WEIGHT_FLOOR,
    unit: '×',
    why: 'The smallest station still counts for three quarters. A tiny station failing is not nothing.',
    provenance: 'reasoned',
    group: 'weight',
  },
  {
    key: 'CAPACITY_WEIGHT_CAP',
    label: 'Capacity weight cap',
    value: CAPACITY_WEIGHT_CAP,
    unit: '×',
    why: 'Stops one enormous station dominating the board forever. Without a cap the same handful of 100-dock sites would hold the top ten permanently.',
    provenance: 'reasoned',
    editable: { min: 1, max: 2, step: 0.05 },
    group: 'weight',
  },
  {
    key: 'CAPACITY_WEIGHT_SPAN',
    label: 'Capacity weight span',
    value: CAPACITY_WEIGHT_SPAN,
    why: 'How far the multiplier travels between the floor and the cap.',
    provenance: 'reasoned',
    group: 'weight',
  },

  {
    key: 'STALENESS_GRACE_MINUTES',
    label: 'Grace window',
    value: STALENESS_GRACE_MINUTES,
    unit: 'min',
    why: 'Readings inside this are taken at face value. Roughly the interval at which stations report, so a station is not punished for ordinary silence.',
    provenance: 'measured',
    group: 'freshness',
  },
  {
    key: 'STALENESS_MAX_PENALTY',
    label: 'Maximum staleness penalty',
    value: STALENESS_MAX_PENALTY,
    unit: 'pts',
    why: 'Staleness is uncertainty, not severity. It nudges you to look; it must never invent a crisis.',
    provenance: 'reasoned',
    editable: { min: 0, max: 30, step: 1 },
    group: 'freshness',
  },
  {
    key: 'STALENESS_MAX_MINUTES',
    label: 'Unverified cutoff',
    value: STALENESS_MAX_MINUTES,
    unit: 'min',
    why: 'Past this, counts are not evidence and the station leaves the ranking. Sending a vehicle on an hour-old reading is how you drive to a station that fixed itself forty minutes ago.',
    provenance: 'reasoned',
    group: 'freshness',
  },

  {
    key: 'DURATION_PER_HOUR',
    label: 'Duration weight',
    value: DURATION_PER_HOUR,
    unit: 'pts / hour',
    why: 'A station failing for four hours is a worse failure than one that just tipped over, and is the one most likely to keep losing the tie-break.',
    provenance: 'guess',
    editable: { min: 0, max: 12, step: 1 },
    group: 'duration',
  },
  {
    key: 'DURATION_CAP',
    label: 'Duration cap',
    value: DURATION_CAP,
    unit: 'pts',
    why: 'Age alone must not outrank a station that is actually empty right now.',
    provenance: 'guess',
    editable: { min: 0, max: 40, step: 5 },
    group: 'duration',
  },

  {
    key: 'DEFAULT_ETA_MINUTES',
    label: 'Assumed run time',
    value: DEFAULT_ETA_MINUTES,
    unit: 'min',
    why: 'How long before an unconfirmed dispatch is closed and measured. Entirely invented — a real fleet would report arrival.',
    provenance: 'guess',
    editable: { min: 5, max: 60, step: 5 },
    group: 'dispatch',
  },
];

export const CONSTANT_GROUPS: { key: ScoringConstant['group']; label: string; note: string }[] = [
  { key: 'threshold', label: 'Thresholds', note: 'Where the lines between states are drawn.' },
  { key: 'base', label: 'Base scores', note: 'What each kind of failure is worth before any modifier.' },
  { key: 'weight', label: 'Capacity weight', note: 'How much station size scales the base.' },
  { key: 'freshness', label: 'Freshness', note: 'How the age of a reading is treated.' },
  { key: 'duration', label: 'Duration', note: 'How long a station has been failing.' },
  { key: 'dispatch', label: 'Dispatch', note: 'Assumptions about the fleet, which is a fixture.' },
];
