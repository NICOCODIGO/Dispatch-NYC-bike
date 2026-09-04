import type { ReactNode } from 'react';

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
  // `rebalancing` used to live here. Its screen now says the same thing in its
  // own masthead, shorter and in plain words, because a page that needs a
  // dismissible box to explain the paragraph directly above it has two
  // introductions and no clear one. The full derivation was always a click away
  // in the method sheet, which is the right home for the detail this carried.
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
