/**
 * Session snapshot store for the Verify screen.
 *
 * Every successful poll writes the currently-flagged stations here so Verify
 * can ask "did the stations we flagged actually get fixed?". This is honest but
 * limited: it only records while the tab is open. The production shape — a
 * Cloudflare Scheduled Worker writing to D1 every 5 minutes — is scaffolded in
 * /worker and described in the UI, but nothing here talks to it.
 *
 * Hand-rolled rather than pulling in `idb`: the surface used is four calls, and
 * a dependency would be more code than this file.
 */

import type { Signal, StationCategory } from '../model/score';

const DB_NAME = 'dispatch';
const DB_VERSION = 1;
const STORE = 'snapshots';

/** Keep roughly the last 6 hours of a session. */
export const SNAPSHOT_RETENTION_MS = 6 * 60 * 60 * 1000;

/** Hard ceiling on rows, so a tab left open overnight cannot grow without
 *  bound. At 60 flagged stations per minute-poll this is about 2.5 hours. */
export const SNAPSHOT_ROW_CAP = 9_000;

/** How many of the worst flagged stations each poll records. */
export const SNAPSHOT_TOP_N = 60;

export interface SnapshotRow {
  /** `${stationId}:${t}` — unique per station per poll. */
  id: string;
  stationId: string;
  name: string;
  borough: string;
  /** Poll timestamp, epoch ms. */
  t: number;
  score: number;
  category: StationCategory;
  signal: Signal;
  needsTruck: boolean;
  /** Counts at this reading, so Verify can show what the score was made of.
   *  Optional because rows written before this field existed remain readable. */
  bikes?: number;
  docks?: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    // Private-mode browsers and hardened settings can refuse IndexedDB
    // outright. Verify degrades to "no history yet" rather than breaking.
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('t', 't');
        store.createIndex('stationId', 'stationId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function putSnapshot(rows: SnapshotRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    for (const row of rows) store.put(row);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
}

export async function readSnapshots(sinceMs: number): Promise<SnapshotRow[]> {
  const db = await openDb();
  if (!db) return [];

  return new Promise((resolve) => {
    const out: SnapshotRow[] = [];
    const store = tx(db, 'readonly');
    const range = IDBKeyRange.lowerBound(sinceMs);
    const req = store.index('t').openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      out.push(cursor.value as SnapshotRow);
      cursor.continue();
    };
    req.onerror = () => resolve(out);
  });
}

/** Drops rows past the retention window, then trims oldest-first to the cap. */
export async function pruneSnapshots(now: number): Promise<void> {
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    const index = store.index('t');

    const expired = index.openCursor(IDBKeyRange.upperBound(now - SNAPSHOT_RETENTION_MS));
    expired.onsuccess = () => {
      const cursor = expired.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });

  // Second pass for the hard cap, oldest first.
  const db2 = await openDb();
  if (!db2) return;
  const total = await new Promise<number>((resolve) => {
    const req = tx(db2, 'readonly').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
  if (total <= SNAPSHOT_ROW_CAP) return;

  const excess = total - SNAPSHOT_ROW_CAP;
  await new Promise<void>((resolve) => {
    const t = db2.transaction(STORE, 'readwrite');
    let removed = 0;
    const req = t.objectStore(STORE).index('t').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || removed >= excess) {
        resolve();
        return;
      }
      cursor.delete();
      removed++;
      cursor.continue();
    };
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
  });
}

export async function clearSnapshots(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
  });
}
