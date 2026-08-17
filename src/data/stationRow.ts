import type { ScoreBreakdown } from '../model/score';
import type { Tone } from '../ui/tone';

/**
 * The shape every screen consumes.
 *
 * Both producers emit this: the fixtures in `src/mock` and the live adapter in
 * `src/data/adapt.ts`. Keeping the type here rather than beside the fixtures is
 * the point of the seam — a screen cannot tell, and must not care, which one it
 * is looking at.
 */

export type StatusLabel =
  | 'Empty'
  | 'Low'
  | 'Full'
  | 'Flooded'
  | 'Healthy'
  | 'Stale'
  | 'Outage'
  | 'Not installed';

export interface StationRow {
  id: string;
  name: string;
  borough: string;
  /** Nameplate capacity — the "· 109 docks" sub-line under the station name. */
  docks: number;
  /**
   * Docks actually free right now, and the denominator in the Bikes/Docks
   * column.
   *
   * Not the nameplate: 870 installed stations disagree with their own
   * `capacity`, so a station holding 76 bikes with 3 dead docks is genuinely
   * full, and printing "76 / 79" beside "100% full" reads as a contradiction.
   * Fixtures omit this and fall back to `docks`.
   */
  openDocks?: number;
  /** Null when the station is unverified and its counts cannot be trusted. */
  bikes: number | null;
  score: number | null;
  status: StatusLabel;
  updated: string;
  /** 0–1, or null for unknown. Drives the fill bar. */
  fill: number | null;
  fillTone: Tone;
  /** The caption under the fill bar. */
  fillLabel?: string;
  /** Replaces the borough sub-line on unverified rows. */
  warning?: string;
  stationNumber?: string;

  /**
   * What a truck should do on arrival, and how much of it.
   *
   * "Empty" is a diagnosis; a dispatcher needs the instruction. Computed once
   * in `insights.ts` so the queue and the fleet panel cannot disagree.
   */
  action?: { kind: 'drop' | 'collect' | 'mechanic' | 'none'; bikes: number };

  /**
   * How long this station has been failing, from the poll history.
   *
   * Distinct from `updated`, and the two are easy to conflate: `updated` is
   * when the station last spoke, this is how long it has been broken. A
   * station can be freshly reporting and four hours empty.
   */
  duration?: import('./duration').Duration | null;

  /**
   * What the feed literally said, before any interpretation.
   *
   * The score is a chain of judgements built on these; separating them is the
   * difference between "the board thinks this is an 88" and "the board is
   * making things up". Absent on fixture rows, which have nothing raw behind
   * them.
   */
  raw?: {
    stationId: string;
    /** Nameplate, which hundreds of stations disagree with. */
    capacity: number;
    /** Bikes + docks the station actually reports working. */
    usableSlots: number;
    isRenting: boolean;
    isReturning: boolean;
    isInstalled: boolean;
    bikesDisabled: number;
    docksDisabled: number;
    ebikesAvailable: number;
    lastReportedMs: number | null;
  };

  /**
   * The real arithmetic, present only on live rows.
   *
   * Its absence is what tells the drawer it is looking at a fixture and must
   * not render a receipt that claims to reconcile.
   */
  breakdown?: ScoreBreakdown;
}
