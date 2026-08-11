-- Dispatch snapshot schema (scaffold — not deployed). See README.md.

CREATE TABLE IF NOT EXISTS snapshot (
  station_id  TEXT    NOT NULL,
  -- Unix seconds, truncated to the 5-minute run boundary so a retried run
  -- overwrites rather than duplicating.
  t           INTEGER NOT NULL,
  score       INTEGER NOT NULL,
  category    TEXT    NOT NULL,
  signal      TEXT    NOT NULL,
  bikes       INTEGER NOT NULL,
  docks       INTEGER NOT NULL,
  needs_truck INTEGER NOT NULL,
  PRIMARY KEY (station_id, t)
);

-- Verify's main query is "everything since T", so time leads the index.
CREATE INDEX IF NOT EXISTS snapshot_t ON snapshot (t);
CREATE INDEX IF NOT EXISTS snapshot_station_t ON snapshot (station_id, t DESC);

-- Station names change and stations move; keeping them out of the snapshot row
-- avoids storing the same string 170k times a day.
CREATE TABLE IF NOT EXISTS station (
  station_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  borough    TEXT NOT NULL,
  capacity   INTEGER NOT NULL,
  lat        REAL NOT NULL,
  lon        REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Rolled up nightly so the raw table can be pruned to 30 days while the
-- long-run "does a high score predict recovery?" question stays answerable.
CREATE TABLE IF NOT EXISTS daily_outcome (
  station_id     TEXT    NOT NULL,
  day            TEXT    NOT NULL, -- YYYY-MM-DD
  flagged_runs   INTEGER NOT NULL,
  peak_score     INTEGER NOT NULL,
  minutes_flagged INTEGER NOT NULL,
  resolved       INTEGER NOT NULL,
  PRIMARY KEY (station_id, day)
);
