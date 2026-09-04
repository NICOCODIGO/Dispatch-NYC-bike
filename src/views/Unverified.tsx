import { Link, useNavigate } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Banner, Button, Card, Finding, Td, Th } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { shortStationId } from '../data/adapt';
import { capacityLoss, networkDocks } from '../data/insights';
import { TipBody, TipTitle, Tooltip } from '../ui/Tooltip';
import { COLUMN_HELP } from '../content/columns';
import { focusHref } from '../state/useFocus';
import { STALENESS_MAX_MINUTES } from '../model/score';
import { unverifiedReason } from '../model/triage';
import type { ScoredStation } from '../model/summary';
import { formatReportedAge } from '../lib/time';

/**
 * Stations the console will not score.
 *
 * The framing is deliberate: this is a hardware page, not a rebalancing page.
 * A station that has not phoned home in an hour is a comms or power problem,
 * and its fill counts — whatever they say — are not evidence a vehicle should
 * act on. `triage.ts` has already pulled these out of the queue; this screen
 * is where they land.
 *
 * The table is live. The three panels underneath are not, and say so: GBFS
 * carries a `last_reported` timestamp and nothing else about the hardware —
 * no battery, no carrier, no modem.
 */

/** Minutes past the 60-minute cutoff, or null when it never reported at all. */
function excessMinutes(entry: ScoredStation): number | null {
  const age = entry.breakdown.staleness.ageMinutes;
  return age === null ? null : Math.max(0, Math.round(age - STALENESS_MAX_MINUTES));
}

/**
 * How far past the cutoff, in a unit a person reads.
 *
 * Stations go dark for days, and "1228m past threshold" is a number you have
 * to do arithmetic on before it means anything.
 */
function formatExcess(minutes: number | null): string {
  if (minutes === null) return 'no timestamp at all';
  if (minutes < 60) return `${minutes}m past threshold`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h past threshold`;
  return `${Math.floor(hours / 24)}d past threshold`;
}

/**
 * A modem reset is worth trying on a station that just slipped past the
 * cutoff. One that has been dark for half an hour past it, or has never
 * reported at all, needs somebody to physically look at it.
 */
function needsMechanic(entry: ScoredStation): boolean {
  const excess = excessMinutes(entry);
  return excess === null || excess > 30;
}

export function Unverified() {
  const navigate = useNavigate();
  const lanes = useDispatch((s) => s.lanes);
  const summary = useDispatch((s) => s.summary);
  const phase = useDispatch((s) => s.phase);

  const dispatchMechanic = useConsole((s) => s.dispatchMechanic);
  const dispatched = useConsole((s) => s.dispatched);
  const openStation = useConsole((s) => s.openStation);

  const rows = lanes.unverified;
  const total = summary?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Unverified Stations"
        subtitle={
          summary
            ? `Stations that have not reported in over ${STALENESS_MAX_MINUTES} minutes. Their counts cannot be vouched for, so they are excluded from scoring. ${rows.length} of ${total.toLocaleString('en-US')} sites monitored.`
            : 'Reading the live feed…'
        }
        actions={
          <>
            <Button icon="radio-tower" notBuilt="Would poke each silent station's modem. Needs operator hardware access.">
              Ping Network Nodes
            </Button>
            <Button variant="dark" notBuilt="Would sweep every silent station and report why each went quiet.">
              Diagnostic Run
            </Button>
          </>
        }
      />

      <PageBody>
        <BlindSpotFinding rows={rows} />
        {rows.length > 0 && (
          <div className="mt-3">
            <Banner tone="empty" icon="radio-tower">
              <strong className="font-semibold">Unreliable data sources detected.</strong> The
              stations below have exceeded the {STALENESS_MAX_MINUTES}-minute reporting threshold.
              They are excluded from rebalancing scoring to prevent false-positive dispatch orders
              based on stale fill levels.
            </Banner>
          </div>
        )}

        <Card className="mt-3.5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Stations that have exceeded the reporting threshold.
              </caption>
              <thead>
                <tr>
                  <Th sortable>Station &amp; ID</Th>
                  <Th width={130}>Region</Th>
                  <Th width={140} help={COLUMN_HELP.heartbeat}>
                    Last heartbeat
                  </Th>
                  {/* Was "Threshold excess", which borrowed a word that means
                      the dispatch line everywhere else in the console. This is
                      the staleness cutoff — a different number measuring a
                      different thing — and two thresholds sharing one noun is
                      how a reader concludes a silent station is 4 hours past
                      score 55. */}
                  <Th width={190} help={COLUMN_HELP.thresholdExcess}>
                    Overdue by
                  </Th>
                  <Th width={150} align="right">
                    Action
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const { station, breakdown } = entry;
                  const excess = excessMinutes(entry);
                  const escalated = dispatched.includes(station.stationId);

                  return (
                    <tr
                      key={station.stationId}
                      className="border-b border-[var(--color-line-soft)] last:border-b-0"
                    >
                      <Td>
                        <button
                          type="button"
                          onClick={() => openStation(station.stationId)}
                          className="block text-left"
                        >
                          <span className="block text-[12px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline">
                            {station.name}
                          </span>
                          <span className="num mt-px block text-[10px] text-[var(--color-ink-3)]">
                            #{shortStationId(station.stationId)} · {station.capacity} docks
                          </span>
                        </button>
                        <Link
                          to={focusHref(
                            '/dispatch/map',
                            station.stationId,
                            'Unverified Stations',
                            '/monitoring/unverified',
                          )}
                          className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[10px] text-[var(--color-ink-3)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                        >
                          <Icon name="map" size={10} />
                          show on map
                        </Link>
                      </Td>

                      <Td className="text-[10px] tracking-[0.06em] text-[var(--color-ink-2)] uppercase">
                        {station.borough}
                      </Td>

                      <Td>
                        <span className="num text-[11px]" style={{ color: TONE.empty.fg }}>
                          {formatReportedAge(breakdown.staleness.ageMinutes)}
                        </span>
                        <span className="mt-px block text-[10px] text-[var(--color-ink-3)]">
                          {unverifiedReason(entry)}
                        </span>
                      </Td>

                      <Td>
                        <Tooltip
                          help
                          content={
                            <>
                              <TipTitle>{formatExcess(excess)}</TipTitle>
                              <TipBody>
                                Time since this station last reported, minus the{' '}
                                {STALENESS_MAX_MINUTES}-minute grace it is allowed. A few minutes
                                over is often a dropped connection worth a modem reset; hours or
                                days means somebody has to physically visit.
                              </TipBody>
                            </>
                          }
                        >
                          <span className="inline-flex items-center rounded-full bg-[var(--color-sunken)] px-2.5 py-[3px] text-[10px] text-[var(--color-ink-2)] italic">
                            {formatExcess(excess)}
                          </span>
                        </Tooltip>
                      </Td>

                      <Td align="right">
                        {escalated ? (
                          <button
                            type="button"
                            onClick={() => navigate('/maintenance/orders')}
                            className="num inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium"
                            style={{ color: TONE.ok.fg, backgroundColor: TONE.ok.bg }}
                          >
                            <Icon name="wrench" size={12} />
                            Mech dispatched
                          </button>
                        ) : needsMechanic(entry) ? (
                          <Button
                            size="sm"
                            variant="dark"
                            icon="wrench"
                            onClick={() =>
                              dispatchMechanic({
                                key: station.stationId,
                                name: `${station.name} — Not Reporting`,
                                where: `${station.name} · Station #${shortStationId(station.stationId)} · ${station.borough}`,
                                region: station.borough,
                                stationId: station.stationId,
                                // A station that has gone silent is a power or
                                // comms fault at the site, not a jammed dock —
                                // and the distinction decides which crew goes.
                                type: 'station-power',
                                priority: null,
                                detail:
                                  excess === null
                                    ? 'The feed carries no usable timestamp for this station at all. Escalated from Unverified Stations; modem or power fault suspected.'
                                    : `No heartbeat for ${formatReportedAge(breakdown.staleness.ageMinutes)} — ${formatExcess(excess)}. Escalated from Unverified Stations; cellular modem or power fault suspected. Excluded from rebalancing scoring until it reports.`,
                              })
                            }
                          >
                            Dispatch Mech
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            icon="power"
                            notBuilt="Would power-cycle this station remotely. Needs operator hardware access."
                          >
                            Reset Modem
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && (
            <p className="border-t border-[var(--color-line)] px-4 py-10 text-center text-[12px] text-[var(--color-ink-2)]">
              {phase === 'loading'
                ? 'Reading the live feed…'
                : `Every station reported inside the last ${STALENESS_MAX_MINUTES} minutes. Nothing to chase.`}
            </p>
          )}
        </Card>

        <p className="mt-4 text-[11px] text-[var(--color-ink-2)]">
          <Link
            to="/monitoring/site-health"
            className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
            style={{ color: TONE.flood.fg }}
          >
            <Icon name="radio-tower" size={13} />
            Reporting uptime, site power and the cellular link — Site Health
          </Link>
        </p>
      </PageBody>
    </>
  );
}

/* ---------------------------------------------------------------------------
   What the silence costs.

   The number of dark stations is not the interesting figure — the interesting
   figure is how much of the network's capacity is behind them, because that is
   the part of the city the board is quietly not reporting on.
--------------------------------------------------------------------------- */

function BlindSpotFinding({ rows }: { rows: ScoredStation[] }) {
  const scored = useDispatch((s) => s.scored);
  const phase = useDispatch((s) => s.phase);

  if (phase === 'loading' && scored.length === 0) {
    return <Finding icon="radio-tower" tone="mute" headline="Reading the live feed…" />;
  }

  if (rows.length === 0) {
    return (
      <Finding
        icon="radio-tower"
        tone="ok"
        headline="Every station is reporting."
        detail={`Nothing has been silent for more than ${STALENESS_MAX_MINUTES} minutes, so the queue is scoring the whole network with nothing excluded.`}
      />
    );
  }

  const loss = capacityLoss(rows, networkDocks(scored));
  const never = rows.filter((r) => r.breakdown.staleness.ageMinutes === null).length;
  const worst = loss.byBorough[0];
  const bad = loss.share >= 0.08 || loss.stations >= 8;

  return (
    <Finding
      icon="radio-tower"
      tone={bad ? 'empty' : 'warn'}
      headline={
        <>
          The board can&rsquo;t see {(loss.share * 100).toFixed(1)}% of the network —{' '}
          {loss.stations} silent station{loss.stations === 1 ? '' : 's'},{' '}
          {loss.docks.toLocaleString('en-US')} docks.
        </>
      }
      detail={
        <>
          These stations are dropped from scoring, so they never reach the queue however bad they
          get — a station could be empty for a day and this is the only screen that would know.
          {never > 0 && (
            <>
              {' '}
              {never} {never === 1 ? 'has' : 'have'} never sent a usable timestamp at all.
            </>
          )}
          {loss.oldestMinutes !== null && (
            <> Longest silence: {formatReportedAge(loss.oldestMinutes)}.</>
          )}
          {worst && loss.byBorough.length > 1 && (
            <> {worst.borough} worst affected, with {worst.stations}.</>
          )}
        </>
      }
      stats={[
        { label: 'stations dark', value: loss.stations, tone: 'empty' },
        { label: 'docks unseen', value: loss.docks.toLocaleString('en-US'), tone: 'empty' },
        { label: 'of network', value: `${(loss.share * 100).toFixed(1)}%` },
        {
          label: 'longest silence',
          value: loss.oldestMinutes === null ? 'never reported' : formatReportedAge(loss.oldestMinutes),
        },
      ]}
    />
  );
}

