import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Donut, Legend, LineChart, LineLegend } from '../ui/charts';
import {
  Bar,
  Button,
  Card,
  Finding,
  FixtureNote,
  ScoreBadge,
  Select,
  Td,
  Th,
  TonePill,
} from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { TipBody, TipTitle, Tooltip } from '../ui/Tooltip';
import { COLUMN_HELP } from '../content/columns';
import { focusHref } from '../state/useFocus';
import { useConsole } from '../state/useConsole';
import { stuckStations, useSessionHistory } from '../state/useHistory';
import { boroughRollup } from '../data/insights';
import { OUTCOME_LABEL } from '../model/verify';
import { useDispatch } from '../store/useDispatch';
import { formatAgo } from '../lib/time';
import { DEMAND_ACTUAL, DEMAND_PREDICTED, DEMAND_X_LABELS, KPIS } from '../mock/data';

/**
 * The aggregate view — the one screen about the network rather than a station
 * on it, and the only one that can answer whether any of this is working.
 *
 * Three questions in order: what is the network's state, is it improving, and
 * what is nobody dealing with. The first is a snapshot the feed answers
 * directly; the other two need history, which the session snapshot store has
 * been quietly accumulating on every poll.
 */
export function Analytics() {
  const [range, setRange] = useState('session');

  const summary = useDispatch((s) => s.summary);
  const scored = useDispatch((s) => s.scored);
  const { tracks, outcomes, windowMs, readings } = useSessionHistory();

  const stuck = tracks ? stuckStations(tracks) : [];
  const flagged = tracks?.length ?? 0;
  const window = windowMs !== null && windowMs > 60_000 ? formatAgo(windowMs) : null;

  return (
    <>
      <PageHeader
        title="Network Performance"
        subtitle={
          summary
            ? `How ${summary.total.toLocaleString('en-US')} stations are behaving, whether the ones we flagged are recovering, and which are being left to rot.`
            : 'Reading the live feed…'
        }
        actions={
          <>
            <Select
              label="Time range"
              value={range}
              onChange={setRange}
              options={[{ value: 'session', label: window ? `This session · ${window}` : 'This session' }]}
            />
            <Button variant="dark" icon="download">
              Export
            </Button>
          </>
        }
      />

      <PageBody>
        <RecoveryFinding
          flagged={flagged}
          outcomes={outcomes}
          window={window}
          readings={readings}
          loading={tracks === null}
        />

        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <FillInventory />
          <StuckPanel stuck={stuck} loading={tracks === null} window={window} />
        </div>

        <BoroughPressure scored={scored} />

        <Card className="mt-3.5">
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">
                Demand forecasting
              </h2>
              <p className="mt-0.5 text-[10px]" style={{ color: TONE.warn.fg }}>
                Predicted vs actual system volume (24h)
              </p>
            </div>
          </div>
          <div className="px-4 pb-4">
            <LineLegend />
            <div className="mt-2">
              <LineChart
                actual={DEMAND_ACTUAL}
                predicted={DEMAND_PREDICTED}
                xLabels={DEMAND_X_LABELS}
                yMax={200}
                yStep={50}
                height={200}
                yTitle="Trips / Hour"
              />
            </div>
            <FixtureNote>
              Fixture. Trip volume is not in the station feed — it needs the operator&rsquo;s trip
              history, published monthly as a separate dataset. Total trips ({KPIS.trips}) and
              average rebalance time ({KPIS.rebalance}m) come from the same missing source.
            </FixtureNote>
          </div>
        </Card>
      </PageBody>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Is it getting better?
--------------------------------------------------------------------------- */

function RecoveryFinding({
  flagged,
  outcomes,
  window,
  readings,
  loading,
}: {
  flagged: number;
  outcomes: Record<string, number>;
  window: string | null;
  readings: number;
  loading: boolean;
}) {
  const resolved = outcomes.resolved ?? 0;
  const failing = outcomes['still-failing'] ?? 0;
  const worsened = outcomes.worsened ?? 0;

  if (loading) {
    return (
      <Finding icon="line-chart" headline="Reading this session's history…" tone="mute" />
    );
  }

  if (flagged === 0) {
    return (
      <Finding
        icon="line-chart"
        tone="mute"
        headline="Nothing has been watched long enough to judge yet."
        detail={
          <>
            The board snapshots every flagged station on each poll, but only while this tab is
            open. Leave it running for a few minutes and this becomes a real recovery record —
            which stations got fixed, which did not, and which got worse. A scheduled worker is
            scaffolded in <code className="num text-[10px]">/worker</code> to make it survive a
            page reload.
          </>
        }
      />
    );
  }

  // The verdict is the ratio, not the raw count: two recoveries out of three is
  // a network being managed, two out of forty is a network being watched.
  const share = resolved / flagged;
  const tone: Tone = share >= 0.4 ? 'ok' : share >= 0.15 ? 'warn' : 'empty';
  const verdict =
    share >= 0.4
      ? 'Most of what was flagged is recovering.'
      : share >= 0.15
        ? 'Some recovery, but most flagged stations are still failing.'
        : 'Almost nothing flagged this session has recovered.';

  return (
    <Finding
      icon={share >= 0.4 ? 'trending-down' : 'trending-up'}
      tone={tone}
      headline={verdict}
      detail={
        <>
          Of {flagged} station{flagged === 1 ? '' : 's'} flagged{' '}
          {window ? `in the last ${window}` : 'this session'}, {resolved} dropped back below the
          threshold, {failing} are unchanged and {worsened} have got worse. Based on {readings}{' '}
          poll{readings === 1 ? '' : 's'} — recording stops when this tab closes.
        </>
      }
      stats={[
        { label: OUTCOME_LABEL.resolved, value: resolved, tone: 'ok' },
        { label: OUTCOME_LABEL['still-failing'], value: failing, tone: 'mute' },
        { label: OUTCOME_LABEL.worsened, value: worsened, tone: 'empty' },
        { label: 'recovery rate', value: `${Math.round(share * 100)}%`, tone },
      ]}
    />
  );
}

/* ---------------------------------------------------------------------------
   Who is being left to rot.
--------------------------------------------------------------------------- */

function StuckPanel({
  stuck,
  loading,
  window,
}: {
  stuck: ReturnType<typeof stuckStations>;
  loading: boolean;
  window: string | null;
}) {
  const openStation = useConsole((s) => s.openStation);
  const deteriorating = stuck.filter((s) => s.deteriorating).length;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">
            Nobody is fixing these
          </h2>
          <p className="mt-0.5 text-[10px]" style={{ color: TONE.warn.fg }}>
            Flagged the whole time they have been watched, and still failing
          </p>
        </div>
        {deteriorating > 0 && <TonePill label={`${deteriorating} deteriorating`} tone="empty" />}
      </div>

      {loading ? (
        <p className="border-t border-[var(--color-line)] px-4 py-10 text-center text-[12px] text-[var(--color-ink-3)]">
          Reading session history…
        </p>
      ) : stuck.length === 0 ? (
        <p className="border-t border-[var(--color-line)] px-4 py-10 text-center text-[12px] text-[var(--color-ink-2)]">
          Nothing has been failing long enough to count as neglected
          {window ? ` in the last ${window}` : ' yet'}.
        </p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <Th width={62} help={COLUMN_HELP.score}>
                Now
              </Th>
              <Th width={34} />
              <Th>Station</Th>
              <Th width={104} align="right" help={COLUMN_HELP.failingFor}>
                Failing for
              </Th>
              <Th width={96} align="right">
                Change
              </Th>
            </tr>
          </thead>
          <tbody>
            {stuck.slice(0, 6).map(({ track, minutesFailing, deteriorating: worse }) => (
              <tr
                key={track.stationId}
                onClick={() => openStation(track.stationId)}
                className="cursor-pointer border-b border-[var(--color-line-soft)] transition-colors last:border-b-0 hover:bg-[var(--color-sunken)]"
              >
                <Td>
                  <ScoreBadge score={track.currentScore} size="sm" />
                </Td>
                <Td className="w-[34px]">
                  <Tooltip
                    content={
                      <>
                        <TipTitle>Work this station</TipTitle>
                        <TipBody>
                          Opens the Priority Queue scrolled to {track.name}, so you can act on it
                          rather than just read about it.
                        </TipBody>
                      </>
                    }
                  >
                    <Link
                      to={focusHref('/', track.stationId, 'Analytics', '/analytics')}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Open ${track.name} in the Priority Queue`}
                      className="inline-flex cursor-pointer text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                    >
                      <Icon name="list-ordered" size={13} />
                    </Link>
                  </Tooltip>
                </Td>
                <Td>
                  <span className="block truncate text-[12px] font-semibold text-[var(--color-ink)]">
                    {track.name}
                  </span>
                  <span className="mt-px block text-[10px] text-[var(--color-ink-3)]">
                    {track.borough}
                  </span>
                </Td>
                <Td align="right">
                  <span className="num text-[11px] text-[var(--color-ink-2)]">
                    {minutesFailing}m
                  </span>
                </Td>
                <Td align="right">
                  <span
                    className="num inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: worse ? TONE.empty.fg : TONE.mute.fg }}
                  >
                    <Icon
                      name={worse ? 'arrow-up' : 'move-horizontal'}
                      size={11}
                    />
                    {track.delta > 0 ? '+' : ''}
                    {track.delta}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Where the network stands right now.
--------------------------------------------------------------------------- */

function FillInventory() {
  const summary = useDispatch((s) => s.summary);

  const slices = summary
    ? [
        { label: 'Healthy', value: summary.categoryCounts.healthy, tone: 'ok' as Tone },
        { label: 'Low stock', value: summary.categoryCounts.starving, tone: 'warn' as Tone },
        { label: 'Empty', value: summary.categoryCounts.empty, tone: 'empty' as Tone },
        { label: 'Flooded', value: summary.categoryCounts.flooded, tone: 'flood-soft' as Tone },
        { label: 'Full', value: summary.categoryCounts.full, tone: 'flood' as Tone },
        { label: 'Unverified', value: summary.unverified, tone: 'mute' as Tone },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <Card className="flex flex-col">
      <div className="px-4 pt-3.5 pb-3">
        <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">Station fill inventory</h2>
        <p className="mt-0.5 text-[10px]" style={{ color: TONE.warn.fg }}>
          Status right now across {(summary?.total ?? 0).toLocaleString('en-US')} stations
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
        {slices.length > 0 ? (
          <>
            <Donut
              slices={slices}
              size={172}
              thickness={38}
              centerValue={(summary?.total ?? 0).toLocaleString('en-US')}
              centerLabel="STATIONS"
              showSliceLabels
            />
            <Legend slices={slices} className="mt-4" size={10} />
          </>
        ) : (
          <p className="py-14 text-[12px] text-[var(--color-ink-3)]">Waiting for the first poll…</p>
        )}
      </div>
    </Card>
  );
}

function BoroughPressure({ scored }: { scored: ReturnType<typeof useDispatch.getState>['scored'] }) {
  const rows = boroughRollup(scored);
  const worst = rows.reduce<(typeof rows)[number] | null>(
    (acc, r) => (acc === null || r.pressure > acc.pressure ? r : acc),
    null,
  );

  return (
    <Card className="mt-3.5 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">Pressure by borough</h2>
          <p className="mt-0.5 text-[10px]" style={{ color: TONE.warn.fg }}>
            {worst
              ? `${worst.borough} is carrying the most trouble — ${Math.round(worst.pressure * 100)}% of its stations need a truck`
              : 'Share of each borough that needs a truck right now'}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <Th>Borough</Th>
            <Th width={110} align="right">
              Stations
            </Th>
            <Th width={120} align="right">
              Needs a truck
            </Th>
            <Th width={100} align="right">
              Avg fill
            </Th>
            <Th width={200}>Pressure</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone: Tone =
              r.pressure >= 0.45 ? 'empty' : r.pressure >= 0.3 ? 'warn' : 'ok';
            return (
              <tr key={r.borough} className="border-b border-[var(--color-line-soft)] last:border-b-0">
                <Td className="text-[12px] font-semibold text-[var(--color-ink)]">{r.borough}</Td>
                <Td align="right">
                  <span className="num text-[11px] text-[var(--color-ink-2)]">{r.stations}</span>
                </Td>
                <Td align="right">
                  <span className="num text-[11px]" style={{ color: TONE[tone].fg }}>
                    {r.needsTruck}
                  </span>
                </Td>
                <Td align="right">
                  <span className="num text-[11px] text-[var(--color-ink-2)]">
                    {r.avgFill === null ? '–' : `${Math.round(r.avgFill * 100)}%`}
                  </span>
                </Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <Bar value={r.pressure} tone={tone} height={6} />
                    <span className="num w-[34px] shrink-0 text-right text-[10px] text-[var(--color-ink-3)]">
                      {Math.round(r.pressure * 100)}%
                    </span>
                  </span>
                </Td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <Td colSpan={5} className="py-10 text-center text-[12px] text-[var(--color-ink-3)]">
                Waiting for the first poll…
              </Td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="border-t border-[var(--color-line)] px-4 py-2.5 text-center">
        <Link to="/zone/manhattan" className="eyebrow text-[9px] hover:text-[var(--color-ink)]">
          Open a zone for station-level detail
        </Link>
      </div>
    </Card>
  );
}
