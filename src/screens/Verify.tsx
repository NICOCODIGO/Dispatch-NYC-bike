import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SNAPSHOT_RETENTION_MS,
  SNAPSHOT_TOP_N,
  type SnapshotRow,
  clearSnapshots,
  readSnapshots,
} from '../data/snapshots';
import { NEEDS_TRUCK_THRESHOLD } from '../model/score';
import {
  OUTCOME_DEFINITIONS,
  OUTCOME_LABEL,
  buildTracks,
  countOutcomes,
  type Outcome,
  type Track,
} from '../model/verify';
import { useDispatch } from '../store/useDispatch';
import { ScorePlate } from '../components/ScorePlate';
import { Sparkline } from '../components/Sparkline';
import { DetailPanel } from '../components/DetailPanel';
import { formatAgo, formatClock } from '../lib/time';
import { cn } from '../lib/cn';

/**
 * Does the ranking actually predict what gets fixed?
 *
 * The rule for this screen: nothing is an unexplained verdict. Every count in
 * the summary filters the table, every outcome defines itself from the
 * constants that produced it, every delta shows both numbers it came from, and
 * every row opens into the full receipt. A verification screen that asks to be
 * taken on faith is not verification.
 *
 * It is also honest about being session-scoped — see the disclosure at the end.
 */

const OUTCOME_ORDER: Outcome[] = ['resolved', 'still-failing', 'worsened'];

const OUTCOME_COLOR: Record<Outcome, string> = {
  resolved: 'var(--signal-ok)',
  'still-failing': 'var(--ink-soft)',
  worsened: 'var(--signal-empty-ink)',
};

export function Verify() {
  const revision = useDispatch((s) => s.revision);
  const byId = useDispatch((s) => s.byId);
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const [filter, setFilter] = useState<Outcome | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readSnapshots(Date.now() - SNAPSHOT_RETENTION_MS).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const tracks = useMemo(() => (rows ? buildTracks(rows) : []), [rows]);
  const counts = useMemo(() => countOutcomes(tracks), [tracks]);
  const shown = useMemo(
    () => (filter ? tracks.filter((t) => t.outcome === filter) : tracks),
    [tracks, filter],
  );

  const window = useMemo(() => {
    if (tracks.length === 0) return null;
    return Date.now() - Math.min(...tracks.map((t) => t.firstSeen));
  }, [tracks]);
  const windowLabel =
    window !== null && window >= 60_000 ? `in the last ${formatAgo(window)}` : 'in this session';

  const selectedTrack = shown.find((t) => t.stationId === selectedId) ?? null;
  const selectedEntry = selectedId ? (byId.get(selectedId) ?? null) : null;
  const selectedIndex = shown.findIndex((t) => t.stationId === selectedId);

  const close = useCallback(() => {
    setSelectedId(null);
    const opener = openerRef.current;
    openerRef.current = null;
    requestAnimationFrame(() => opener?.focus());
  }, []);

  const step = useCallback(
    (delta: number) => {
      const next = shown[selectedIndex + delta];
      if (next) setSelectedId(next.stationId);
    },
    [shown, selectedIndex],
  );

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 sm:px-8">
      <h2 className="display text-[20px] text-[var(--ink)]">Verify</h2>

      {tracks.length === 0 ? (
        <p className="mt-3 max-w-[62ch] text-[16px] text-[var(--ink)]">
          {rows === null
            ? 'Reading this session’s snapshots…'
            : 'Nothing recorded yet. Every poll snapshots the worst truck-actionable stations; leave this tab open for a few minutes and their recovery will appear here.'}
        </p>
      ) : (
        <>
          {/* Each number is the filter for the rows it counts. */}
          <p className="mt-3 max-w-[65ch] text-[19px] leading-snug font-semibold text-[var(--ink)] sm:text-[21px]">
            Of {tracks.length} station{tracks.length === 1 ? '' : 's'} flagged {windowLabel},{' '}
            {OUTCOME_ORDER.map((o, i) => (
              <span key={o}>
                <OutcomeCount
                  outcome={o}
                  count={counts[o]}
                  active={filter === o}
                  onClick={() => setFilter(filter === o ? null : o)}
                />
                {i < OUTCOME_ORDER.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <button
              type="button"
              onClick={() => setFilter(null)}
              aria-pressed={filter === null}
              className={cn(
                'num border px-2.5 py-1',
                filter === null
                  ? 'border-[var(--ink)] font-semibold text-[var(--ink)]'
                  : 'border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink-soft)]',
              )}
            >
              All outcomes
            </button>
            {filter && (
              <span className="num text-[var(--ink-soft)]">
                Showing {shown.length} · {OUTCOME_LABEL[filter].toLowerCase()}
              </span>
            )}
          </div>

          <div className="mt-5 border border-[var(--line)] bg-[var(--surface)]">
            <table className="w-full border-collapse">
              <caption className="sr-only">
                Stations flagged this session, with their score history and current outcome.
              </caption>
              <thead>
                <tr>
                  <Th className="w-[84px]">Now</Th>
                  <Th>Station</Th>
                  <Th className="w-[172px]">History</Th>
                  <Th className="w-[156px]">Change</Th>
                  <Th className="w-[150px]">
                    <OutcomeHeader />
                  </Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <TrackRow
                    key={t.stationId}
                    track={t}
                    selected={selectedId === t.stationId}
                    onSelect={(el) => {
                      openerRef.current = el;
                      setSelectedId(t.stationId);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => void clearSnapshots().then(() => setRows([]))}
            className="mt-3 border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] text-[var(--ink-soft)] hover:border-[var(--ink-soft)] hover:text-[var(--ink)]"
          >
            Clear session history
          </button>
        </>
      )}

      <CollectionNote />

      {selectedEntry && (
        <DetailPanel
          entry={selectedEntry}
          index={selectedIndex >= 0 ? selectedIndex : 0}
          total={shown.length || 1}
          onPrev={selectedIndex > 0 ? () => step(-1) : null}
          onNext={selectedIndex >= 0 && selectedIndex < shown.length - 1 ? () => step(1) : null}
          onClose={close}
          history={selectedTrack}
        />
      )}
    </div>
  );
}

/** A count in the summary sentence that is also the filter for its own rows. */
function OutcomeCount({
  outcome,
  count,
  active,
  onClick,
}: {
  outcome: Outcome;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={OUTCOME_DEFINITIONS[outcome]}
      className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
      style={{
        color: OUTCOME_COLOR[outcome],
        textDecorationColor: active ? 'var(--accent)' : undefined,
        textDecorationThickness: active ? '2px' : undefined,
        textDecorationStyle: active ? 'solid' : undefined,
      }}
    >
      {count} {OUTCOME_LABEL[outcome].toLowerCase()}
    </button>
  );
}

/** The Outcome column header, with its definitions one click away. */
function OutcomeHeader() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="eyebrow inline-flex items-center gap-1.5 hover:text-[var(--ink)]"
      >
        Outcome
        <span
          aria-hidden="true"
          className="num inline-flex h-[14px] w-[14px] items-center justify-center rounded-full border border-[var(--line)] text-[9px] leading-none"
        >
          i
        </span>
        <span className="sr-only">Show how each outcome is defined</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-[310px] border border-[var(--line)] bg-[var(--surface)] p-3.5 text-left shadow-[0_1px_0_rgb(23_25_30/8%)]">
          <dl className="space-y-2.5">
            {OUTCOME_ORDER.map((o) => (
              <div key={o}>
                <dt className="text-[13px] font-semibold" style={{ color: OUTCOME_COLOR[o] }}>
                  {OUTCOME_LABEL[o]}
                </dt>
                <dd className="mt-0.5 text-[12px] leading-snug text-[var(--ink-soft)]">
                  {OUTCOME_DEFINITIONS[o]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

function TrackRow({
  track,
  selected,
  onSelect,
}: {
  track: Track;
  selected: boolean;
  onSelect: (el: HTMLElement) => void;
}) {
  const spanMinutes = Math.max(1, Math.round((track.lastSeen - track.firstSeen) / 60_000));

  return (
    <tr
      className="border-t border-[var(--line)] hover:bg-[var(--paper)]"
      style={selected ? { background: 'var(--paper)' } : undefined}
    >
      <Td style={selected ? { boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}>
        <ScorePlate score={track.currentScore} category={track.category} />
      </Td>

      <Td>
        <button
          type="button"
          onClick={(e) => onSelect(e.currentTarget)}
          className="block min-w-0 text-left"
        >
          <span className="block truncate text-[15px] text-[var(--ink)] underline-offset-2 hover:underline">
            {track.name}
          </span>
          <span className="block text-[12px] text-[var(--ink-soft)]">{track.borough}</span>
        </button>
      </Td>

      <Td>
        <Sparkline
          points={track.scores}
          times={track.readings.map((r) => r.t)}
          signal={track.signal}
          startLabel={formatClock(track.firstSeen).slice(0, 5)}
          endLabel={formatClock(track.lastSeen).slice(0, 5)}
        />
        <span className="num mt-0.5 block text-[10px] text-[var(--ink-soft)]">
          {spanMinutes}m span · {track.readings.length} reading
          {track.readings.length === 1 ? '' : 's'}
        </span>
      </Td>

      <Td>
        <ChangeCell track={track} />
      </Td>

      <Td>
        <span className="text-[13px] font-medium" style={{ color: OUTCOME_COLOR[track.outcome] }}>
          {OUTCOME_LABEL[track.outcome]}
        </span>
      </Td>
    </tr>
  );
}

/**
 * Both numbers the delta came from, then the delta. "+14" alone asks the reader
 * to take the arithmetic on trust; "86 → 100" shows its work.
 */
function ChangeCell({ track }: { track: Track }) {
  const { delta } = track;
  const tone =
    delta < 0 ? 'var(--signal-ok)' : delta > 0 ? 'var(--signal-empty-ink)' : 'var(--ink-soft)';

  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"
      title={`First flagged at score ${track.firstScore} (${formatClock(
        track.firstSeen,
      )}). Now ${track.currentScore} (${formatClock(track.lastSeen)}).`}
    >
      <span className="num text-[13px] tabular-nums text-[var(--ink-soft)]">
        {track.firstScore}
        <span className="mx-1" aria-hidden="true">
          →
        </span>
        <span className="font-semibold text-[var(--ink)]">{track.currentScore}</span>
      </span>
      <span
        className="num rounded-[3px] px-1.5 py-0.5 text-[11px] tabular-nums"
        style={{ color: tone, boxShadow: `inset 0 0 0 1px ${delta === 0 ? 'var(--line)' : tone}` }}
      >
        {delta > 0 ? '+' : ''}
        {delta}
      </span>
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn('eyebrow px-4 pt-4 pb-3 text-left align-bottom', className)}>
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={cn('px-4 py-3.5 align-middle', className)} style={style}>
      {children}
    </td>
  );
}

function CollectionNote() {
  return (
    <details className="mt-8 border-t border-[var(--line)] pt-4">
      <summary className="cursor-pointer list-none text-[14px] text-[var(--ink)]">
        <span className="num mr-2 text-[var(--ink-soft)]">▸</span>
        How this data is collected
      </summary>
      <div className="mt-3 max-w-[70ch] space-y-3 text-[13px] leading-relaxed text-[var(--ink-soft)]">
        <p>
          Snapshots are recorded only while this tab is open, and only for the {SNAPSHOT_TOP_N}{' '}
          worst truck-actionable stations per poll. Close the tab and the record stops; this is a
          session log, not a historical dataset, and it cannot tell you what happened overnight.
        </p>
        <p>
          In production a Cloudflare Scheduled Worker would poll every 5 minutes and write to D1,
          independent of any browser. Verify would then read a real time series and could answer
          the question that actually matters: does a high score predict that a truck arrives, and
          how long does it take? That also turns the threshold into something measurable — right
          now {NEEDS_TRUCK_THRESHOLD} is a considered guess.
        </p>
        <p>
          The worker is scaffolded in <code className="num text-[12px]">/worker</code> with its
          schema and a README, deliberately not wired up — shipping a backend that silently
          collects nothing would be worse than shipping none.
        </p>
      </div>
    </details>
  );
}
