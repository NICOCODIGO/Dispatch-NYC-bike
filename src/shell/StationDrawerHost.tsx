import { useMemo } from 'react';
import { ScoreDrawer } from '../views/ScoreDrawer';
import { toStationRow } from '../data/adapt';
import { durationIndex } from '../data/duration';
import { stationById } from '../mock/data';
import { useDispatch } from '../store/useDispatch';
import { useConsole } from '../state/useConsole';
import { useSessionHistory } from '../state/useHistory';

/**
 * Renders the open station's receipt, wherever it was opened from.
 *
 * Live first, fixtures second. The queue and the map hand over real GBFS
 * station ids; the zone tables and tickets still reference fixture ids.
 * Resolving in that order means both work during the transition, and the
 * fallback disappears on its own as each screen goes live.
 *
 * Duration is looked up here rather than passed in, because the drawer opens
 * from six different screens and only two of them hold the history. Building
 * the row without it made the receipt total disagree with the badge that
 * opened it.
 */
export function StationDrawerHost() {
  const openStationId = useConsole((s) => s.openStationId);
  const closeStation = useConsole((s) => s.closeStation);
  const byId = useDispatch((s) => s.byId);
  const { tracks } = useSessionHistory();
  const durations = useMemo(() => durationIndex(tracks), [tracks]);

  if (!openStationId) return null;

  const live = byId.get(openStationId);
  const row = live
    ? toStationRow(live, durations.get(openStationId))
    : stationById(openStationId);
  if (!row) return null;

  return <ScoreDrawer row={row} onClose={closeStation} />;
}
