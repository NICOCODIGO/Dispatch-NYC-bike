import { useEffect } from 'react';
import { toStationRow } from '../data/adapt';
import { isOverdue, snapshotOf } from '../data/dispatchRun';
import { useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';

/**
 * Closes runs nobody confirmed.
 *
 * A crew that forgets to report done would otherwise leave a station marked
 * Dispatched forever — invisible to the queue and never measured. Once the ETA
 * lapses the run is closed against whatever the feed currently says, and
 * flagged `auto` so the record is honest about nobody having confirmed it.
 *
 * Runs on the poll rather than a timer: the only moment a fresh "after"
 * reading exists is when new feed data arrives, so closing a run at any other
 * instant would just re-measure the same numbers.
 */
export function RunWatcher() {
  const revision = useDispatch((s) => s.revision);
  const byId = useDispatch((s) => s.byId);
  const runs = useConsole((s) => s.runs);
  const completeRun = useConsole((s) => s.completeRun);

  useEffect(() => {
    const now = Date.now();
    for (const run of runs) {
      if (!isOverdue(run, now)) continue;
      const live = byId.get(run.stationId);
      // No live reading means the station has dropped out of the feed — better
      // to leave the run open than to close it against nothing.
      if (!live) continue;
      completeRun(run.id, snapshotOf(toStationRow(live)), true);
    }
    // `revision` is the dependency that matters: one sweep per poll.
  }, [revision, runs, byId, completeRun]);

  return null;
}
