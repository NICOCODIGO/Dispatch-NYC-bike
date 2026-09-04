import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { startPolling } from './store/useDispatch';
import { AppShell } from './shell/AppShell';
import { PriorityQueue } from './views/PriorityQueue';
import { MapView } from './views/MapView';
import { VehicleDispatch } from './views/VehicleDispatch';
import { DispatchHistory } from './views/DispatchHistory';
import { Unverified } from './views/Unverified';
import { SiteHealth } from './views/SiteHealth';
import { Mechanics } from './views/Mechanics';
import { Hardware } from './views/Hardware';
import { Shift } from './views/Shift';
import { Analytics } from './views/Analytics';
import { ZoneView } from './views/ZoneView';

/**
 * Routes.
 *
 * Grouped by section — /dispatch, /fleet, /maintenance, /monitoring — so the URL
 * says which part of the console you are in and the sidebar accordion can derive
 * its open section straight from the path. The old flat paths (/map, /mechanics,
 * /unverified…) still resolve: each is a redirect to its new home, so bookmarks
 * and any link that slipped through the rename keep working.
 *
 * Rebalancing and the station receipt run on the live GBFS feed, through
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
        {/* Dispatch */}
        <Route path="/" element={<PriorityQueue />} />
        <Route path="/dispatch/map" element={<MapView />} />
        <Route path="/dispatch/history" element={<DispatchHistory />} />

        {/* Fleet */}
        <Route path="/fleet/vehicles" element={<VehicleDispatch />} />
        <Route path="/fleet/shift" element={<Shift />} />

        {/* Maintenance */}
        <Route path="/maintenance/orders" element={<Mechanics />} />
        <Route path="/maintenance/hardware" element={<Hardware />} />

        {/* Monitoring */}
        <Route path="/monitoring/unverified" element={<Unverified />} />
        <Route path="/monitoring/site-health" element={<SiteHealth />} />

        {/* Analytics */}
        <Route path="/analytics" element={<Analytics />} />

        {/* Zones */}
        <Route path="/zone/:slug" element={<ZoneView />} />

        {/* Redirects from the pre-section paths. */}
        <Route path="/map" element={<Navigate to="/dispatch/map" replace />} />
        <Route path="/history" element={<Navigate to="/dispatch/history" replace />} />
        <Route path="/shift" element={<Navigate to="/fleet/shift" replace />} />

        {/* Fleet operations was /trucks, then /fleet/trucks, and is now
            /fleet/vehicles — the crews run vans as well as box trucks, so the
            noun was wrong rather than merely dated. Both old paths are kept:
            renaming a route silently turns every bookmark into a redirect to
            the queue, which looks like the screen was deleted. */}
        <Route path="/trucks" element={<Navigate to="/fleet/vehicles" replace />} />
        <Route path="/fleet/trucks" element={<Navigate to="/fleet/vehicles" replace />} />
        <Route path="/mechanics" element={<Navigate to="/maintenance/orders" replace />} />
        <Route path="/unverified" element={<Navigate to="/monitoring/unverified" replace />} />
        <Route path="/dispatch" element={<Navigate to="/" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
