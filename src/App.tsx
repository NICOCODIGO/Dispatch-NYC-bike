import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './shell/AppShell';
import { PriorityQueue } from './views/PriorityQueue';
import { MapView } from './views/MapView';
import { TruckDispatch } from './views/TruckDispatch';
import { Unverified } from './views/Unverified';
import { Mechanics } from './views/Mechanics';
import { Analytics } from './views/Analytics';
import { ZoneView } from './views/ZoneView';

/**
 * Routes.
 *
 * This build renders entirely from fixtures in `src/mock`. The GBFS client, the
 * scoring model and the polling store are intact and untouched in `src/data`,
 * `src/model` and `src/store` — nothing here imports them yet. Wiring the feed
 * back in means replacing the fixture imports inside `src/views`, not
 * rebuilding the views.
 */
export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<PriorityQueue />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/trucks" element={<TruckDispatch />} />
        <Route path="/unverified" element={<Unverified />} />
        <Route path="/mechanics" element={<Mechanics />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/zone/:slug" element={<ZoneView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
