# Architecture

Two diagrams. The first is the one that matters — it is the answer to every
"wait, isn't X the same as Y" question this codebase produces.

Regenerate only when the domain rules change, which should be rare and
deliberate. If you move files around, the second diagram goes stale first.

---

## Decision flow — what happens to one station

A station is scored, then routed, then judged. Three separate steps, in that
order, each owned by exactly one file. Nothing downstream modifies the score.

```mermaid
flowchart TD
  GBFS([GBFS live feed]) --> SCORE["scoreStation()<br/>model/score.ts"]
  SCORE --> BD["ScoreBreakdown<br/>category · score 0–100 · signal · staleness · fill"]

  BD --> LANE{"laneOf()<br/>model/triage.ts"}
  LANE -->|"not scored / healthy"| QUIET["quiet"]
  LANE -->|"no report in 60 min"| UNVER["unverified"]
  LANE -->|"signal = outage"| MECH["mechanic"]
  LANE -->|"empty · full · starving · flooded"| VEHICLE["vehicle"]

  UNVER --> VER
  MECH --> VER
  VEHICLE --> VER{"verdictFor()<br/>data/verdict.ts"}

  VER -->|"lane = unverified"| VU["unverified<br/>no verdict — score is hypothetical"]
  VER -->|"lane = mechanic"| VM["mechanic<br/>send a technician"]
  VER -->|"score ≥ 70"| VC["critical<br/>jumps the queue"]
  VER -->|"score ≥ 55"| VD["dispatch<br/>worth a trip"]
  VER -->|"under 55"| VB["below<br/>short on bikes, no vehicle"]

  VC --> Q["applyFilters()<br/>model/queue.ts"]
  VD --> Q
  VB --> Q
  Q --> RANKED[["Ranked queue — vehicle lane only"]]
```

**Read the `below` node.** That is a station genuinely short on bikes that does
not get a vehicle. "Short on bikes" is a *category*; "needs a vehicle" is a
*verdict*. They are different questions and the diagram is where that stops
being confusing.

Two ordering rules the diagram encodes:

- **Staleness outranks everything in `laneOf`.** An "unusable" reading is
  derived from counts, so untrusted counts mean an untrusted verdict.
- **`verdictFor` checks lane before score.** Otherwise a stale station computes
  a high score off old counts and renders a big red number above the words
  "no vehicle needed yet".

---

## Layering

Strict one-directional. Nothing below reaches up.

```mermaid
flowchart LR
  DATA["data/<br/>feed adapters,<br/>derived facts"] --> MODEL["model/<br/>pure functions:<br/>score, triage,<br/>verdict, summary"]
  MODEL --> STORE["store/ · state/<br/>zustand,<br/>session state"]
  MODEL --> SIM["sim/<br/>fleet simulation"]
  STORE --> VIEWS["views/<br/>screens"]
  SIM --> VIEWS
  CONTENT["content/<br/>prose, labels,<br/>definitions"] --> VIEWS
  UI["ui/<br/>presentational<br/>primitives"] --> VIEWS
  VIEWS --> SHELL["shell/<br/>AppShell, sidebar,<br/>drawer hosts"]
```

`model/` is pure — no React, no fetching, no implicit clock. That is why it is
the only layer with real test coverage and the safe place to work.
