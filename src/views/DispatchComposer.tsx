import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Button, ScoreBadge } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import type { StationRow } from '../data/stationRow';
import {
  composeDispatch,
  instructionFor,
  mailtoFor,
  smsFor,
} from '../content/dispatchMessage';
import { TRUCKS, TRUCK_STATE_LABEL, type Truck } from '../mock/data';
import { DEFAULT_ETA_MINUTES, snapshotOf } from '../data/dispatchRun';

/**
 * Turning a decision into something a driver receives.
 *
 * The board could rank stations perfectly and still be useless, because
 * nothing left the screen. This is the smallest honest version of the missing
 * step: pick a vehicle, read the instruction it generates, send it by whatever
 * channel actually exists, and have the board remember you did.
 *
 * No fleet backend is involved and none is pretended. The trucks are fixtures;
 * what is real is the instruction text, which is composed from live feed
 * values, and the record that a person decided something at a given time.
 */
type AvailabilityKey = 'now' | 'soon' | 'retask' | 'here';

const AVAILABILITY: Record<AvailabilityKey, string> = {
  now: 'Free now',
  soon: 'Free shortly',
  retask: 'Would need re-tasking',
  here: 'Already assigned here',
};

/**
 * What picking this vehicle costs.
 *
 * The dropdown says a truck is busy; this says what happens to the job it is
 * already doing. Choosing an En Route truck is not a scheduling inconvenience,
 * it is a decision to abandon another station, and that should be on screen at
 * the moment of the decision rather than discovered afterwards.
 */
function Cost({
  truck,
  existing,
  row,
}: {
  truck?: Truck;
  existing?: { stationName: string };
  row: StationRow;
}) {
  if (!truck) return null;

  if (existing) {
    return (
      <p className="mt-1.5 text-[10px] leading-snug" style={{ color: TONE.empty.fg }}>
        Truck {truck.id} is already on {existing.stationName}. Sending it here abandons that job —
        that station returns to the queue unserved.
      </p>
    );
  }

  if (truck.state === 'loading') {
    return (
      <p className="mt-1.5 text-[10px] leading-snug" style={{ color: TONE.warn.fg }}>
        Loading at {truck.depot}
        {truck.when ? ` — ${truck.when}` : ''}. It can take this job, but not immediately.
      </p>
    );
  }

  if (truck.state !== 'idle') {
    return (
      <p className="mt-1.5 text-[10px] leading-snug" style={{ color: TONE.warn.fg }}>
        Truck {truck.id} is {TRUCK_STATE_LABEL[truck.state].toLowerCase()} at {truck.where}. Adding{' '}
        {row.name} delays whatever it reaches next by roughly a full run.
      </p>
    );
  }

  return (
    <p className="mt-1.5 text-[10px] text-[var(--color-ink-3)]">
      Idle at {truck.depot} — free to leave now.
    </p>
  );
}

export function DispatchComposer({
  row,
  onClose,
}: {
  row: StationRow;
  onClose: () => void;
}) {
  const assignments = useConsole((s) => s.assignments);
  const dispatchTruck = useConsole((s) => s.dispatchTruck);

  /**
   * Grouped by what choosing this truck actually costs you.
   *
   * A flat list implies every vehicle is equally available, which is the one
   * thing a dispatcher most needs to be untrue — taking an En Route truck does
   * not just delay this job, it abandons another one.
   */
  const groups = useMemo(() => {
    const bucket = (t: Truck): AvailabilityKey => {
      if (assignments[t.id]?.stationId === row.id) return 'here';
      if (assignments[t.id]) return 'retask';
      if (t.state === 'idle') return 'now';
      if (t.state === 'loading') return 'soon';
      return 'retask';
    };
    const out: Record<AvailabilityKey, Truck[]> = { now: [], soon: [], retask: [], here: [] };
    for (const t of TRUCKS) out[bucket(t)].push(t);
    return out;
  }, [assignments, row.id]);

  const [truckId, setTruckId] = useState(
    () => (groups.now[0] ?? groups.soon[0] ?? TRUCKS[0])!.id,
  );
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const at = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const message = composeDispatch(row, truckId, at);
  const existing = assignments[truckId];

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const f = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context; the textarea below is
      // selectable, so the message is never trapped.
      setCopied(false);
    }
  };

  const confirm = () => {
    const truck = TRUCKS.find((t) => t.id === truckId);
    dispatchTruck({
      truckId,
      depot: truck?.depot ?? 'Unknown',
      stationId: row.id,
      stationName: row.name,
      borough: row.borough,
      instruction: instructionFor(row),
      // Captured now so the outcome can be measured against what was ordered
      // and against how the station actually stood at the moment of the order.
      kind: row.action?.kind === 'collect' ? 'collect' : 'drop',
      ordered: row.action?.bikes ?? 0,
      etaMinutes: DEFAULT_ETA_MINUTES,
      before: snapshotOf(row),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel dispatch"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgb(43_38_33/38%)]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Dispatch a truck to ${row.name}`}
        className="fade-in relative w-[440px] max-w-full overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_16px_48px_rgb(43_38_33/22%)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div className="min-w-0">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-[13px] font-semibold text-[var(--color-ink)] outline-none"
            >
              Dispatch a truck
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-2)]">
              Composes the instruction, records who decided, and marks the row.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            className="cursor-pointer text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <ScoreBadge score={row.score} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--color-ink)]">
                {row.name}
              </p>
              <p className="text-[11px] text-[var(--color-ink-3)]">
                {row.borough} · <span className="num">{row.docks}</span> docks
              </p>
            </div>
            <span
              className="num ml-auto rounded-md px-2 py-1 text-[11px] font-semibold whitespace-nowrap"
              style={{
                color: row.action?.kind === 'collect' ? TONE.flood.fg : TONE.empty.fg,
                backgroundColor:
                  row.action?.kind === 'collect' ? TONE.flood.bg : TONE.empty.bg,
              }}
            >
              {instructionFor(row)}
            </span>
          </div>

          <label className="mt-4 block">
            <span className="eyebrow text-[10px]">Assign to</span>
            <select
              value={truckId}
              onChange={(e) => setTruckId(e.target.value)}
              className="mt-1.5 w-full cursor-pointer rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2 text-[12px] text-[var(--color-ink)]"
            >
              {(Object.keys(AVAILABILITY) as AvailabilityKey[]).map((k) =>
                groups[k].length === 0 ? null : (
                  <optgroup key={k} label={AVAILABILITY[k]}>
                    {groups[k].map((t) => (
                      <option key={t.id} value={t.id}>
                        Truck {t.id} · {TRUCK_STATE_LABEL[t.state]} · {t.depot}
                        {assignments[t.id] ? ` — on ${assignments[t.id]!.stationName}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ),
              )}
            </select>
          </label>

          <Cost truck={TRUCKS.find((t) => t.id === truckId)} existing={existing} row={row} />

          <div className="mt-3.5">
            <span className="eyebrow text-[10px]">Message</span>
            <textarea
              readOnly
              value={message}
              rows={9}
              onFocus={(e) => e.currentTarget.select()}
              className="num mt-1.5 w-full resize-none rounded-md border border-[var(--color-line)] bg-[var(--color-sunken)] p-2.5 text-[10.5px] leading-relaxed text-[var(--color-ink-2)]"
            />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" icon={copied ? 'info' : 'clipboard-list'} onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <a
              href={mailtoFor(row, message)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-ink-3)]"
            >
              <Icon name="file-text" size={12} />
              Email
            </a>
            <a
              href={smsFor(message)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink)] hover:border-[var(--color-ink-3)]"
            >
              <Icon name="phone" size={12} />
              Text
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-line)] bg-[var(--color-sunken)] px-4 py-3">
          <p className="text-[10px] leading-snug text-[var(--color-ink-3)] italic">
            Fleet is a fixture — no vehicle is really notified.
          </p>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="dark" icon="truck" onClick={confirm}>
              Send &amp; mark dispatched
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
