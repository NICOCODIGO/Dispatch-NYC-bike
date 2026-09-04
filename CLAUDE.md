# CLAUDE.md

Dispatch — a bikeshare rebalancing triage board. Scores every Citi Bike station 0–100 for urgency from the live GBFS feed, routes each to the crew that can actually fix it, and shows the full derivation of every number.

Live: city-bike-sigma.vercel.app

---

## Commands

```bash
npm run dev         # vite dev server
npm run typecheck   # tsc -b --noEmit
npm run test        # vitest run
npm run build       # tsc -b && vite build
```

Stack: React 18 · TypeScript 5.7 · Vite 6 · Tailwind 4 · Zustand 5 · react-router 6 · mapbox-gl · Vitest 2.

---

## The vocabulary

**Read this before changing anything.** Three separate axes get confused constantly because they overlap in plain English. They are not the same and must never be collapsed.

### 1. Category — *what is wrong*

Set by `scoreStation` in `model/score.ts`. Derived from bike/dock counts and operator flags.

| Category | Meaning | Base |
|---|---|---|
| `unusable` | Installed, neither renting nor returning, or no usable slots. A brick. | 90 |
| `outage` | Operator flagged one direction closed. | 85 |
| `empty` | Zero rentable bikes. | 70 |
| `full` | Zero open docks. | 70 |
| `starving` | Fill ratio ≤ 0.15. Ramps 45 → 70 as it approaches empty. | 45 |
| `flooded` | Fill ratio ≥ 0.85. Ramps 45 → 70 as it approaches full. | 45 |
| `healthy` | Drift from a 50/50 mix, 0–20. Never competes with a real failure. | 0–20 |
| `not_installed` | — | — |

### 2. Lane — *who can fix it*

Set by `laneOf(breakdown)` in `model/triage.ts`. Routing happens **after** scoring and never modifies it.

| Lane | Contains | Fixed by |
|---|---|---|
| `vehicle` | empty, full, starving, flooded | Moving bikes between stations |
| `mechanic` | outage, unusable | A technician. A vehicle full of bikes cannot help. |
| `unverified` | Counts older than 60 min | Nobody — go look |
| `quiet` | healthy, not_installed | Nothing to dispatch |

Lane assignment is priority-ordered and **staleness outranks everything**: an "unusable" verdict is derived from counts, so if the counts aren't trusted, neither is the verdict.

### 3. Verdict — *whether to send*

Set by `verdictFor(breakdown, score)` in `data/verdict.ts`. This is the only place the thresholds are compared.

- `NEEDS_VEHICLE_THRESHOLD = 55` — worth a trip
- `CRITICAL_THRESHOLD = 70` — jumps the queue

Verdicts: `critical` · `dispatch` · `below` · `unverified` · `mechanic`. Use `wantsVehicle(kind)` to test whether a vehicle should actually go.

### Why these three are not interchangeable

> **"Short on bikes" is a category. "Needs a vehicle" is a verdict. They are different questions with different answers.**

- A `starving` station scoring 48 is short on bikes and does **not** need a vehicle — it's below the dispatch line.
- A station with zero bikes that hasn't reported in 90 minutes is `unverified`. It has **no verdict at all**, and its score is shown only as "what it would score if the counts were trusted."
- An `outage` station with zero bikes needs a **mechanic**, not a vehicle, regardless of score.

Score answers *how bad*. Lane answers *who goes*. Verdict answers *do we go now*. Conflating score and lane once put broken docks at the top of a rebalancing queue; conflating score and verdict once rendered a big red number above the words "no vehicle needed yet."

### Other terms

`src/content/definitions.tsx` holds the full user-facing glossary — 30+ terms, each with a plain meaning and the mechanism. **When adding a domain term to the UI, add it there**; prose is auto-linkified by `linkifyText` / `linkifyNode`, so a term defined there explains itself everywhere it appears.

Key ones: *staleness* (up to 10 pts after 15 min; dropped entirely past 60) · *capacity weight* (0.75–1.25, scaled against the network's p90 station size) · *usable slots* (bikes + open docks, **not** the nameplate capacity) · *relocatable* · *realization rate* · *recovery rate*.

---

## Architecture

Strict one-directional layering. Nothing below reaches up.

```
data/     Feed adapters, derived facts. GBFS in, typed records out.
model/    Pure functions. Scoring, triage, verdicts, summary, work orders.
sim/      Fleet simulation.
state/    Zustand + hooks. Session state.
store/    useDispatch — filters, sort, selection.
content/  All prose, labels, definitions, column specs. No decisions.
ui/       Presentational primitives. No domain logic.
views/    Screens. Compose the above.
shell/    AppShell, sidebar, drawer hosts, run watcher.
```

Diagrams of both the decision flow and this layering: `docs/architecture.md`. Read the decision-flow diagram before touching `score.ts`, `triage.ts`, `verdict.ts` or `queue.ts`.

**`model/` is pure.** No React, no fetching, no `Date.now()` passed implicitly — the caller owns the feed and the clock. This is why `model/` is the only layer with real test coverage, and why it's the safe place to work.

**`content/` holds wording, `model/` holds decisions.** A hover card has room for eight words and a drawer has room for a paragraph; they share the *decision*, never the sentence.

---

## Do not

- **Do not recompute a score anywhere but `model/score.ts`.** `ScoreBreakdown` carries every input, intermediate and contribution specifically so the Explain screen renders the derivation with zero recomputation. There is no second copy of the formula and there must never be.
- **Do not compare against `NEEDS_VEHICLE_THRESHOLD` or `CRITICAL_THRESHOLD` in a component.** Call `verdictFor`. Four surfaces once did this separately and silently diverged.
- **Do not route on category.** Route on `laneOf`. A vehicle cannot fix a dead dock.
- **Do not add demand, time of day, or weather to the score.** Deliberately excluded — they would make it more accurate and much harder to audit, and a dispatcher who cannot audit the number will not act on it.
- **Do not let mechanic or unverified stations into the ranked queue.** The queue answers one question and they are not an answer to it.
- **Do not use nameplate capacity as a fill denominator.** Use reported usable slots; hundreds of stations disagree with their own nameplate.
- **Do not put domain logic in `ui/`** or prose in `model/`.

---

## Working in this repo

**Safe to hand off with a narrow context** — pure, tested, pattern-rich:
`model/*` · `data/*` · `sim/fleet.ts` · `lib/*`

Every one of these has a `.test.ts` beside it. Point at the file plus its test, ask for the change plus the test case, run `npm run test`.

**Handle carefully** — large, untested, and the source of most rework:

| File | Size |
|---|---|
| `views/PriorityQueue.tsx` | 56 KB |
| `views/ScoreDrawer.tsx` | 48 KB |
| `ui/primitives.tsx` | 38 KB |
| `views/VehicleDispatch.tsx` | 31 KB |
| `views/Mechanics.tsx` | 31 KB |

These are too large to load as context alongside anything else, and none have tests. Before asking for a change inside one, extract the piece being changed into its own file. Splitting first is cheaper than three rounds of failed edits.

**Conventions**
- Doc comment at the top of each `model/` and `data/` file stating what it decides and why — including rejected alternatives. This is the existing house style; keep it.
- Tests live beside the source as `<name>.test.ts`.
- Tailwind 4 with CSS variables (`var(--color-ink-3)`); design tokens in `tokens.md` and `index.css`.

---

<!--
SEEDED, NOT COMPLETE. Written from src/model/{score,triage,situation,queue}.ts,
src/data/verdict.ts, src/content/{definitions,clauses}, package.json.
8 files of ~90 read.

Extend as you go — especially "Do not". Every time you reject an approach in a
session, one line goes here, or you re-litigate it in the next session.
-->
