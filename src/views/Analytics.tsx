import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Donut, Legend, LineChart, LineLegend } from '../ui/charts';
import { Bar, Button, Card, Select, Td, Th, TonePill } from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import {
  BOROUGH_METRICS,
  CHRONIC_OFFENDERS,
  DEMAND_ACTUAL,
  DEMAND_PREDICTED,
  DEMAND_X_LABELS,
  FILL_DISTRIBUTION,
  KPIS,
  TOTAL_STATIONS,
  TRUCKS_ACTIVE,
  TRUCKS_TOTAL,
  UNVERIFIED,
} from '../mock/data';

/**
 * The aggregate view — the one screen that is about the network rather than
 * about any station on it.
 */
export function Analytics() {
  const [range, setRange] = useState('24h');

  return (
    <>
      <PageHeader
        title="Network Performance"
        subtitle={`Aggregated KPIs across ${TOTAL_STATIONS} stations and ${TRUCKS_TOTAL} active trucks`}
        actions={
          <>
            <Select
              label="Time range"
              value={range}
              onChange={setRange}
              options={[
                { value: '24h', label: 'Last 24 Hours' },
                { value: '7d', label: 'Last 7 Days' },
                { value: '30d', label: 'Last 30 Days' },
              ]}
            />
            <Button variant="dark" icon="download">
              Export
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <KpiCard
            label="Total trips today"
            value={KPIS.trips}
            foot={
              <span className="inline-flex items-center gap-1" style={{ color: TONE.ok.fg }}>
                <Icon name="trending-up" size={11} />
                {KPIS.tripsDelta}
              </span>
            }
          />
          <KpiCard
            label="Avg rebalance time"
            value={KPIS.rebalance}
            unit="min"
            foot={
              <span className="inline-flex items-center gap-1" style={{ color: TONE.ok.fg }}>
                <Icon name="trending-down" size={11} />
                {KPIS.rebalanceDelta}
              </span>
            }
          />
          <KpiCard
            label="Fleet utilization"
            value={`${TRUCKS_ACTIVE} / ${TRUCKS_TOTAL}`}
            foot={<span className="eyebrow text-[9px]">Active / total trucks</span>}
          />
          <KpiCard
            label="Network reliability"
            value={KPIS.reliability}
            unit="%"
            foot={
              <span className="inline-flex items-center gap-1.5" style={{ color: TONE.empty.fg }}>
                <span
                  aria-hidden="true"
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ backgroundColor: TONE.empty.fg }}
                />
                {UNVERIFIED.length} nodes unverified
              </span>
            }
          />
        </div>

        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <FillInventory />
          <ChronicOffenders />
        </div>

        <DemandForecast />
        <BoroughMetrics />
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function KpiCard({
  label,
  value,
  unit,
  foot,
}: {
  label: string;
  value: string;
  unit?: string;
  foot: React.ReactNode;
}) {
  return (
    <div className="card px-3.5 py-3">
      <p className="eyebrow text-[9px]">{label}</p>
      <p className="num mt-2 text-[24px] leading-none font-semibold text-[var(--color-ink)]">
        {value}
        {unit && <span className="ml-1 text-[12px] font-medium">{unit}</span>}
      </p>
      <p className="mt-2 text-[10px] text-[var(--color-ink-3)]">{foot}</p>
    </div>
  );
}

/** Card title used inside the analytics panels — a real heading, not an eyebrow. */
function PanelHead({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-[10px]" style={{ color: TONE.warn.fg }}>
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

function FillInventory() {
  return (
    <Card className="flex flex-col">
      <PanelHead title="Station Fill Inventory" subtitle={`Status breakdown across ${TOTAL_STATIONS} stations`} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-4">
        <Donut
          slices={FILL_DISTRIBUTION}
          size={172}
          thickness={38}
          centerValue={String(TOTAL_STATIONS)}
          centerLabel="STATIONS"
          showSliceLabels
        />
        <Legend slices={FILL_DISTRIBUTION} className="mt-4" size={10} />
      </div>
    </Card>
  );
}

function ChronicOffenders() {
  const openStation = useConsole((s) => s.openStation);

  return (
    <Card className="flex flex-col overflow-hidden">
      <PanelHead
        title="Chronic Offenders"
        subtitle="Sites with > 10 critical alerts this month"
        right={<TonePill label="Action Required" tone="empty" />}
      />
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <Th>Station</Th>
            <Th width={110} align="right">
              Alert Freq
            </Th>
            <Th width={90} align="right">
              Trend
            </Th>
          </tr>
        </thead>
        <tbody>
          {CHRONIC_OFFENDERS.map((o) => {
            const tone: Tone =
              o.trend.direction === 'up' ? 'empty' : o.trend.direction === 'down' ? 'ok' : 'mute';
            const glyph =
              o.trend.direction === 'up'
                ? 'arrow-up'
                : o.trend.direction === 'down'
                  ? 'arrow-down'
                  : 'move-horizontal';

            return (
              <tr
                key={o.station}
                onClick={() => openStation(o.stationId)}
                className="cursor-pointer border-b border-[var(--color-line-soft)] transition-colors last:border-b-0 hover:bg-[var(--color-sunken)]"
              >
                <Td>
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
                  >
                    {o.station}
                  </button>
                </Td>
                <Td align="right">
                  <span className="num text-[11px] text-[var(--color-ink-2)]">{o.days} days</span>
                </Td>
                <Td align="right">
                  <span
                    className="num inline-flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: TONE[tone].fg }}
                  >
                    <Icon name={glyph} size={11} />
                    {o.trend.value}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function DemandForecast() {
  return (
    <Card className="mt-3.5">
      <PanelHead title="Demand Forecasting" subtitle="Predicted vs Actual system volume (24h)" />
      <div className="px-4 pb-4">
        <LineLegend />
        <div className="mt-2">
          <LineChart
            actual={DEMAND_ACTUAL}
            predicted={DEMAND_PREDICTED}
            xLabels={DEMAND_X_LABELS}
            yMax={200}
            yStep={50}
            height={210}
            yTitle="Trips / Hour"
          />
        </div>
      </div>
    </Card>
  );
}

function BoroughMetrics() {
  return (
    <Card className="mt-3.5 overflow-hidden">
      <PanelHead
        title="Borough-Level Performance Metrics"
        right={
          <button type="button" className="eyebrow text-[9px] hover:text-[var(--color-ink)]">
            Report details
          </button>
        }
      />
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <Th>NYC Borough</Th>
            <Th width={130} align="right">
              Total Stations
            </Th>
            <Th width={130} align="right">
              Active Trucks
            </Th>
            <Th width={140} align="right">
              Avg Rebalance
            </Th>
            <Th width={190}>Operational Score</Th>
          </tr>
        </thead>
        <tbody>
          {BOROUGH_METRICS.map((b) => (
            <tr key={b.name} className="border-b border-[var(--color-line-soft)] last:border-b-0">
              <Td>
                {b.zoneSlug ? (
                  <Link
                    to={`/zone/${b.zoneSlug}`}
                    className="text-[12px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
                  >
                    {b.name}
                  </Link>
                ) : (
                  <span className="text-[12px] font-semibold text-[var(--color-ink-3)]">
                    {b.name}
                  </span>
                )}
              </Td>
              <Td align="right">
                <span className="num text-[11px] text-[var(--color-ink-2)]">{b.stations}</span>
              </Td>
              <Td align="right">
                <span className="num text-[11px]" style={{ color: TONE.warn.fg }}>
                  {b.trucks}
                </span>
              </Td>
              <Td align="right">
                <span className="num text-[11px] text-[var(--color-ink-2)]">
                  {b.rebalance === null ? '–' : `${b.rebalance}m`}
                </span>
              </Td>
              <Td>
                <Bar value={b.score} tone={b.tone} height={6} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
