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
import { useConsole, type VehicleAssignment } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { rebalanceDemand, vehicleAction } from '../data/insights';
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
import { NEEDS_VEHICLE_THRESHOLD } from '../model/score';
import {
  VEHICLES,
  VEHICLE_FOCUS,
  VEHICLE_STATE_LABEL,
  VEHICLE_STATE_AVAILABILITY,
  VEHICLE_STATE_CYCLE,
  VEHICLE_STATE_MEANING,
  VEHICLE_STATE_TONE,
  type Vehicle,
  type VehicleState,
} from '../mock/data';
import { cn } from '../lib/cn';

/**
 * The fleet.
 *
 * One vehicle is expanded at a time and everything else collapses to a single
 * line. A dispatcher is working one vehicle at a time; eight equally detailed
 * cards would be eight things to read before finding the one that matters.
 */
export function VehicleDispatch() {
  const [focused, setFocused] = useState(VEHICLE_FOCUS.id);
  const assignments = useConsole((s) => s.assignments);

  // Dispatching from the queue should be visible the moment you arrive here.
  // Without this the assignment existed but sat inside a collapsed row, so the
  // page about vehicles appeared not to have noticed.
  const latest = Object.values(assignments).sort((a, b) => b.at.localeCompare(a.at))[0];
  useEffect(() => {
    if (latest) setFocused(latest.vehicleId);
  }, [latest?.vehicleId, latest?.at]);
  // Derived from assignments, not from the fixture array. Reading the static
  // list meant dispatching a vehicle left it labelled Idle, kept the pill at
  // "3 Idle", and let the headline go on claiming three vehicles were doing
  // nothing immediately after you gave one a job.
  const stateOf = (t: Vehicle) => effectiveState(t, assignments[t.id]);
  const counts = VEHICLES.reduce<Record<string, number>>((acc, t) => {
    const s = stateOf(t);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const idle = counts.idle ?? 0;

  const lane = useDispatch((s) => s.lanes.vehicle);
  const summary = useDispatch((s) => s.summary);
  const demand = rebalanceDemand(lane);

  /**
   * Outstanding work, in single-vehicle loads.
   *
   * This replaced a figure labelled "vehicle runs" that divided the workload by
   * the capacity of the *entire active fleet* — so it counted how many times
   * all five vehicles together would fill and empty. At 3,605 bikes that printed
   * "16 vehicle runs" for what is really 16 × 5 = 80 individual trips. Nobody
   * reads "16 vehicle runs" as eighty.
   *
   * Dividing by one vehicle instead gives a number that means what it says and
   * does not silently change when a vehicle goes on or off shift — the work is
   * the work regardless of who is available to do it.
   */
  const vehicleCapacity = Math.max(...VEHICLES.map((t) => t.capacity));
  const loads = vehicleCapacity > 0 ? Math.ceil(demand.relocatable / vehicleCapacity) : 0;

  /**
   * Availability, and a candidate job for everyone who can take one.
   *
   * An assigned vehicle is committed no matter what the fixture says its
   * `freeInMin` is — the assignment is the newer fact. Without this, dispatching
   * a vehicle from the queue left it sitting in FREE NOW being offered a second
   * station.
   */
  const taken = new Set(
    Object.values(assignments)
      .map((a) => a.stationId)
      .filter((id): id is string => Boolean(id)),
  );
  const jobs = useMemo(() => openJobs(lane, taken), [lane, assignments]);
  const groups = useMemo(
    () => groupFleet(VEHICLES, (t) => (assignments[t.id] ? Math.max(t.freeInMin, 999) : t.freeInMin), jobs),
    [assignments, jobs],
  );

  return (
    <>
      <PageHeader
        title="Fleet Operations"
        subtitle={`${VEHICLES.length} vehicles against ${(summary?.needsVehicle ?? 0).toLocaleString('en-US')} stations that need one. What is outstanding, who is moving, and what the idle vehicles could be doing.`}
        actions={
          <>
            <Button icon="file-text" notBuilt="Would export the shift's fleet state as a PDF.">
              Fleet Status Report
            </Button>
            <Button
              variant="dark"
              icon="plus"
              notBuilt="Multi-stop routing is not modelled — assign one station at a time from a vehicle card."
            >
              Assign New Route
            </Button>
          </>
        }
      />

      <PageBody>
        <WorkloadFinding
          demand={demand}
          idle={idle}
          loads={loads}
          vehicleCapacity={vehicleCapacity}
          needsVehicle={summary?.needsVehicle ?? 0}
        />

        <div className="mt-3.5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 className="eyebrow text-[10px]">Operational fleet ({VEHICLES.length} total)</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {(Object.keys(VEHICLE_STATE_LABEL) as VehicleState[])
                  .filter((s) => (counts[s] ?? 0) > 0)
                  .map((s) => (
                    <TonePill
                      key={s}
                      label={`${counts[s]} ${VEHICLE_STATE_LABEL[s]}`}
                      tone={VEHICLE_STATE_TONE[s]}
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

          <aside className="flex flex-col gap-3.5" aria-label="Active vehicle focus">
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
 * What a vehicle is doing once a coordinator has given it a job.
 *
 *   Idle      parked at a depot, nothing assigned
 *   Loading   moving bikes on or off — at a depot, or at a station too full
 *   En route  driving between two points
 *
 * A vehicle sent to *drop* bikes with an empty bed has to fill up first, so it
 * goes to Loading; anything else is already on the road. Crude, but it is the
 * honest consequence of the instruction rather than a state picked at random.
 */
function effectiveState(vehicle: Vehicle, assignment?: VehicleAssignment): VehicleState {
  if (!assignment) return vehicle.state;
  const needsStock = assignment.instruction.startsWith('drop') && vehicle.load === 0;
  return needsStock ? 'loading' : 'en-route';
}

/* ---------------------------------------------------------------------------
   The workload, and whether the fleet is equal to it.
--------------------------------------------------------------------------- */

function WorkloadFinding({
  demand,
  idle,
  loads,
  vehicleCapacity,
  needsVehicle,
}: {
  demand: ReturnType<typeof rebalanceDemand>;
  idle: number;
  /** Outstanding work in single-vehicle loads. Independent of fleet size. */
  loads: number;
  vehicleCapacity: number;
  needsVehicle: number;
}) {
  if (needsVehicle === 0) {
    return (
      <Finding
        icon="vehicle"
        tone="mute"
        headline="Waiting for the first poll…"
        detail="Outstanding work is computed from the live queue."
      />
    );
  }

  // Idle vehicles while work is outstanding is the whole story of this screen.
  const tone: Tone = idle > 0 && needsVehicle > 0 ? 'empty' : loads > 20 ? 'warn' : 'ok';

  return (
    <Finding
      icon="vehicle"
      tone={tone}
      /*
       * The headline used to read "3 of 8 vehicles are idle while 769 stations
       * need one", which invites exactly the wrong arithmetic: *one* refers
       * back to vehicles, so a reader lands on 769 vehicles and concludes the fleet
       * is short by 761. It compared a count of vehicles against a count of
       * places, which are not the same kind of thing, and never said that one
       * load serves several stations.
       *
       * Both halves are now stated in loads — a unit that means the same
       * thing on either side of the sentence.
       */
      headline={
        idle > 0 ? (
          <>
            {idle} of {VEHICLES.length} vehicles are parked while{' '}
            {loads.toLocaleString('en-US')} loads of rebalancing sit outstanding.
          </>
        ) : (
          <>
            The whole fleet is out, against {loads.toLocaleString('en-US')} loads of
            rebalancing.
          </>
        )
      }
      detail={
        <>
          {demand.deficit.toLocaleString('en-US')} bikes to deliver, {demand.surplus.toLocaleString('en-US')}{' '}
          to collect — {demand.relocatable.toLocaleString('en-US')} of that just moves between
          stations, the rest runs through a depot.
          {idle > 0 && (
            <>
              {' '}
              <strong className="font-semibold text-[var(--color-ink)]">
                {(idle * vehicleCapacity).toLocaleString('en-US')} bikes of carrying capacity is parked
                at a depot right now.
              </strong>
            </>
          )}{' '}
          One load is emptied across several stops, so {loads.toLocaleString('en-US')} loads —
          not {needsVehicle.toLocaleString('en-US')} — is the real trip count.
        </>
      }
      stats={[
        { label: 'to deliver', value: demand.deficit.toLocaleString('en-US'), tone: 'empty' },
        { label: 'to collect', value: demand.surplus.toLocaleString('en-US'), tone: 'flood' },
        { label: 'relocatable', value: demand.relocatable.toLocaleString('en-US') },
        {
          label: 'loads',
          value: loads.toLocaleString('en-US'),
          tone: loads > 20 ? 'warn' : 'ok',
        },
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
export function VehicleStateChip({ state }: { state: VehicleState }) {
  const t = TONE[VEHICLE_STATE_TONE[state]];
  return (
    <Tooltip
      help
      width={260}
      content={
        <>
          <TipTitle>{VEHICLE_STATE_LABEL[state]}</TipTitle>
          <TipBody>{VEHICLE_STATE_MEANING[state]}</TipBody>
          <p className="mt-1.5 border-t border-[var(--color-line-soft)] pt-1.5 text-[10px] leading-relaxed font-medium" style={{ color: t.fg }}>
            {VEHICLE_STATE_AVAILABILITY[state]}
          </p>
        </>
      }
    >
      <span
        className="inline-flex items-center rounded-[5px] border px-1.5 py-[2px] text-[10px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase"
        style={{ color: t.fg, backgroundColor: t.bg, borderColor: t.line }}
      >
        {VEHICLE_STATE_LABEL[state]}
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
          <span className="num text-[10px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
            Idle → Loading → En route → On site → Idle
          </span>
        }
      />
      <ol className="flex flex-col gap-2.5 px-3.5 pb-3">
        {VEHICLE_STATE_CYCLE.map((s, i) => (
          <li key={s} className="relative flex items-start gap-2.5 pl-3">
            {/* The rule joining the steps: the cycle is the point, not four
                unrelated labels that happen to share a card. */}
            {i < VEHICLE_STATE_CYCLE.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-[14px] left-[3px] h-[calc(100%+4px)] w-px bg-[var(--color-line)]"
              />
            )}
            <span
              aria-hidden="true"
              className="absolute top-[5px] left-0 h-[7px] w-[7px] rounded-full"
              style={{ backgroundColor: TONE[VEHICLE_STATE_TONE[s]].fg }}
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <VehicleStateChip state={s} />
                {(counts[s] ?? 0) > 0 && (
                  <span className="num text-[10px] text-[var(--color-ink-3)]">
                    {counts[s]} now
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[10px] leading-snug text-[var(--color-ink-2)]">
                {VEHICLE_STATE_MEANING[s]}
              </span>
              <span
                className="mt-0.5 block text-[10px] leading-snug font-medium"
                style={{ color: TONE[VEHICLE_STATE_TONE[s]].fg }}
              >
                {VEHICLE_STATE_AVAILABILITY[s]}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="border-t border-[var(--color-line-soft)] px-3.5 py-2">
        <FixtureNote>
          Nothing observes these. A real fleet reports state from a driver app, or infers it from
          vehicle GPS crossing a geofence around each depot and station. The public feed has no
          vehicles at all — though a vehicle unloading <em>is</em> visible indirectly, as a station
          jumping thirty bikes between two polls.
        </FixtureNote>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   What an idle vehicle should be doing.
--------------------------------------------------------------------------- */

function NextUp() {
  const lane = useDispatch((s) => s.lanes.vehicle);
  const openStation = useConsole((s) => s.openStation);

  // Worst-first is already the lane's order, so the head of it is the answer.
  const next = lane.filter((s) => s.breakdown.needsVehicle).slice(0, 5);

  return (
    <Card className="overflow-hidden">
      <CardHead
        title="Unassigned — worst first"
        right={
          <span className="num text-[10px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
            Live
          </span>
        }
      />

      {next.length === 0 ? (
        <p className="px-3.5 pb-4 text-[11px] text-[var(--color-ink-3)]">
          Nothing is above the {NEEDS_VEHICLE_THRESHOLD}-point dispatch threshold right now.
        </p>
      ) : (
        <ul className="px-3.5 pb-3">
          {next.map((entry, i) => {
            const { station, breakdown } = entry;
            const action = vehicleAction(breakdown);
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
                    <span className="block text-[10px] text-[var(--color-ink-3)]">
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
                            : 'no vehicle can fix'}
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
          Vehicle positions, ETAs and assignments are fixtures — the public feed has no vehicles.
          These targets are live.
        </FixtureNote>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function VehicleGlyph({ size = 34 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg bg-[var(--color-sunken)] text-[var(--color-ink-2)]"
      style={{ width: size, height: size }}
    >
      <Icon name="vehicle" size={size * 0.5} />
    </span>
  );
}

function ExpandedVehicle({ vehicle }: { vehicle: Vehicle }) {
  // An assignment made from the queue outranks the fixture task — otherwise
  // dispatching a vehicle here would change nothing on the page about vehicles.
  const assigned = useConsole((s) => s.assignments[vehicle.id]);
  const state = effectiveState(vehicle, assigned);
  const tone = VEHICLE_STATE_TONE[state];

  return (
    <Card className="border-[var(--color-ink)]">
      <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-3">
        <VehicleGlyph />
        <div className="min-w-0 flex-1">
          <p className="num text-[13px] font-semibold text-[var(--color-ink)]">Vehicle {vehicle.id}</p>
          <p className="mt-px text-[11px]" style={{ color: TONE[tone].fg }}>
            {VEHICLE_STATE_LABEL[state]}
            {!assigned && vehicle.eta && ` · ${vehicle.eta}`}
            {/* The expanded card is still a row in one of the three groups, and
                it was the only one not carrying the value the grouping is made
                of — so the focused vehicle looked like it had no availability. */}
            <span className="num ml-2 text-[10px] text-[var(--color-ink-3)]">
              {assigned || vehicle.freeInMin > 0
                ? `free ${formatFreeIn(assigned ? Math.max(vehicle.freeInMin, 30) : vehicle.freeInMin)}`
                : 'free now'}
            </span>
          </p>
        </div>

        <div className="w-[168px] shrink-0">
          <p className="eyebrow text-right text-[10px]">Capacity</p>
          <div className="mt-1.5 flex items-center gap-2">
            <Bar value={vehicle.load / vehicle.capacity} tone="ok" height={5} />
            <span className="num shrink-0 text-[11px] font-semibold text-[var(--color-ink)]">
              {vehicle.load}/{vehicle.capacity}
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
            <span className="font-semibold text-[var(--color-ink)]">Active:</span> {vehicle.active}
          </p>
        )}
        <Button size="sm" notBuilt="Would re-task, recall, or take this vehicle off shift.">
          Options
        </Button>
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
 * coincidence and would have shuffled the moment anyone added a vehicle. Worse,
 * the page opens with a red callout about idle vehicles and then drew those exact
 * vehicles with `tone="mute"` — the quietest rows on the screen were the ones the
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
  stateOf: (t: Vehicle) => VehicleState;
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
                className="eyebrow text-[10px]"
                style={{ color: key === 'committed' ? undefined : TONE[GROUP_TONE[key]].fg }}
              >
                {AVAILABILITY_LABEL[key]}
              </span>
              <span className="num text-[10px] font-semibold text-[var(--color-ink)]">
                {rows.length}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--color-ink-3)]">
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
                  row.vehicle.id === focused ? (
                    <li key={row.vehicle.id}>
                      <ExpandedVehicle vehicle={row.vehicle} />
                    </li>
                  ) : (
                    <li key={row.vehicle.id}>
                      <CollapsedVehicle
                        vehicle={row.vehicle}
                        row={row}
                        state={stateOf(row.vehicle)}
                        onOpen={() => onFocus(row.vehicle.id)}
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
 * The suggested job on a free vehicle's card.
 *
 * The two panels were adjacent and unrelated: a list of vehicles with nothing to
 * do beside a list of stations needing one, and a person in the middle doing
 * the join by eye. The pairing shows its reasoning because a suggestion a
 * dispatcher cannot audit is one they will either follow blindly or ignore
 * entirely, and both are worse than a slightly worse suggestion they can check.
 */
function MatchRow({ row, onAssign }: { row: FleetRow; onAssign: () => void }) {
  const { match } = row;
  if (!match) {
    const empty = row.vehicle.load === 0;
    return (
      <p className="border-t border-[var(--color-line-soft)] px-3.5 py-2 text-[10px] text-[var(--color-ink-3)]">
        {empty
          ? 'Nothing to suggest — this vehicle is empty, so it can only collect, and every open job nearby needs bikes dropped. Load it at a depot first.'
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
        <span className="block text-[10px] text-[var(--color-ink-3)]">
          <span style={{ color: drop ? TONE.empty.fg : TONE.flood.fg }}>
            {drop ? 'drop' : 'collect'}{' '}
            {complete ? job.action.bikes : `${servable} of ${job.action.bikes}`}
          </span>{' '}
          · {minutes} min away · {match.why}
        </span>
      </span>
      <Button size="sm" variant="dark" icon="vehicle" onClick={onAssign}>
        Assign
      </Button>
    </div>
  );
}

function CollapsedVehicle({
  vehicle,
  row,
  state,
  onOpen,
}: {
  vehicle: Vehicle;
  row: FleetRow;
  state: VehicleState;
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
            <TipTitle>Vehicle {vehicle.id}</TipTitle>
            <TipBody>
              <span className="block">
                {VEHICLE_STATE_LABEL[state]} · free {formatFreeIn(row.freeInMin)}
              </span>
              <span className="mt-1 block">
                Carrying {vehicle.load} of {vehicle.capacity} · {vehicle.capacity - vehicle.load} slots free
              </span>
              <span className="mt-1 block">At {vehicle.where}</span>
              <span className="mt-1 block">Home depot {vehicle.depot}</span>
              {vehicle.when && <span className="mt-1 block">{vehicle.when}</span>}
            </TipBody>
          </>
        }
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left"
        >
          <VehicleGlyph size={28} />
          <span className="num text-[12px] font-semibold text-[var(--color-ink)]">
            Vehicle {vehicle.id}
          </span>
          <VehicleStateChip state={state} />

          {/* The free-at value, beside the state rather than instead of it.
              "En route" says what it is doing; only the minutes say whether
              that matters to the decision in front of you. */}
          <span className="num shrink-0 text-[10px] text-[var(--color-ink-2)]">
            {row.freeInMin <= 0 ? 'free now' : `busy ${formatFreeIn(row.freeInMin)}`}
          </span>

          <span className="ml-auto flex items-center gap-3">
            {/* Load as a number, not only a bar. An idle vehicle carrying 26 and
                an idle vehicle carrying none are different assets, and two short
                bars at a glance are not. */}
            <span className="num shrink-0 text-[10px] text-[var(--color-ink-2)]">
              {vehicle.load}
              <span className="text-[var(--color-ink-3)]">/{vehicle.capacity}</span>
            </span>
            <span className="w-[70px] shrink-0">
              <Bar
                value={vehicle.capacity > 0 ? vehicle.load / vehicle.capacity : 0}
                tone={vehicle.load === 0 ? 'mute' : 'ok'}
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
        title={`Active focus: ${VEHICLE_FOCUS.id}`}
        right={
          <span className="num text-[10px] tracking-[0.08em] uppercase" style={{ color: TONE.ok.fg }}>
            Live sync
          </span>
        }
      />

      <ol className="px-3.5 pt-1 pb-4">
        <TimelineStep
          eyebrow="Current task"
          title={VEHICLE_FOCUS.current.title}
          where={VEHICLE_FOCUS.current.where}
          filled
        />
        <TimelineStep
          eyebrow={VEHICLE_FOCUS.next.in}
          title={VEHICLE_FOCUS.next.title}
          where={VEHICLE_FOCUS.next.where}
        />
      </ol>
    </Card>
  );
}

/**
 * A step on the vehicle's run. The rule connecting the dots is drawn on the item
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
      <p className="eyebrow text-[10px]">{eyebrow}</p>
      <p className="mt-1 text-[12px] font-semibold text-[var(--color-ink)]">{title}</p>
      <p className="mt-0.5 text-[11px]" style={{ color: TONE.warn.fg }}>
        {where}
      </p>
    </li>
  );
}
