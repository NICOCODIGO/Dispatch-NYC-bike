import { useEffect, useMemo, useState } from 'react';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import {
  Bar,
  Button,
  Card,
  CardHead,
  Finding,
  FixtureNote,
  ScoreBadge,
  TonePill,
} from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { useConsole, type TruckAssignment } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { rebalanceDemand, truckAction } from '../data/insights';
import {
  AVAILABILITY_LABEL,
  AVAILABILITY_NOTE,
  formatFreeIn,
  groupFleet,
  openJobs,
  type Availability,
  type FleetGroups,
  type FleetRow,
} from '../data/fleet';
import { TipBody, TipTitle, Tooltip } from '../ui/Tooltip';
import { NEEDS_TRUCK_THRESHOLD } from '../model/score';
import {
  TRUCKS,
  TRUCK_FOCUS,
  TRUCK_STATE_LABEL,
  TRUCK_STATE_AVAILABILITY,
  TRUCK_STATE_CYCLE,
  TRUCK_STATE_MEANING,
  TRUCK_STATE_TONE,
  type Truck,
  type TruckState,
} from '../mock/data';
import { cn } from '../lib/cn';

/**
 * The fleet.
 *
 * One truck is expanded at a time and everything else collapses to a single
 * line. A dispatcher is working one vehicle at a time; eight equally detailed
 * cards would be eight things to read before finding the one that matters.
 */
export function TruckDispatch() {
  const [focused, setFocused] = useState(TRUCK_FOCUS.id);
  const assignments = useConsole((s) => s.assignments);

  // Dispatching from the queue should be visible the moment you arrive here.
  // Without this the assignment existed but sat inside a collapsed row, so the
  // page about trucks appeared not to have noticed.
  const latest = Object.values(assignments).sort((a, b) => b.at.localeCompare(a.at))[0];
  useEffect(() => {
    if (latest) setFocused(latest.truckId);
  }, [latest?.truckId, latest?.at]);
  // Derived from assignments, not from the fixture array. Reading the static
  // list meant dispatching a truck left it labelled Idle, kept the pill at
  // "3 Idle", and let the headline go on claiming three trucks were doing
  // nothing immediately after you gave one a job.
  const stateOf = (t: Truck) => effectiveState(t, assignments[t.id]);
  const counts = TRUCKS.reduce<Record<string, number>>((acc, t) => {
    const s = stateOf(t);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const idle = counts.idle ?? 0;

  const lane = useDispatch((s) => s.lanes.truck);
  const summary = useDispatch((s) => s.summary);
  const demand = rebalanceDemand(lane);

  const capacityPerRun = TRUCKS.reduce((sum, t) => sum + t.capacity, 0);
  const activeCapacity = TRUCKS.filter((t) => stateOf(t) !== 'idle').reduce(
    (sum, t) => sum + t.capacity,
    0,
  );
  const runs = activeCapacity > 0 ? Math.ceil(demand.relocatable / activeCapacity) : 0;

  /**
   * Availability, and a candidate job for everyone who can take one.
   *
   * An assigned truck is committed no matter what the fixture says its
   * `freeInMin` is — the assignment is the newer fact. Without this, dispatching
   * a truck from the queue left it sitting in FREE NOW being offered a second
   * station.
   */
  const taken = new Set(
    Object.values(assignments)
      .map((a) => a.stationId)
      .filter((id): id is string => Boolean(id)),
  );
  const jobs = useMemo(() => openJobs(lane, taken), [lane, assignments]);
  const groups = useMemo(
    () => groupFleet(TRUCKS, (t) => (assignments[t.id] ? Math.max(t.freeInMin, 999) : t.freeInMin), jobs),
    [assignments, jobs],
  );

  return (
    <>
      <PageHeader
        title="Fleet Operations"
        subtitle={`${TRUCKS.length} trucks against ${(summary?.needsTruck ?? 0).toLocaleString('en-US')} stations that need one. What is outstanding, who is moving, and what the idle trucks could be doing.`}
        actions={
          <>
            <Button icon="file-text">Fleet Status Report</Button>
            <Button variant="dark" icon="plus">
              Assign New Route
            </Button>
          </>
        }
      />

      <PageBody>
        <WorkloadFinding
          demand={demand}
          idle={idle}
          runs={runs}
          activeCapacity={activeCapacity}
          capacityPerRun={capacityPerRun}
          needsTruck={summary?.needsTruck ?? 0}
        />

        <div className="mt-3.5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 className="eyebrow text-[9px]">Operational fleet ({TRUCKS.length} total)</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {(Object.keys(TRUCK_STATE_LABEL) as TruckState[])
                  .filter((s) => (counts[s] ?? 0) > 0)
                  .map((s) => (
                    <TonePill
                      key={s}
                      label={`${counts[s]} ${TRUCK_STATE_LABEL[s]}`}
                      tone={TRUCK_STATE_TONE[s]}
                    />
                  ))}
              </div>
            </div>

            <FleetByAvailability
              groups={groups}
              focused={focused}
              onFocus={setFocused}
              stateOf={stateOf}
            />
          </div>

          <aside className="flex flex-col gap-3.5" aria-label="Active truck focus">
            <FocusCard />
            <FleetStates counts={counts} />
            <NextUp />
          </aside>
        </div>
      </PageBody>
    </>
  );
}

/**
 * What a truck is doing once a coordinator has given it a job.
 *
 *   Idle      parked at a depot, nothing assigned
 *   Loading   moving bikes on or off — at a depot, or at a station too full
 *   En route  driving between two points
 *
 * A truck sent to *drop* bikes with an empty bed has to fill up first, so it
 * goes to Loading; anything else is already on the road. Crude, but it is the
 * honest consequence of the instruction rather than a state picked at random.
 */
function effectiveState(truck: Truck, assignment?: TruckAssignment): TruckState {
  if (!assignment) return truck.state;
  const needsStock = assignment.instruction.startsWith('drop') && truck.load === 0;
  return needsStock ? 'loading' : 'en-route';
}

/* ---------------------------------------------------------------------------
   The workload, and whether the fleet is equal to it.
--------------------------------------------------------------------------- */

function WorkloadFinding({
  demand,
  idle,
  runs,
  activeCapacity,
  capacityPerRun,
  needsTruck,
}: {
  demand: ReturnType<typeof rebalanceDemand>;
  idle: number;
  runs: number;
  activeCapacity: number;
  capacityPerRun: number;
  needsTruck: number;
}) {
  if (needsTruck === 0) {
    return (
      <Finding
        icon="truck"
        tone="mute"
        headline="Waiting for the first poll…"
        detail="Outstanding work is computed from the live queue."
      />
    );
  }

  // Idle trucks while work is outstanding is the whole story of this screen.
  const tone: Tone = idle > 0 && needsTruck > 0 ? 'empty' : runs > 2 ? 'warn' : 'ok';

  return (
    <Finding
      icon="truck"
      tone={tone}
      headline={
        idle > 0 ? (
          <>
            {idle} of {TRUCKS.length} trucks are idle while {needsTruck.toLocaleString('en-US')}{' '}
            stations need one.
          </>
        ) : (
          <>
            The whole fleet is committed against {needsTruck.toLocaleString('en-US')} stations
            needing a truck.
          </>
        )
      }
      detail={
        <>
          {demand.deficit.toLocaleString('en-US')} bikes need delivering to{' '}
          {demand.stationsShort} stations that are running dry, and{' '}
          {demand.surplus.toLocaleString('en-US')} need collecting from {demand.stationsOver} that
          have no room left. {demand.relocatable.toLocaleString('en-US')} of those can be handled
          by moving bikes between stations; the rest has to come from or go to a depot. At{' '}
          {activeCapacity} bikes of active truck capacity that is {runs} full run
          {runs === 1 ? '' : 's'}
          {idle > 0 && (
            <> — bringing the idle trucks in would raise capacity to {capacityPerRun}</>
          )}
          .
        </>
      }
      stats={[
        { label: 'to deliver', value: demand.deficit.toLocaleString('en-US'), tone: 'empty' },
        { label: 'to collect', value: demand.surplus.toLocaleString('en-US'), tone: 'flood' },
        { label: 'relocatable', value: demand.relocatable.toLocaleString('en-US') },
        { label: 'truck runs', value: runs, tone: runs > 2 ? 'warn' : 'ok' },
        { label: 'idle', value: idle, tone: idle > 0 ? 'empty' : 'ok' },
      ]}
    />
  );
}

/**
 * A status chip that explains itself.
 *
 * Every place the board labels a vehicle, the label carries its own definition
 * and its own availability — the same tooltip component the column headers
 * use, so "what does this word mean" has one answer and one interaction
 * everywhere in the app.
 */
export function TruckStateChip({ state }: { state: TruckState }) {
  const t = TONE[TRUCK_STATE_TONE[state]];
  return (
    <Tooltip
      help
      width={260}
      content={
        <>
          <TipTitle>{TRUCK_STATE_LABEL[state]}</TipTitle>
          <TipBody>{TRUCK_STATE_MEANING[state]}</TipBody>
          <p className="mt-1.5 border-t border-[var(--color-line-soft)] pt-1.5 text-[9.5px] leading-relaxed font-medium" style={{ color: t.fg }}>
            {TRUCK_STATE_AVAILABILITY[state]}
          </p>
        </>
      }
    >
      <span
        className="inline-flex items-center rounded-[5px] border px-1.5 py-[2px] text-[9px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase"
        style={{ color: t.fg, backgroundColor: t.bg, borderColor: t.line }}
      >
        {TRUCK_STATE_LABEL[state]}
      </span>
    </Tooltip>
  );
}

/**
 * The key for the four states.
 *
 * The board labels every vehicle with one of these and, until now, defined
 * none of them — the same failure the score badges had before the Score Guide
 * existed. A word in a coloured pill is not self-explanatory just because it
 * is short.
 *
 * The footnote is the honest part: nothing here is observed.
 */
function FleetStates({ counts }: { counts: Record<string, number> }) {
  return (
    <Card>
      <CardHead
        title="Fleet guide"
        right={
          <span className="num text-[8px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
            Idle → Loading → En route → On site → Idle
          </span>
        }
      />
      <ol className="flex flex-col gap-2.5 px-3.5 pb-3">
        {TRUCK_STATE_CYCLE.map((s, i) => (
          <li key={s} className="relative flex items-start gap-2.5 pl-3">
            {/* The rule joining the steps: the cycle is the point, not four
                unrelated labels that happen to share a card. */}
            {i < TRUCK_STATE_CYCLE.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-[14px] left-[3px] h-[calc(100%+4px)] w-px bg-[var(--color-line)]"
              />
            )}
            <span
              aria-hidden="true"
              className="absolute top-[5px] left-0 h-[7px] w-[7px] rounded-full"
              style={{ backgroundColor: TONE[TRUCK_STATE_TONE[s]].fg }}
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <TruckStateChip state={s} />
                {(counts[s] ?? 0) > 0 && (
                  <span className="num text-[9px] text-[var(--color-ink-3)]">
                    {counts[s]} now
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[9.5px] leading-snug text-[var(--color-ink-2)]">
                {TRUCK_STATE_MEANING[s]}
              </span>
              <span
                className="mt-0.5 block text-[9px] leading-snug font-medium"
                style={{ color: TONE[TRUCK_STATE_TONE[s]].fg }}
              >
                {TRUCK_STATE_AVAILABILITY[s]}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="border-t border-[var(--color-line-soft)] px-3.5 py-2">
        <FixtureNote>
          Nothing observes these. A real fleet reports state from a driver app, or infers it from
          vehicle GPS crossing a geofence around each depot and station. The public feed has no
          vehicles at all — though a truck unloading <em>is</em> visible indirectly, as a station
          jumping thirty bikes between two polls.
        </FixtureNote>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   What an idle truck should be doing.
--------------------------------------------------------------------------- */

function NextUp() {
  const lane = useDispatch((s) => s.lanes.truck);
  const openStation = useConsole((s) => s.openStation);

  // Worst-first is already the lane's order, so the head of it is the answer.
  const next = lane.filter((s) => s.breakdown.needsTruck).slice(0, 5);

  return (
    <Card className="overflow-hidden">
      <CardHead
        title="Unassigned — worst first"
        right={
          <span className="num text-[9px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
            Live
          </span>
        }
      />

      {next.length === 0 ? (
        <p className="px-3.5 pb-4 text-[11px] text-[var(--color-ink-3)]">
          Nothing is above the {NEEDS_TRUCK_THRESHOLD}-point dispatch threshold right now.
        </p>
      ) : (
        <ul className="px-3.5 pb-3">
          {next.map((entry, i) => {
            const { station, breakdown } = entry;
            const action = truckAction(breakdown);
            return (
              <li
                key={station.stationId}
                className={cn('py-2', i > 0 && 'border-t border-[var(--color-line-soft)]')}
              >
                <button
                  type="button"
                  onClick={() => openStation(station.stationId)}
                  className="flex w-full items-center gap-2.5 text-left"
                >
                  <ScoreBadge score={breakdown.score} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold text-[var(--color-ink)]">
                      {station.name}
                    </span>
                    <span className="block text-[9.5px] text-[var(--color-ink-3)]">
                      {station.borough} ·{' '}
                      <span
                        style={{
                          color: action.kind === 'drop' ? TONE.empty.fg : TONE.flood.fg,
                        }}
                      >
                        {action.kind === 'drop'
                          ? `drop ${action.bikes} bikes`
                          : action.kind === 'collect'
                            ? `collect ${action.bikes} bikes`
                            : 'no truck can fix'}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-[var(--color-line-soft)] px-3.5 py-2">
        <FixtureNote>
          Truck positions, ETAs and assignments are fixtures — the public feed has no vehicles.
          These targets are live.
        </FixtureNote>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function TruckGlyph({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--color-sunken)] text-[var(--color-ink-2)]"
      style={{ width: size, height: size }}
    >
      <Icon name="truck" size={size * 0.5} />
    </span>
  );
}

function ExpandedTruck({ truck }: { truck: Truck }) {
  // An assignment made from the queue outranks the fixture task — otherwise
  // dispatching a truck here would change nothing on the page about trucks.
  const assigned = useConsole((s) => s.assignments[truck.id]);
  const state = effectiveState(truck, assigned);
  const tone = TRUCK_STATE_TONE[state];

  return (
    <Card className="border-[var(--color-ink)]">
      <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-3">
        <TruckGlyph />
        <div className="min-w-0 flex-1">
          <p className="num text-[13px] font-semibold text-[var(--color-ink)]">Truck {truck.id}</p>
          <p className="mt-px text-[11px]" style={{ color: TONE[tone].fg }}>
            {TRUCK_STATE_LABEL[state]}
            {!assigned && truck.eta && ` · ${truck.eta}`}
            {/* The expanded card is still a row in one of the three groups, and
                it was the only one not carrying the value the grouping is made
                of — so the focused truck looked like it had no availability. */}
            <span className="num ml-2 text-[10px] text-[var(--color-ink-3)]">
              {assigned || truck.freeInMin > 0
                ? `free ${formatFreeIn(assigned ? Math.max(truck.freeInMin, 30) : truck.freeInMin)}`
                : 'free now'}
            </span>
          </p>
        </div>

        <div className="w-[168px] shrink-0">
          <p className="eyebrow text-right text-[9px]">Capacity</p>
          <div className="mt-1.5 flex items-center gap-2">
            <Bar value={truck.load / truck.capacity} tone="ok" height={5} />
            <span className="num shrink-0 text-[11px] font-semibold text-[var(--color-ink)]">
              {truck.load}/{truck.capacity}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-3.5 py-2.5">
        {assigned ? (
          <p className="text-[11px] text-[var(--color-ink-2)]">
            <span className="font-semibold" style={{ color: TONE.ok.fg }}>
              Assigned {assigned.at}:
            </span>{' '}
            {assigned.instruction} at{' '}
            <span className="font-semibold text-[var(--color-ink)]">{assigned.stationName}</span>
          </p>
        ) : (
          <p className="text-[11px] text-[var(--color-ink-2)]">
            <span className="font-semibold text-[var(--color-ink)]">Active:</span> {truck.active}
          </p>
        )}
        <Button size="sm">Options</Button>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   The fleet, grouped by when each vehicle can take work.
--------------------------------------------------------------------------- */

const GROUP_TONE: Record<Availability, Tone> = {
  'free-now': 'empty',
  'free-shortly': 'warn',
  committed: 'mute',
};

/**
 * Three groups instead of eight rows.
 *
 * The list was in fixture-declaration order, which looked state-sorted by
 * coincidence and would have shuffled the moment anyone added a truck. Worse,
 * the page opens with a red callout about idle trucks and then drew those exact
 * trucks with `tone="mute"` — the quietest rows on the screen were the ones the
 * headline was shouting about.
 *
 * Free-now is therefore the loud group and sits first, committed is collapsed,
 * and the ordering is a consequence of the data rather than of where somebody
 * happened to type a fixture.
 */
function FleetByAvailability({
  groups,
  focused,
  onFocus,
  stateOf,
}: {
  groups: FleetGroups;
  focused: string;
  onFocus: (id: string) => void;
  stateOf: (t: Truck) => TruckState;
}) {
  const [showCommitted, setShowCommitted] = useState(false);
  const order: Availability[] = ['free-now', 'free-shortly', 'committed'];

  return (
    <div className="flex flex-col gap-3.5">
      {order.map((key) => {
        const rows = groups[key];
        if (rows.length === 0) return null;
        const collapsed = key === 'committed' && !showCommitted;

        return (
          <section key={key}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span
                className="eyebrow text-[9px]"
                style={{ color: key === 'committed' ? undefined : TONE[GROUP_TONE[key]].fg }}
              >
                {AVAILABILITY_LABEL[key]}
              </span>
              <span className="num text-[10px] font-semibold text-[var(--color-ink)]">
                {rows.length}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9.5px] text-[var(--color-ink-3)]">
                {AVAILABILITY_NOTE[key]}
              </span>
              {key === 'committed' && (
                <button
                  type="button"
                  onClick={() => setShowCommitted((v) => !v)}
                  className="shrink-0 text-[10px] text-[var(--color-ink-3)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
                >
                  {collapsed ? 'Show' : 'Hide'}
                </button>
              )}
            </div>

            {!collapsed && (
              <ul className="flex flex-col gap-2">
                {rows.map((row) =>
                  row.truck.id === focused ? (
                    <li key={row.truck.id}>
                      <ExpandedTruck truck={row.truck} />
                    </li>
                  ) : (
                    <li key={row.truck.id}>
                      <CollapsedTruck
                        truck={row.truck}
                        row={row}
                        state={stateOf(row.truck)}
                        onOpen={() => onFocus(row.truck.id)}
                      />
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * The suggested job on a free truck's card.
 *
 * The two panels were adjacent and unrelated: a list of trucks with nothing to
 * do beside a list of stations needing one, and a person in the middle doing
 * the join by eye. The pairing shows its reasoning because a suggestion a
 * dispatcher cannot audit is one they will either follow blindly or ignore
 * entirely, and both are worse than a slightly worse suggestion they can check.
 */
function MatchRow({ row, onAssign }: { row: FleetRow; onAssign: () => void }) {
  const { match } = row;
  if (!match) {
    const empty = row.truck.load === 0;
    return (
      <p className="border-t border-[var(--color-line-soft)] px-3.5 py-2 text-[10px] text-[var(--color-ink-3)]">
        {empty
          ? 'Nothing to suggest — this truck is empty, so it can only collect, and every open job nearby needs bikes dropped. Load it at a depot first.'
          : 'Nothing to suggest — it is full, so it can only drop, and the open jobs nearby need collecting.'}
      </p>
    );
  }

  const { job, minutes, complete, servable } = match;
  const drop = job.action.kind === 'drop';

  return (
    <div className="flex items-center gap-2.5 border-t border-[var(--color-line-soft)] px-3.5 py-2">
      <ScoreBadge score={job.station.breakdown.score} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-[var(--color-ink)]">
          {job.station.station.name}
        </span>
        <span className="block text-[9.5px] text-[var(--color-ink-3)]">
          <span style={{ color: drop ? TONE.empty.fg : TONE.flood.fg }}>
            {drop ? 'drop' : 'collect'}{' '}
            {complete ? job.action.bikes : `${servable} of ${job.action.bikes}`}
          </span>{' '}
          · {minutes} min away · {match.why}
        </span>
      </span>
      <Button size="sm" variant="dark" icon="truck" onClick={onAssign}>
        Assign
      </Button>
    </div>
  );
}

function CollapsedTruck({
  truck,
  row,
  state,
  onOpen,
}: {
  truck: Truck;
  row: FleetRow;
  state: TruckState;
  onOpen: () => void;
}) {
  const openStation = useConsole((s) => s.openStation);
  const free = row.availability !== 'committed';

  return (
    <Card className={cn(free && 'border-[var(--color-ink-3)]')}>
      <Tooltip
        width={300}
        content={
          <>
            <TipTitle>Truck {truck.id}</TipTitle>
            <TipBody>
              <span className="block">
                {TRUCK_STATE_LABEL[state]} · free {formatFreeIn(row.freeInMin)}
              </span>
              <span className="mt-1 block">
                Carrying {truck.load} of {truck.capacity} · {truck.capacity - truck.load} slots free
              </span>
              <span className="mt-1 block">At {truck.where}</span>
              <span className="mt-1 block">Home depot {truck.depot}</span>
              {truck.when && <span className="mt-1 block">{truck.when}</span>}
            </TipBody>
          </>
        }
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left"
        >
          <TruckGlyph size={28} />
          <span className="num text-[12px] font-semibold text-[var(--color-ink)]">
            Truck {truck.id}
          </span>
          <TruckStateChip state={state} />

          {/* The free-at value, beside the state rather than instead of it.
              "En route" says what it is doing; only the minutes say whether
              that matters to the decision in front of you. */}
          <span className="num shrink-0 text-[10px] text-[var(--color-ink-2)]">
            {row.freeInMin <= 0 ? 'free now' : `busy ${formatFreeIn(row.freeInMin)}`}
          </span>

          <span className="ml-auto flex items-center gap-3">
            {/* Load as a number, not only a bar. An idle truck carrying 26 and
                an idle truck carrying none are different assets, and two short
                bars at a glance are not. */}
            <span className="num shrink-0 text-[10px] text-[var(--color-ink-2)]">
              {truck.load}
              <span className="text-[var(--color-ink-3)]">/{truck.capacity}</span>
            </span>
            <span className="w-[70px] shrink-0">
              <Bar
                value={truck.capacity > 0 ? truck.load / truck.capacity : 0}
                tone={truck.load === 0 ? 'mute' : 'ok'}
                height={4}
              />
            </span>
            <Icon name="chevron-right" size={14} className="text-[var(--color-ink-3)]" />
          </span>
        </button>
      </Tooltip>

      {free && (
        <MatchRow
          row={row}
          onAssign={() => row.match && openStation(row.match.job.station.station.stationId)}
        />
      )}
    </Card>
  );
}

function FocusCard() {
  return (
    <Card>
      <CardHead
        title={`Active focus: ${TRUCK_FOCUS.id}`}
        right={
          <span className="num text-[9px] tracking-[0.08em] uppercase" style={{ color: TONE.ok.fg }}>
            Live sync
          </span>
        }
      />

      <ol className="px-3.5 pt-1 pb-4">
        <TimelineStep
          eyebrow="Current task"
          title={TRUCK_FOCUS.current.title}
          where={TRUCK_FOCUS.current.where}
          filled
        />
        <TimelineStep
          eyebrow={TRUCK_FOCUS.next.in}
          title={TRUCK_FOCUS.next.title}
          where={TRUCK_FOCUS.next.where}
        />
      </ol>
    </Card>
  );
}

/**
 * A step on the truck's run. The rule connecting the dots is drawn on the item
 * rather than between them so the last step's line ends at its own dot.
 */
function TimelineStep({
  eyebrow,
  title,
  where,
  filled = false,
}: {
  eyebrow: string;
  title: string;
  where: string;
  filled?: boolean;
}) {
  return (
    <li className={cn('relative pl-5', !filled && 'mt-4')}>
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[3px] left-0 h-[9px] w-[9px] rounded-full border-2',
          filled
            ? 'border-[var(--color-ink)] bg-[var(--color-ink)]'
            : 'border-[var(--color-line)] bg-[var(--color-surface)]',
        )}
      />
      {filled && (
        <span
          aria-hidden="true"
          className="absolute top-[14px] left-[4px] h-[calc(100%+8px)] w-px bg-[var(--color-line)]"
        />
      )}
      <p className="eyebrow text-[9px]">{eyebrow}</p>
      <p className="mt-1 text-[12px] font-semibold text-[var(--color-ink)]">{title}</p>
      <p className="mt-0.5 text-[11px]" style={{ color: TONE.warn.fg }}>
        {where}
      </p>
    </li>
  );
}
