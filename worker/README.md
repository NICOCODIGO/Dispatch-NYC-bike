# Dispatch snapshot worker (scaffold — not wired up)

The Verify screen in the app is honest about a real limitation: it only records
while the tab is open. That makes it a session log, not evidence. This directory
holds the shape of the fix, deliberately **not deployed**.

Shipping a backend that silently collects nothing would be worse than shipping
none — Verify would look authoritative while answering from an empty table.

## What it would do

A [Cloudflare Scheduled Worker](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
runs every 5 minutes, independent of any browser:

1. Fetch the GBFS auto-discovery document and follow it to `station_information`
   and `station_status` (same discovery-first approach as `src/data/gbfs.ts`).
2. Score every station with the **same pure module** the UI uses
   (`src/model/score.ts`). That module has no DOM or React dependency precisely
   so it can run unchanged in a Worker — the board and the history can never
   disagree about what a score means.
3. Write one row per flagged station to D1.

Verify then reads a real time series instead of a session log.

## Why it matters

It turns the threshold from a considered guess into something measurable. With
weeks of history you can ask the question the app currently cannot:

- Does a high score actually predict that a vehicle arrives?
- How long does a station at 90 take to recover, versus one at 60?
- Is `NEEDS_VEHICLE_THRESHOLD = 55` the right line, or should it move by borough
  or time of day?

## Setup, when it is time

```bash
npx wrangler d1 create dispatch
# put the returned database_id into wrangler.toml
npx wrangler d1 execute dispatch --file=./schema.sql
npx wrangler deploy
```

Then point the app's Verify screen at a `/api/history` route on the Worker
instead of IndexedDB, and keep the IndexedDB path as the offline fallback.

## Cost note

At ~600 flagged stations per run, every 5 minutes, this writes roughly 170k rows
per day. D1's free tier covers the reads comfortably; the retention job in
`schema.sql` keeps the table bounded by rolling daily aggregates and dropping
raw rows past 30 days.
