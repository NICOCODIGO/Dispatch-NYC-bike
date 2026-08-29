import { useMemo, useState, type ReactNode } from 'react';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Card, Finding, Segmented, Td, Th } from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import {
  CRIPPLED_SHARE,
  HARDWARE_RANK_LABEL,
  hardwareLoad,
  hardwareTotals,
  rankHardware,
  type HardwareLoad,
  type HardwareRank,
} from '../data/hardware';

/**
 * Where a mechanic or a swap van goes.
 *
 * The Priority Queue ranks stations a *truck* can fix and deliberately excludes
 * hardware. This is the counterpart board: the same feed, ranked by the two
 * fields the queue throws away — `num_docks_disabled` and `num_bikes_disabled` —
 * plus the modelled low-charge count.
 *
 * Lifted out of Maintenance Operations, where it sat under the work-order queue
 * and was only seen by somebody who scrolled. It answers a different question
 * from a work order — "which sites are worst", not "who takes this one" — so it
 * gets its own screen and its own place in the nav.
 *
 * Three orderings rather than one composite score: a weighted "hardware score"
 * would need three invented constants, and this app already has one model whose
 * every constant it has to defend. Letting the reader pick the column claims
 * nothing.
 */
export function Hardware() {
  const scored = useDispatch((s) => s.scored);
  const phase = useDispatch((s) => s.phase);
  const [by, setBy] = useState<HardwareRank>('docks');

  // One clock for the whole render, threaded into the charge model.
  const now = Date.now();
  const rows = useMemo(() => hardwareLoad(scored, now), [scored, now]);
  const totals = useMemo(() => hardwareTotals(rows), [rows]);
  const ranked = useMemo(() => rankHardware(rows, by), [rows, by]);

  return (
    <>
      <PageHeader
        title="Hardware & Docks"
        subtitle="Work a truck cannot do, ranked worst first. Stations with dead docks, disabled bikes or flat batteries — the counts the dispatch queue sets aside because moving bikes will not change them."
      />

      <PageBody>
        <HardwareFinding
          rows={rows}
          totals={totals}
          loading={phase === 'loading' && scored.length === 0}
        />

        <section className="mt-3.5">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="eyebrow text-[10px]">Hardware backlog ({totals.stations})</h2>
              <span className="num text-[10px] text-[var(--color-ink-3)]">
                {totals.deadDocks} docks · {totals.brokenBikes} bikes
                {totals.lowCharge > 0 && ` · ${totals.lowCharge} flat`}
              </span>
              {totals.crippled > 0 && (
                <span className="text-[10px] font-semibold" style={{ color: TONE.empty.fg }}>
                  {totals.crippled} site{totals.crippled === 1 ? '' : 's'} mostly gone
                </span>
              )}
            </div>
            <Segmented
              label="Rank hardware by"
              value={by}
              onChange={(v) => setBy(v as HardwareRank)}
              options={(Object.keys(HARDWARE_RANK_LABEL) as HardwareRank[]).map((k) => ({
                value: k,
                label: HARDWARE_RANK_LABEL[k],
              }))}
            />
          </div>

          <Card className="overflow-hidden">
            {ranked.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12px] text-[var(--color-ink-2)]">
                {phase === 'loading' && scored.length === 0
                  ? 'Reading the live feed…'
                  : 'No station is reporting a dead dock, a disabled bike or a flat battery right now.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">
                    Stations ranked by hardware out of service, worst first.
                  </caption>
                  <thead>
                    <tr>
                      <Th>Station</Th>
                      <Th width={92}>Borough</Th>
                      <Th width={104}>Dead docks</Th>
                      <Th width={96}>Bikes</Th>
                      <Th width={104}>Low battery</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.slice(0, 40).map((r) => (
                      <HardwareRow key={r.stationId} row={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ranked.length > 40 && (
              <p className="border-t border-[var(--color-line)] px-3 py-2 text-[10px] text-[var(--color-ink-3)]">
                Showing the worst 40 of {ranked.length}. Unverified stations are left out — their
                counts are the ones the board has already decided not to trust.
              </p>
            )}
          </Card>
        </section>
      </PageBody>
    </>
  );
}

function HardwareFinding({
  rows,
  totals,
  loading,
}: {
  rows: HardwareLoad[];
  totals: ReturnType<typeof hardwareTotals>;
  loading: boolean;
}) {
  if (loading) {
    return <Finding icon="wrench" tone="mute" headline="Reading the live feed…" />;
  }

  if (rows.length === 0) {
    return (
      <Finding
        icon="wrench"
        tone="ok"
        headline="No hardware is reporting out of service."
        detail="Every station the feed returned shows its docks and bikes as usable, and no e-bike is modelled below the swap threshold."
      />
    );
  }

  const stats: { label: string; value: ReactNode; tone?: Tone }[] = [
    { label: 'dead docks', value: totals.deadDocks.toLocaleString('en-US'), tone: 'empty' },
    { label: 'broken bikes', value: totals.brokenBikes.toLocaleString('en-US'), tone: 'warn' },
  ];
  if (totals.lowCharge > 0) {
    stats.push({ label: 'flat batteries', value: totals.lowCharge, tone: 'warn' });
  }
  stats.push({ label: 'sites', value: totals.stations });
  if (totals.crippled > 0) {
    stats.push({ label: 'mostly gone', value: totals.crippled, tone: 'empty' });
  }

  return (
    <Finding
      icon="wrench"
      tone={totals.crippled > 0 ? 'empty' : 'warn'}
      headline={
        <>
          {totals.deadDocks.toLocaleString('en-US')} dock{totals.deadDocks === 1 ? '' : 's'} and{' '}
          {totals.brokenBikes.toLocaleString('en-US')} bike{totals.brokenBikes === 1 ? '' : 's'} are
          out of service across {totals.stations} station{totals.stations === 1 ? '' : 's'}.
        </>
      }
      detail={
        <>
          None of this is a truck job — a van full of bikes cannot re-seat a dock or swap a battery
          pack.{' '}
          {totals.siteFaults > 0 && (
            <>
              {totals.siteFaults} of the dead docks read as power or comms rather than mechanical,
              which is a site visit rather than a dock repair.{' '}
            </>
          )}
          {totals.crippled > 0 && (
            <strong className="font-semibold text-[var(--color-ink)]">
              {totals.crippled} site{totals.crippled === 1 ? ' has' : 's have'} more than half the
              rack down — a rebuild, not a repair.
            </strong>
          )}
        </>
      }
      stats={stats}
    />
  );
}

function HardwareRow({ row }: { row: HardwareLoad }) {
  const openStation = useConsole((s) => s.openStation);
  const crippled = (row.deadShare ?? 0) >= CRIPPLED_SHARE;

  return (
    <tr
      onClick={() => openStation(row.stationId)}
      className="cursor-pointer border-b border-[var(--color-line-soft)] transition-colors last:border-b-0 hover:bg-[var(--color-sunken)]"
    >
      <Td>
        {/* The name is a real button, not just a clickable row: a `<tr>` with an
            onClick is unreachable by keyboard, and this table is the only route
            to several of these stations. Same pattern the Priority Queue uses. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openStation(row.stationId);
          }}
          className="block min-w-0 cursor-pointer truncate text-left text-[12px] font-semibold text-[var(--color-ink)]"
        >
          {row.name}
        </button>
        {crippled && (
          <span className="mt-px block text-[10px]" style={{ color: TONE.empty.fg }}>
            {Math.round((row.deadShare ?? 0) * 100)}% of the rack is out
            {row.siteFaults > 0 && ' — faults look site-wide'}
          </span>
        )}
      </Td>
      <Td className="text-[11px] text-[var(--color-ink-2)]">{row.borough}</Td>
      <Td>
        <span
          className="num text-[11px] font-semibold"
          style={{ color: row.deadDocks > 0 ? TONE.empty.fg : 'var(--color-ink-3)' }}
        >
          {row.deadDocks}
        </span>
        <span className="num ml-1 text-[10px] text-[var(--color-ink-3)]">/ {row.totalDocks}</span>
      </Td>
      <Td>
        <span
          className="num text-[11px]"
          style={{ color: row.brokenBikes > 0 ? TONE.warn.fg : 'var(--color-ink-3)' }}
        >
          {row.brokenBikes}
        </span>
      </Td>
      <Td>
        {row.ebikes === 0 ? (
          <span className="text-[10px] text-[var(--color-ink-3)]">no e-bikes</span>
        ) : (
          <span className="num text-[11px] text-[var(--color-ink-2)]">
            {row.lowCharge}
            <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">of {row.ebikes}</span>
          </span>
        )}
      </Td>
    </tr>
  );
}
