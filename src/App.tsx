import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { startPolling } from './store/useDispatch';
import { AppShell } from './shell/AppShell';
import { PriorityQueue } from './views/PriorityQueue';
import { MapView } from './views/MapView';
import { TruckDispatch } from './views/TruckDispatch';
import { DispatchHistory } from './views/DispatchHistory';
import { Unverified } from './views/Unverified';
import { Mechanics } from './views/Mechanics';
import { Analytics } from './views/Analytics';
import { ZoneView } from './views/ZoneView';

/**
 * Routes.
 *
 * Priority Queue and the station receipt run on the live GBFS feed, through
 * the adapter in `src/data/adapt.ts`. The remaining screens still render from
 * fixtures in `src/mock` — mostly because the feed has nothing to give them:
 * there are no vehicles, tickets or hardware telemetry in GBFS.
 */
export default function App() {
  // Polls every 60s while the tab is visible, backs off on failure, and keeps
  // the last good data on screen behind a banner rather than blanking.
  useEffect(() => startPolling(), []);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<PriorityQueue />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/trucks" element={<TruckDispatch />} />
        <Route path="/history" element={<DispatchHistory />} />
        <Route path="/unverified" element={<Unverified />} />
        <Route path="/mechanics" element={<Mechanics />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/zone/:slug" element={<ZoneView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
