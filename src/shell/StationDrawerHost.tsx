import { ScoreDrawer } from '../views/ScoreDrawer';
import { stationById } from '../mock/data';
import { useConsole } from '../state/useConsole';

/**
 * Renders the open station's receipt, wherever it was opened from.
 *
 * Mounted once by the shell. Screens do not render the drawer themselves —
 * they call `openStation(id)` and this decides what appears.
 */
export function StationDrawerHost() {
  const openStationId = useConsole((s) => s.openStationId);
  const closeStation = useConsole((s) => s.closeStation);

  const station = openStationId ? stationById(openStationId) : null;
  if (!station) return null;

  return <ScoreDrawer row={station} onClose={closeStation} />;
}
