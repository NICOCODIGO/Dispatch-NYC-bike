import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Donut, Legend } from '../ui/charts';
import {
  Bar,
  Button,
  Card,
  CardHead,
  Delta,
  Dot,
  FilterChip,
  ScoreBadge,
  SearchInput,
  Select,
  StatCard,
  StatusPill,
  Td,
  Th,
} from '../ui/primitives';
import { TONE } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import {
  FILL_DISTRIBUTION,
  QUEUE_STATS,
  SCORE_GUIDE,
  STATIONS,
  STATUS_FILTERS,
  TOTAL_STATIONS,
  TRUCKS,
  TRUCKS_ACTIVE,
  TRUCKS_TOTAL,
  TRUCK_STATE_LABEL,
  TRUCK_STATE_TONE,
  ZONES,
  type StationRow,
} from '../mock/data';
import { cn } from '../lib/cn';

/**
 * The board. Everything else in the console exists to be navigated to from
 * here, so this is the one screen that carries the full apparatus: the six
 * headline numbers, the status filters, the ranked table and the three
 * reference cards on the rail.
 */
export function PriorityQueue() {
  const [search, setSearch] = useState('');
  const [borough, setBorough] = useState('all');
  const [active, setActive] = useState<string[]>(['empty', 'flooded']);

  const openStation = useConsole((s) => s.openStation);
  const openStationId = useConsole((s) => s.openStationId);

  const toggle = (key: string) =>
    setActive((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  /** Show only this status — the stat card's job, distinct from the chip toggle. */
  const only = (key: string) => setActive([key]);

  return (
    <>
      <PageHeader
        title="Priority Queue"
        subtitle={`${TOTAL_STATIONS} stations ranked by urgency score — worst first`}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search station or address…"
              width={190}
            />
            <Select
              label="Filter by borough"
              value={borough}
              onChange={setBorough}
              options={[
                { value: 'all', label: 'All Boroughs' },
                ...ZONES.map((z) => ({ value: z.slug, label: z.name })),
              ]}
            />
            <Button variant="dark" icon="truck">
              Dispatch Truck
            </Button>
          </>
        }
      />

      <PageBody>
        {/* Six headline numbers, full width above the split. */}
        {/* The first three act on the queue in place; the last three are
            summaries of other screens and navigate to them. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Needs truck"
            value={QUEUE_STATS.needsTruck}
            tone="empty"
            foot={`score ≥ ${QUEUE_STATS.criticalThreshold}`}
            onClick={() => setActive([])}
            actionLabel={`${QUEUE_STATS.needsTruck} stations need a truck. Clear all status filters.`}
          />
          <StatCard
            label="Empty"
            value={QUEUE_STATS.empty}
            tone="empty"
            foot={<Delta direction="up" value={String(QUEUE_STATS.emptyDelta)} suffix="vs 1h ago" />}
            onClick={() => only('empty')}
            actionLabel={`${QUEUE_STATS.empty} empty stations. Show only these.`}
          />
          <StatCard
            label="Flooded"
            value={QUEUE_STATS.flooded}
            tone="flood"
            foot={
              <Delta
                direction="down"
                value={String(Math.abs(QUEUE_STATS.floodedDelta))}
                suffix="vs 1h ago"
              />
            }
            onClick={() => only('flooded')}
            actionLabel={`${QUEUE_STATS.flooded} flooded stations. Show only these.`}
          />
          <StatCard
            label="Fleet"
            value={`${TRUCKS_ACTIVE}/${TRUCKS_TOTAL}`}
            foot="active trucks"
            to="/trucks"
            actionLabel={`${TRUCKS_ACTIVE} of ${TRUCKS_TOTAL} trucks active. Open fleet operations.`}
          />
          <StatCard
            label="Stale"
            value={QUEUE_STATS.stale}
            foot="last sync failed"
            to="/unverified"
            actionLabel={`${QUEUE_STATS.stale} stations stale. Open unverified stations.`}
          />
          <StatCard
            label="Fill"
            value={Math.round(QUEUE_STATS.fill * 100)}
            unit="%"
            bar={{ value: QUEUE_STATS.fill, tone: 'ok' }}
            to="/analytics"
            actionLabel="Network fill 61 percent. Open network performance."
          />
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_168px]">
          {/* Filters sit over the table only — the rail begins at the table. */}
          <Card className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <h2 className="eyebrow shrink-0 text-[9px]">Filter by status</h2>
            <span aria-hidden="true" className="h-[16px] w-px bg-[var(--color-line)]" />
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <FilterChip
                  key={f.key}
                  label={f.label}
                  count={f.count}
                  tone={f.tone}
                  active={active.includes(f.key)}
                  onClick={() => toggle(f.key)}
                />
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3.5">
              <button
                type="button"
                onClick={() => setActive([])}
                className="inline-flex items-center gap-1 text-[10px] whitespace-nowrap text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
              >
                <Icon name="rotate-ccw" size={11} />
                Clear filters
              </button>
              <span className="inline-flex items-center gap-1 text-[10px] whitespace-nowrap text-[var(--color-ink-2)]">
                <Icon name="list-filter" size={11} />
                Score threshold: <span className="num">{QUEUE_STATS.scoreThreshold}</span>
              </span>
            </div>
          </Card>

          <Card className="col-start-1 row-start-2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  Stations ranked by urgency score, worst first. Select a row to see how its score
                  was calculated.
                </caption>
                <thead>
                  <tr>
                    <Th sortable width={68}>
                      Score
                    </Th>
                    <Th sortable>Station</Th>
                    <Th sortable width={96}>
                      Borough
                    </Th>
                    <Th width={86} align="right">
                      Bikes / Docks
                    </Th>
                    <Th sortable width={124}>
                      Fill
                    </Th>
                    <Th sortable width={86}>
                      Status
                    </Th>
                    <Th sortable width={84}>
                      Updated
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {STATIONS.map((row) => (
                    <QueueRow
                      key={row.id}
                      row={row}
                      selected={openStationId === row.id}
                      onOpen={() => openStation(row.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] px-3 py-2.5">
              <p className="text-[10px] text-[var(--color-ink-3)]">
                Showing {STATIONS.length} of {TOTAL_STATIONS} stations ·{' '}
                <span style={{ color: TONE.warn.fg }}>
                  {QUEUE_STATS.needsTruck} need a truck now
                </span>
              </p>
              <div className="flex items-center gap-2.5 text-[10px] text-[var(--color-ink-2)]">
                <button type="button" className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
                  <Icon name="chevron-left" size={12} />
                  Prev
                </button>
                <span className="num text-[var(--color-ink-3)]">
                  {QUEUE_STATS.page} / {QUEUE_STATS.pageCount}
                </span>
                <button type="button" className="inline-flex items-center gap-1 hover:text-[var(--color-ink)]">
                  Next
                  <Icon name="chevron-right" size={12} />
                </button>
              </div>
            </div>
          </Card>

          <aside
            className="col-start-1 row-start-3 flex flex-col gap-4 xl:col-start-2 xl:row-start-2"
            aria-label="Fleet and score reference"
          >
            <ActiveTrucks />
            <FillDistribution />
            <ScoreGuide />
          </aside>
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function QueueRow({
  row,
  selected,
  onOpen,
}: {
  row: StationRow;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className={cn(
        'cursor-pointer border-b border-[var(--color-line-soft)] transition-colors last:border-b-0',
        selected ? 'bg-[var(--color-sunken)]' : 'hover:bg-[var(--color-sunken)]',
      )}
    >
      <Td>
        <ScoreBadge score={row.score} />
      </Td>

      <Td>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block min-w-0 text-left"
        >
          <span
            className={cn(
              'block truncate text-[12px] font-semibold',
              row.score === null ? 'text-[var(--color-ink-2)]' : 'text-[var(--color-ink)]',
            )}
          >
            {row.name}
          </span>
          {row.warning ? (
            <span
              className="mt-px flex items-center gap-1 text-[10px]"
              style={{ color: TONE.empty.fg }}
            >
              <Icon name="info" size={10} />
              {row.warning}
            </span>
          ) : (
            <span className="mt-px block text-[10px] text-[var(--color-ink-3)]">
              {row.borough} · <span className="num">{row.docks}</span> docks
            </span>
          )}
        </button>
      </Td>

      <Td className="text-[11px] text-[var(--color-ink-2)]">{row.borough}</Td>

      <Td align="right">
        <span className="num text-[11px] whitespace-nowrap text-[var(--color-ink)]">
          {row.bikes === null ? '—' : row.bikes}
          <span className="mx-1 text-[var(--color-ink-3)]">/</span>
          <span className="text-[var(--color-ink-2)]">{row.docks}</span>
        </span>
      </Td>

      <Td>
        <Bar value={row.fill} tone={row.fillTone} height={4} />
        {row.fillLabel && (
          <span className="num mt-1 block text-[9px] text-[var(--color-ink-3)]">
            {row.fillLabel}
          </span>
        )}
      </Td>

      <Td>
        <StatusPill label={row.status} />
      </Td>

      <Td>
        <span className="num text-[10px] text-[var(--color-ink-3)]">{row.updated}</span>
      </Td>
    </tr>
  );
}

/* ---------------------------------------------------------------------------
   The rail.
--------------------------------------------------------------------------- */

/** The rail shows the two trucks in motion plus one idle, matching dispatch's
    own glance order: who is coming, who is loading, who is free. */
const RAIL_TRUCK_IDS = ['#4', '#7', '#2'];

function ActiveTrucks() {
  const shown = RAIL_TRUCK_IDS.map((id) => TRUCKS.find((t) => t.id === id)!).filter(Boolean);

  return (
    <Card>
      <CardHead title="Active trucks" right={<RailLink to="/trucks" label="Open fleet operations" />} />
      <ul className="px-3 pb-3">
        {shown.map((truck, i) => (
          <li key={truck.id} className={cn('py-2', i > 0 && 'border-t border-[var(--color-line-soft)]')}>
            <div className="flex items-center justify-between gap-1.5">
              <span className="num text-[11px] font-semibold text-[var(--color-ink)]">
                Truck {truck.id}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[9px] font-medium whitespace-nowrap"
                style={{ color: TONE[TRUCK_STATE_TONE[truck.state]].fg }}
              >
                <Dot tone={TRUCK_STATE_TONE[truck.state]} size={4} />
                {TRUCK_STATE_LABEL[truck.state]}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-tight text-[var(--color-ink-2)]">
              {truck.where}
            </p>
            {truck.when && (
              <p className="num mt-0.5 text-[9px] text-[var(--color-ink-3)]">{truck.when}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The small "go to the page this card summarises" affordance. */
function RailLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
    >
      <Icon name="chevron-right" size={13} />
    </Link>
  );
}

function FillDistribution() {
  return (
    <Card>
      <CardHead
        title="Fill distribution"
        right={<RailLink to="/analytics" label="Open network performance" />}
      />
      <div className="flex items-center gap-1.5 px-3 pb-3">
        <Donut
          slices={FILL_DISTRIBUTION}
          size={66}
          thickness={13}
          centerValue={String(TOTAL_STATIONS)}
          centerLabel="STATIONS"
        />
        <Legend slices={FILL_DISTRIBUTION} direction="column" size={9} />
      </div>
    </Card>
  );
}

function ScoreGuide() {
  return (
    <Card>
      <CardHead title="Score guide" />
      <ul className="flex flex-col gap-2 px-3 pb-3">
        {SCORE_GUIDE.map((g) => (
          <li key={g.label} className="flex items-start gap-2">
            <span
              className="num inline-flex h-[22px] w-[34px] shrink-0 items-center justify-center rounded-[5px] border text-[9px] font-semibold"
              style={{
                color: TONE[g.tone].fg,
                backgroundColor: TONE[g.tone].bg,
                borderColor: TONE[g.tone].line,
              }}
            >
              {g.range}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold text-[var(--color-ink)]">
                {g.label}
              </span>
              <span className="block text-[9px] leading-tight text-[var(--color-ink-3)]">
                {g.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
