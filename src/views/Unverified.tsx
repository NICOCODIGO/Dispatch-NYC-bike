import { useNavigate } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { BarRow } from '../ui/charts';
import { Bar, Button, Card, CardHead, Td, Th } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import {
  BATTERY,
  CELLULAR,
  OUTAGE_FREQUENCY,
  REPORTING_HEALTH,
  TOTAL_STATIONS,
  UNVERIFIED,
  stationById,
} from '../mock/data';

/**
 * Stations the console will not score.
 *
 * The framing is deliberate: this is a hardware page, not a rebalancing page.
 * A station that has not phoned home in an hour is a modem problem, and its
 * fill counts — whatever they say — are not evidence a truck should act on.
 */
/** Device IDs map to directory stations so a row can open its receipt. */
const STATION_FOR_DEVICE: Record<string, string> = {
  '#7244.02': '7244',
  '#5116.01': '5116',
  '#6421.05': '6421',
};

export function Unverified() {
  const navigate = useNavigate();
  const dispatchMechanic = useConsole((s) => s.dispatchMechanic);
  const dispatched = useConsole((s) => s.dispatched);
  const openStation = useConsole((s) => s.openStation);

  return (
    <>
      <PageHeader
        title="Unverified Stations"
        subtitle={`Monitoring ${TOTAL_STATIONS} total sites · ${UNVERIFIED.length} reporting failures (> 60m since sync)`}
        actions={
          <>
            <Button icon="radio-tower">Ping Network Nodes</Button>
            <Button variant="dark">Diagnostic Run</Button>
          </>
        }
      />

      <PageBody>
        <AlertBanner />

        <Card className="mt-3.5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Stations that have exceeded the 60-minute reporting threshold.
              </caption>
              <thead>
                <tr>
                  <Th sortable>Station &amp; Device ID</Th>
                  <Th width={130}>Region</Th>
                  <Th width={140}>Last Heartbeat</Th>
                  <Th width={170}>Threshold Excess</Th>
                  <Th width={150} align="right">
                    Action
                  </Th>
                </tr>
              </thead>
              <tbody>
                {UNVERIFIED.map((row) => {
                  const stationId = STATION_FOR_DEVICE[row.deviceId];
                  const isDispatched = dispatched.includes(row.deviceId);

                  return (
                  <tr
                    key={row.deviceId}
                    className="border-b border-[var(--color-line-soft)] last:border-b-0"
                  >
                    <Td>
                      {stationId && stationById(stationId) ? (
                        <button
                          type="button"
                          onClick={() => openStation(stationId)}
                          className="block text-left"
                        >
                          <span className="block text-[12px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline">
                            {row.name}
                          </span>
                          <span className="num mt-px block text-[10px] text-[var(--color-ink-3)]">
                            {row.deviceId} · ICCID: {row.iccid}
                          </span>
                        </button>
                      ) : (
                        <>
                          <span className="block text-[12px] font-semibold text-[var(--color-ink)]">
                            {row.name}
                          </span>
                          <span className="num mt-px block text-[10px] text-[var(--color-ink-3)]">
                            {row.deviceId} · ICCID: {row.iccid}
                          </span>
                        </>
                      )}
                    </Td>
                    <Td className="text-[10px] tracking-[0.06em] text-[var(--color-ink-2)]">
                      {row.region}
                    </Td>
                    <Td>
                      <span className="num text-[11px]" style={{ color: TONE.empty.fg }}>
                        {row.heartbeat}
                      </span>
                    </Td>
                    <Td>
                      <span className="inline-flex items-center rounded-full bg-[var(--color-sunken)] px-2.5 py-[3px] text-[10px] text-[var(--color-ink-2)] italic">
                        {row.excess}
                      </span>
                    </Td>
                    <Td align="right">
                      {isDispatched ? (
                        <button
                          type="button"
                          onClick={() => navigate('/mechanics')}
                          className="num inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium"
                          style={{ color: TONE.ok.fg, backgroundColor: TONE.ok.bg }}
                        >
                          <Icon name="wrench" size={12} />
                          Mech dispatched
                        </button>
                      ) : row.action === 'reset' ? (
                        <Button size="sm" icon="power">
                          Reset Modem
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="dark"
                          icon="wrench"
                          onClick={() => dispatchMechanic(row)}
                        >
                          Dispatch Mech
                        </Button>
                      )}
                    </Td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-3">
          <ReportingHealth />
          <BatteryCard />
          <CellularCard />
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function AlertBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border px-3.5 py-3"
      style={{ backgroundColor: TONE.empty.bg, borderColor: TONE.empty.line }}
    >
      <span
        aria-hidden="true"
        className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: '#f7ddd9', color: TONE.empty.fg }}
      >
        <Icon name="radio-tower" size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold" style={{ color: TONE.empty.fg }}>
          Unreliable Data Sources Detected
        </p>
        <p className="mt-1 max-w-[86ch] text-[11px] leading-relaxed" style={{ color: '#a4564c' }}>
          The stations below have exceeded the 60-minute reporting threshold. They are excluded
          from Priority Queue scoring to prevent &ldquo;false-positive&rdquo; dispatch orders based
          on stale fill levels.
        </p>
      </div>

      <button
        type="button"
        className="shrink-0 text-[10px] font-semibold tracking-[0.08em] underline underline-offset-2"
        style={{ color: TONE.empty.fg }}
      >
        PROTOCOLS
      </button>
    </div>
  );
}

function ReportingHealth() {
  return (
    <Card>
      <CardHead
        title="Reporting health (24h)"
        right={
          <span
            className="text-[9px] font-semibold tracking-[0.08em] uppercase"
            style={{ color: TONE.ok.fg }}
          >
            {REPORTING_HEALTH.verdict}
          </span>
        }
      />
      <div className="px-3.5 pb-3.5">
        <BarRow bars={REPORTING_HEALTH.bars} height={54} />
        <div className="num mt-1.5 flex justify-between text-[9px] text-[var(--color-ink-3)]">
          {REPORTING_HEALTH.axis.map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--color-line-soft)] pt-2.5">
          <p className="num text-[22px] leading-none font-semibold text-[var(--color-ink)]">
            {REPORTING_HEALTH.uptime}
            <span className="text-[13px]">%</span>
          </p>
          <p className="eyebrow text-[9px]">Avg uptime</p>
        </div>
      </div>
    </Card>
  );
}

function BatteryCard() {
  return (
    <Card>
      <CardHead title="Battery life thresholds" />
      <div className="px-3.5 pb-3.5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: TONE.empty.bg, color: TONE.empty.fg }}
          >
            <Icon name="battery-low" size={19} />
          </span>
          <div>
            <p className="num text-[22px] leading-none font-semibold text-[var(--color-ink)]">
              {BATTERY.count}
            </p>
            <p className="eyebrow mt-1 text-[9px]">{BATTERY.caption}</p>
          </div>
        </div>
        <div className="mt-4">
          <Bar value={BATTERY.share} tone="empty" height={6} />
        </div>
      </div>
    </Card>
  );
}

function CellularCard() {
  return (
    <Card>
      <CardHead title="Cellular network" />
      <dl className="px-3.5 pb-3.5">
        {CELLULAR.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-3 border-b border-[var(--color-line-soft)] py-2 text-[11px]"
          >
            <dt className="text-[var(--color-ink-2)]">{c.label}</dt>
            <dd
              className="flex items-center gap-1.5 font-medium"
              style={{ color: TONE[c.tone].fg }}
            >
              <span
                aria-hidden="true"
                className="h-[5px] w-[5px] rounded-full"
                style={{ backgroundColor: TONE[c.tone].fg }}
              />
              {c.value}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 py-2 text-[11px]">
          <dt className="text-[var(--color-ink-2)]">Outage Frequency</dt>
          <dd className="num font-medium text-[var(--color-ink)]">{OUTAGE_FREQUENCY}</dd>
        </div>
      </dl>
    </Card>
  );
}
