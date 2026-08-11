# Dispatch — design tokens

Direction: **civic infrastructure, not SaaS.** The reference world is transit signage,
route bullets, departure boards and municipal paperwork. Confident, utilitarian,
typographic. No glassmorphism, no gradients, no shadow deeper than 1px, no decorative
illustration, no dark mode in v1.

All tokens live in [src/index.css](src/index.css) inside `@theme` (which emits them as
CSS variables *and* generates Tailwind utilities from the same source, so a utility and a
hand-written `var()` can never drift apart). The brief's short names (`--ink`, `--paper`, …)
are aliased to the theme values in `:root`.

## Color

| Token | Value | Used for |
| --- | --- | --- |
| `--paper` | `#F7F7F5` | Page background |
| `--surface` | `#FFFFFF` | Queue table and panels |
| `--ink` | `#16181D` | Primary text |
| `--ink-soft` | `#5B616B` | Secondary text, rail, eyebrows |
| `--line` | `#E3E4E1` | Hairlines — **the only border color**, used sparingly |
| `--signal-empty` | `#D6453D` | Station starving / empty |
| `--signal-full` | `#4B44C9` | Station flooding / full |
| `--signal-outage` | `#16181D` | Outage / unusable — ink-black plates |
| `--signal-ok` | `#1F7A46` | **Only** Verify "resolved" + the healthy filter chip |
| `--amber` | `#C97B12` | Staleness **marks**: plate notch, banner rules |
| `--amber-ink` | `#A9640A` | Staleness **text** — see below |

### The one addition to the specified palette

`#C97B12` measures **3.32:1** on white. That clears the 3:1 bar for graphical
objects but sits under the 4.5:1 minimum for body text — and most staleness
warnings *are* small text ("12h ago", "reported never", the `+10` line item).
Rather than quietly darken a specified token, the hue does double duty: `--amber`
still draws every non-text mark, and `--amber-ink` (**4.65:1**) draws amber text.
Same signal, legible at 13px, and Lighthouse accessibility stays at 100.

Empty is red and full is indigo deliberately — they are not two grades of one problem.
They need opposite truck actions (drop bikes off vs. pick bikes up), and a dispatcher
should be able to read which is which from across the room without reading a word.
Outages are ink-black because a broken station is a mechanical failure, not a point on a
supply gradient — no amount of driving a truck there fixes a dead dock.

Green is disciplined to the point of near-absence. If "fine" were colored, the eye would
have to filter it out to find the failures; instead, healthy stations are quiet grey text
and the colored plates are the only loud thing on the page.

## Type

| Role | Family | Setting |
| --- | --- | --- |
| Wordmark, section headers | Archivo | `wght 900`, `wdth 125%` (`.display-black`) |
| Sub-heads, hero sentence | Archivo | `wght 800`, `wdth 118%` (`.display`) |
| Body copy | Archivo | `wght 400`, normal width |
| **Every numeral** | IBM Plex Mono | tabular, `tnum` + slashed `zero` (`.num`) |
| Eyebrow labels | Archivo | 11px, `wght 600`, `0.09em` tracking, uppercase, `--ink-soft` |

Archivo ships as a two-axis variable font (`wght` 100–900, `wdth` 62–125%), so the
expanded display cut is the same file as body copy — one download, no faux-bold.

Sentence case everywhere except eyebrows. Every number in the app is instrumentation and
is set in mono with tabular figures; this is also what makes refresh cause **zero layout
shift** — digits swap without changing width.

## Signature element — the score plate

The urgency score renders as a bold Plex Mono numeral in a rounded-square plate, sized
like a subway route bullet, filled with the station's failure signal color, numeral in
white. It is the one place color is loud.

The plate is identical in the queue, the Explain header, the Verify timeline and the hover
card, and clicking it anywhere opens Explain for that station. That consistency is the
point: it is the app's brand and its primary navigation at the same time.

Sizes: `sm` 34px (queue rows) · `md` 44px (verify, cards) · `lg` 76px (Explain header).

## Structure

- Hairlines separate. **Boxes are reserved for plates and interactive cards.** The six
  summary stats are one hairline-divided strip, not six cards.
- The ranked queue owns ~2/3 of desktop width and is first in the DOM.
- The failure breakdown lives in a right rail set in soft ink with thin bars — quieter
  than the queue by construction.
- The situation sentence is the hero: large Archivo, ink on paper, no banner box.

## Motion

Exactly one orchestrated moment: on data refresh, changed rows re-sort with a ~200ms FLIP
transform and changed score plates tick. Nothing else animates. Under
`prefers-reduced-motion` the movement is replaced by a 200ms crossfade — the information
(this row changed) survives; only the travel is removed.
