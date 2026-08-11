import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Queue } from './screens/Queue';
import { Verify } from './screens/Verify';
import { startPolling } from './store/useDispatch';

export default function App() {
  useEffect(() => startPolling(), []);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only bg-[var(--ink)] px-4 py-2 text-[var(--paper)] focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to the queue
      </a>

      <Header />

      <main id="main" className="flex-1">
        <Routes>
          <Route path="/" element={<Queue />} />
          {/* A station is not a page — it is the queue with one row opened. The
              deep link survives so stations stay shareable, but arriving at one
              lands you on the board, not on an island. */}
          <Route path="/station/:id" element={<Queue />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}
