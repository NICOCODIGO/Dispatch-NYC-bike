import type { ReactNode } from 'react';
import { CRITICAL_THRESHOLD, NEEDS_TRUCK_THRESHOLD } from '../model/score';

/**
 * The mental model for a screen — one step above the subtitle.
 *
 * The subtitle says what the page *is*; this says how to *read* it — the
 * framing that makes the numbers below mean something. Shown open on a first
 * visit, collapsed to a link once dismissed (per screen, in localStorage).
 *
 * Two or three sentences, no more. The deep dive is the method sheet; this is
 * just the "so what am I looking at" a new dispatcher needs once.
 */
export const GUIDES: Record<string, ReactNode> = {
  rebalancing: (
    <>
      Every station gets a 0–100 urgency score from how far it has drifted off
      half-full — weighted up for the bigger stations, and for how long it has
      been stuck. At {NEEDS_TRUCK_THRESHOLD} it needs a truck; at{' '}
      {CRITICAL_THRESHOLD} it jumps the line. This board is that list, worst
      first. Stations with a broken dock, or that have gone quiet, are scored
      differently and live on their own screens — a truck cannot help them.
    </>
  ),
  analytics: (
    <>
      This is the one screen that asks whether any of the dispatching is
      actually working. It takes a snapshot of every station the board flags on
      each poll and follows it — did the score come back down, or not?
      &ldquo;Recovery rate&rdquo; is the share that did. Recording only runs
      while this tab is open, so the window is this session, not overnight.
    </>
  ),
};
