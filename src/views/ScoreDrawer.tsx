import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import { Bar, Button, ScoreBadge } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { SCORE_NOTE, factorsFor, type StationRow } from '../mock/data';

/**
 * The receipt, as a drawer over the board.
 *
 * The queue stays on screen behind it: checking why a station scored what it
 * did should not cost you your place in the list. Escape closes, focus moves in
 * on open and is trapped until it does, and the opener gets focus back.
 */
export function ScoreDrawer({ row, onClose }: { row: StationRow; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const factors = factorsFor(row);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const total = factors.reduce((sum, f) => sum + f.points, 0);
  const pct = row.bikes !== null && row.docks > 0 ? Math.round((row.bikes / row.docks) * 100) : null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${row.name} — score breakdown`}
      className="drawer-in thin-scroll fixed inset-y-0 right-0 z-40 flex w-[330px] max-w-full flex-col overflow-y-auto border-l border-[var(--color-line)] bg-[var(--color-surface)] shadow-[-2px_0_16px_rgb(43_38_33/8%)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-ink)] outline-none"
        >
          <Icon name="clipboard-list" size={15} className="text-[var(--color-ink-2)]" />
          Score Breakdown
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close score breakdown"
          className="text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="flex-1 px-4 py-4">
        <h3 className="text-[14px] leading-tight font-semibold text-[var(--color-ink)]">
          {row.name}
        </h3>
        <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
          {row.borough} · <span className="num">{row.docks}</span> docks
        </p>

        <div className="mt-3.5 flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-sunken)] p-3">
          <ScoreBadge score={row.score} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-[var(--color-ink-2)]">Station fill level</p>
            <div className="mt-1.5">
              <Bar value={row.fill} tone={row.fillTone} height={6} />
            </div>
            <p className="num mt-1.5 text-[10px] text-[var(--color-ink-3)]">
              {pct === null ? 'unknown' : `${pct}% full`} ·{' '}
              {row.bikes === null ? '—' : row.bikes} bikes / {row.docks} docks
            </p>
          </div>
        </div>

        {factors.length > 0 && (
          <>
            <h4 className="eyebrow mt-5">How this score was calculated</h4>

            <ul className="mt-3 flex flex-col gap-3.5">
              {factors.map((f) => (
                <li key={f.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] leading-snug text-[var(--color-ink-2)]">
                      {f.label}
                    </span>
                    <span
                      className="num shrink-0 text-[11px] font-semibold"
                      style={{ color: TONE[f.tone].fg }}
                    >
                      +{f.points} <span className="font-normal">pts</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar value={f.share} tone={f.tone} height={4} />
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-3">
              <span className="text-[11px] text-[var(--color-ink-2)]">All factors combined</span>
              <span className="num text-[13px] font-semibold text-[var(--color-ink)]">
                = {total} / 100
              </span>
            </div>
          </>
        )}

        <p className="mt-4 rounded-lg bg-[var(--color-sunken)] p-3 text-[10px] leading-relaxed text-[var(--color-ink-3)]">
          {SCORE_NOTE}
        </p>
      </div>

      <div className="sticky bottom-0 flex flex-col gap-1 border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <Button variant="dark" icon="truck" className="w-full">
          Dispatch Truck Here
        </Button>
        <Button variant="ghost" onClick={onClose} className="w-full">
          Close
        </Button>
      </div>
    </div>
  );
}
