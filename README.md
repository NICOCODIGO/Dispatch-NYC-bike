# Dispatch

A rebalancing board for New York's bikeshare network. It answers one question:
**which stations need a truck right now, and why?**

Bikeshare stations fail two ways — *empty* (nobody can rent) or *full* (nobody
can return) — and both are fixed by a truck showing up. The public GBFS feed
publishes live status for ~2,460 stations but has no notion of urgency; it is a
flat list of numbers. Dispatch reads that feed, scores every station 0–100, and
sorts worst-first.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 105 tests
npm run build    # static site in dist/
```

## The three screens

| Route | What it is |
| --- | --- |
| `/` | **Queue** — the ranked board. Situation sentence, status strip, filters, and the worst-first table. |
| `/station/:id` | **Explain** — the receipt. Every step of one station's arithmetic. |
| `/verify` | **Verify** — did the stations we flagged actually get fixed? |

## The scoring model

Everything lives in one pure function in [src/model/score.ts](src/model/score.ts):

```ts
scoreStation(info, status, now, p90Capacity) => ScoreBreakdown
```

A station is classified first (in priority order: not installed → unusable →
outage → empty/full → starving/flooded → healthy), which sets a base score. Two
modifiers then apply: a **capacity weight** (a 60-dock station running dry
strands more riders than a 12-dock one) and a **staleness penalty** (a reading
we cannot vouch for earns a nudge to look, not a claim of severity). Past 60
minutes a station is marked *Not reporting* and drops out of the truck count
entirely — sending a truck on an hour-old reading is how you drive to a station
that fixed itself forty minutes ago.

Every constant is a named export with a comment explaining the reasoning, and
the threshold for "needs a truck" is `NEEDS_TRUCK_THRESHOLD = 55`.

**The Explain screen renders directly from `ScoreBreakdown`.** There is no second
copy of the formula in the UI — the math a dispatcher reads is the math that
ranked the list. `ScoreBreakdown` carries every input, intermediate and
contribution so the screen needs zero recomputation.

One consequence is worth calling out: every value is rounded to its *displayed*
precision before it feeds the next step. Carrying full precision internally and
rounding only at render is more correct mathematically and wrong here — the one
screen whose job is to earn trust would visibly fail to add up. A test sweeps
1,050 station shapes asserting the receipt reconciles exactly.

## What the data actually looks like

The feed has three traps this app handles explicitly, each found by inspecting
the live payload rather than trusting the spec:

- **`last_reported: 86400` is a sentinel**, not a timestamp. 67 stations carry
  epoch + 1 day meaning "never reported". Taken literally it reads as 56 years
  stale and rockets junk to the top of the queue.
- **`capacity` is not a reliable fill denominator.** 870 installed stations
  disagree with their own nameplate (`bikes + docks + disabled ≠ capacity`), so
  fill is measured against slots actually reported usable. Capacity is still the
  right input for the weight modifier — it is "how many riders does this station
  serve", not "how many docks work".
- **There is no borough field.** `system_regions` offers only "NYC District",
  "JC District", "Hoboken District" plus junk zones (`testzone`, `IC HQ`), and 13
  stations have no region at all. Boroughs are derived from coordinates in
  [src/data/boroughs.ts](src/data/boroughs.ts) against hand-traced outlines,
  validated against all 2,463 live stations with zero unknowns.

The client is written against the **auto-discovery document**, never hard-coded
feed URLs — Citi Bike's `gbfs.json` currently points at `gbfs.lyft.com`, and that
has moved before. Both feeds are parsed, not cast; a malformed field degrades one
station rather than blanking the board.

## Design

Direction, tokens and the reasoning behind each are in [tokens.md](tokens.md).
Short version: civic infrastructure, not SaaS — transit signage, route bullets
and municipal paperwork. Archivo Expanded Black for display, IBM Plex Mono for
every numeral, hairlines instead of boxes, and one loud element.

That element is the **score plate**: a bold mono numeral in a rounded square,
sized like a subway bullet, filled with the station's failure signal. Empty is
red and full is indigo deliberately — not two grades of one problem but opposite
truck actions, and the interface should teach that on sight. Outages are
ink-black because a dead dock is a mechanical failure, not a point on a supply
gradient; no amount of driving a truck there fixes it. The plate is identical in
the queue, Explain, Verify and the hover card, and clicking it anywhere opens
Explain — it is the brand and the primary navigation at once.

Motion is a single orchestrated moment: on refresh, re-ranked rows travel with a
200ms FLIP and changed plates tick. Nothing else animates, and
`prefers-reduced-motion` swaps the travel for a crossfade.

Accessibility is **100** in Lighthouse. Two notes on getting there without
touching the specified palette: the plate numerals are sized to WCAG's large-text
threshold (18.66px bold) so the specified red — 4.40:1, just under the 4.5:1
body-text minimum — is used at the 3:1 bar it comfortably clears; and amber and
red each gained a darker cut used *only* where the signal becomes a word rather
than a mark.

## Architecture notes

- **No backend in v1.** The GBFS feed serves `Access-Control-Allow-Origin: *`,
  so the browser reads it directly. Deployed as a static site on Cloudflare
  Pages; [public/_redirects](public/_redirects) rewrites all routes to
  `index.html` so shared station links survive a hard load.
- **Polling** every 60s while the tab is visible, paused on `visibilitychange`
  and aborted in flight when hidden. Failures back off 5s → 60s and keep the
  last good data on screen behind a banner rather than blanking the board.
- **State** is Zustand. The 1s "updated Xs ago" ticker subscribes separately from
  the queue, so a repainting clock does not repaint 2,400 rows.
- **Charts** are hand-rolled SVG (`FillBand`, `Sparkline`, `DockBar`) — no chart
  library.
- **The queue renders 100 rows at a time.** A dispatch board is read from the
  top; putting all 2,400 in the DOM costs interaction latency for nothing.

### Upgrade path

Verify is honest about being a session log: it records only while the tab is
open, and says so in the UI. [worker/](worker/) scaffolds the fix — a Cloudflare
Scheduled Worker snapshotting to D1 every 5 minutes — deliberately **not wired
up**, because shipping a backend that silently collects nothing would make Verify
look authoritative while answering from an empty table. It would also turn the
55-point threshold from a considered guess into something measurable against how
quickly stations at each score recover on their own.

The Worker imports the same `score.ts`; that module has no DOM or React
dependency precisely so the history and the live board can never disagree about
what a score means.

---

Station data from the operator's public GBFS feed. Not affiliated with or
endorsed by any operator.
