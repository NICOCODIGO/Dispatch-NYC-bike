# TASKS

Small jobs, current phase only. One at a time, each through the loop in
`AI-WORKFLOW.md` §1. Delete them as they land; add the next ones when this list
empties.

**Current phase — close the test gap in `model/`.** Every file in `model/` and
`data/` has a `.test.ts` beside it except two. Those two are the files that
decide routing, which makes them the worst two to have uncovered.

Phase complete when: `model/` has 100% file coverage by test file, and
`npm run test` is green.

---

### 1. `model/triage.test.ts`

`laneOf()` has no test. It is the function that decides which crew gets sent.

Cover each branch in priority order — not scored → `quiet`, `staleness
.notReporting` → `unverified`, `signal === 'outage'` → `mechanic`, `category
=== 'healthy'` → `quiet`, everything else → `truck`.

The case that actually matters: a breakdown that is **both** `outage` and
not-reporting must return `unverified`, not `mechanic`. That precedence is the
whole point of the function and nothing currently protects it.

Also cover `triage()` preserving worst-first order within each lane, and
`mechanicFault()` / `unverifiedReason()` string branches.

**Done when:** every branch of `laneOf` has an assertion, the precedence case
is explicit, `npm run test` green, `triage.ts` unmodified.

---

### 2. `model/queue.test.ts`

`applyFilters()` has no test. Follow the pattern in `model/summary.test.ts`.

Cover: empty category filter returns the truck lane only · selecting `healthy`
or `not_installed` pulls in `quiet` but **never** `mechanic` or `unverified` ·
borough filter · search across name/shortName/borough · each `SortKey` ·
`compareByUrgency` as the tie-break · nulls sorting last.

The invariant worth an explicit test: no combination of filters can put a
`mechanic` or `unverified` station into the ranked queue.

**Done when:** the invariant above has its own named test.

---

### 3. Split `views/PriorityQueue.tsx` (56 KB)

Too large to load as context alongside anything else, and untested. Do not
change behaviour in this task — extraction only, so the diff is reviewable.

Pull out, in this order, one commit each: the row/cell renderers → the filter
bar → the detail-panel prev/next wiring. Stop when the remaining file is under
~15 KB.

**Done when:** each extracted piece is its own file, the app renders
identically, and `npm run test` and `npm run build` are green after every
commit.

---

## Not this phase

- `views/` and `ui/` test coverage generally — after the split, not before.
- Splitting `ScoreDrawer.tsx` (48 KB) and `ui/primitives.tsx` (38 KB).
- Pinning exact dependency versions (`package.json` currently uses `^` ranges).
