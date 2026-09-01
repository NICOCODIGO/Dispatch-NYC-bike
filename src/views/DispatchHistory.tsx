import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import {
  Bar,
  Button,
  Card,
  CardHead,
  Finding,
  FixtureNote,
  Td,
  Th,
  TonePill,
} from '../ui/primitives';
import { TipBody, TipTitle, Tooltip } from '../ui/Tooltip';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { toStationRow } from '../data/adapt';
import {
  OUTCOME_LABEL,
  OUTCOME_MEANING,
  bikesMoved,
  elapsedMinutes,
  outcomeOf,
  realization,
  runSummary,
  snapshotOf,
  statsByDepot,
  statsByTruck,
  statsOverall,
  type DispatchRun,
  type RunOutcome,
} from '../data/dispatchRun';
import { focusHref } from '../state/useFocus';
import { Link } from 'react-router-dom';

/**
 * Whether the trucks we sent achieved anything.
 *
 * The recovery figure on Analytics measures the *network* — it counts any
 * flagged station that improved, including ones that fixed themselves when
 * rush hour ended. This measures our own actions: a specific vehicle sent to a
 * specific station with a specific order, and what the feed said afterwards.
 *
 * Two numbers matter here and exist nowhere else. Realization rate is how much
 * of the ordered quantity actually moved — the gap between "collect 37" and 34
 * collected is real and worth knowing per crew. Recovery rate is how often a
 * completed run actually pushed the station back under the threshold, which is
 * the only evidence that the dispatch decision was the right one.
 */

const OUTCOME_TONE: Record<RunOutcome, Tone> = {
  recovered: 'ok',
  partial: 'warn',
  'no-change': 'mute',
  worse: 'empty',
};

export function DispatchHistory() {
  const runs = useConsole((s) => s.runs);
  const completeRun = useConsole((s) => s.completeRun);
  const cancelRun = useConsole((s) => s.cancelRun);
  const byId = useDispatch((s) => s.byId);

  const open = runs.filter((r) => !r.after);
  const done = runs.filter((r) => r.after);
  const overall = statsOverall(runs);
  const byTruck = statsByTruck(runs);
  const byDepot = statsByDepot(runs);

  const finish = (run: DispatchRun) => {
    const live = byId.get(run.stationId);
    completeRun(run.id, live ? snapshotOf(toStationRow(live)) : run.before, false);
  };

  return (
    <>
      <PageHeader
        title="Dispatch History"
        subtitle="Every truck sent, what was ordered, and what the feed said afterwards. The only measure of whether dispatching works."
      />

      <PageBody>
        <Headline overall={overall} openCount={open.length} />

        {open.length > 0 && (
          <Card className="mt-3.5 overflow-hidden">
            <CardHead
              title={`In flight (${open.length})`}
              right={
                <span className="num text-[10px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
                  Closes on ETA
                </span>
              }
            />
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <Th width={80}>Truck</Th>
                  <Th>Station</Th>
                  <Th width={150}>Ordered</Th>
                  <Th width={130}>Elapsed</Th>
                  <Th width={170} align="right">
                    Action
                  </Th>
                </tr>
              </thead>
              <tbody>
                {open.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-[var(--color-line-soft)] last:border-b-0"
                  >
                    <Td>
                      <span className="num text-[12px] font-semibold text-[var(--color-ink)]">
                        {run.truckId}
                      </span>
                      <span className="block text-[10px] text-[var(--color-ink-3)]">
                        {run.depot}
                      </span>
                    </Td>
                    <Td>
                      <Link
                        to={focusHref('/', run.stationId, 'Dispatch History', '/dispatch/history')}
                        className="text-[12px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
                      >
                        {run.stationName}
                      </Link>
                      <span className="block text-[10px] text-[var(--color-ink-3)]">
                        {run.borough}
                      </span>
                    </Td>
                    <Td className="num text-[11px] text-[var(--color-ink-2)]">
                      {run.kind} {run.ordered}
                    </Td>
                    <Td>
                      <span className="num text-[11px] text-[var(--color-ink-2)]">
                        {elapsedMinutes(run)}m of {run.etaMinutes}m
                      </span>
                      <span className="mt-1 block">
                        <Bar
                          value={Math.min(1, elapsedMinutes(run) / run.etaMinutes)}
                          tone="warn"
                          height={4}
                        />
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => cancelRun(run.id)}>
                          Cancel
                        </Button>
                        <Button size="sm" variant="dark" onClick={() => finish(run)}>
                          Mark done
                        </Button>
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card className="mt-3.5 overflow-hidden">
          <CardHead title={`Completed runs (${done.length})`} />
          {done.length === 0 ? (
            <p className="border-t border-[var(--color-line)] px-4 py-10 text-center text-[12px] text-[var(--color-ink-2)]">
              No run has finished yet. Dispatch a truck from the queue, then mark it done — or
              leave it and it closes itself when the ETA lapses.
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <Th width={110}>Outcome</Th>
                  <Th width={80}>Truck</Th>
                  <Th>Station</Th>
                  <Th>Before → after</Th>
                  <Th width={130} align="right">
                    Realization
                  </Th>
                </tr>
              </thead>
              <tbody>
                {done.map((run) => {
                  const outcome = outcomeOf(run)!;
                  const share = realization(run);
                  return (
                    <tr
                      key={run.id}
                      className="border-b border-[var(--color-line-soft)] last:border-b-0"
                    >
                      <Td>
                        <Tooltip
                          help
                          content={
                            <>
                              <TipTitle>{OUTCOME_LABEL[outcome]}</TipTitle>
                              <TipBody>{OUTCOME_MEANING[outcome]}</TipBody>
                            </>
                          }
                        >
                          <TonePill label={OUTCOME_LABEL[outcome]} tone={OUTCOME_TONE[outcome]} />
                        </Tooltip>
                        {run.auto && (
                          <span className="mt-1 block text-[10px] text-[var(--color-ink-3)] italic">
                            unconfirmed
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="num text-[12px] font-semibold text-[var(--color-ink)]">
                          {run.truckId}
                        </span>
                        <span className="block text-[10px] text-[var(--color-ink-3)]">
                          {run.depot}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          to={focusHref('/', run.stationId, 'Dispatch History', '/dispatch/history')}
                          className="text-[12px] font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
                        >
                          {run.stationName}
                        </Link>
                        <span className="block text-[10px] text-[var(--color-ink-3)]">
                          {run.borough}
                        </span>
                      </Td>
                      <Td className="num text-[11px] text-[var(--color-ink-2)]">
                        {runSummary(run)}
                      </Td>
                      <Td align="right">
                        <span
                          className="num text-[11px] font-semibold"
                          style={{
                            color:
                              share === null
                                ? TONE.mute.fg
                                : share >= 0.8
                                  ? TONE.ok.fg
                                  : share >= 0.4
                                    ? TONE.warn.fg
                                    : TONE.empty.fg,
                          }}
                        >
                          {share === null ? '–' : `${Math.round(share * 100)}%`}
                        </span>
                        <span className="num mt-0.5 block text-[10px] text-[var(--color-ink-3)]">
                          {bikesMoved(run) ?? '–'} of {run.ordered}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
          <StatsTable title="By truck" label="Truck" stats={byTruck} />
          <StatsTable title="By depot" label="Depot" stats={byDepot} />
        </div>

        <FixtureNote>
          The fleet is invented, so these rates measure invented vehicles. The station readings on
          both sides of every run are real, which means the arithmetic is sound even though the
          crews are not — wire in a driver app and this table becomes true without changing.
        </FixtureNote>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Headline({
  overall,
  openCount,
}: {
  overall: ReturnType<typeof statsOverall>;
  openCount: number;
}) {
  if (overall.runs === 0) {
    return (
      <Finding
        icon="truck"
        tone="mute"
        headline="No trucks have been sent yet."
        detail="Dispatch one from the rebalancing board and this becomes a record of whether it worked — how much of the ordered quantity actually moved, and whether the station recovered."
      />
    );
  }

  const rate = overall.recoveryRate;
  const tone: Tone = rate === null ? 'mute' : rate >= 0.6 ? 'ok' : rate >= 0.3 ? 'warn' : 'empty';

  return (
    <Finding
      icon="truck"
      tone={tone}
      headline={
        overall.completed === 0 ? (
          <>{openCount} run{openCount === 1 ? '' : 's'} in flight, none finished yet.</>
        ) : (
          <>
            {overall.recovered} of {overall.completed} completed run
            {overall.completed === 1 ? '' : 's'} put the station back under the threshold.
          </>
        )
      }
      detail={
        overall.completed === 0
          ? 'Outcomes appear once a run is marked done, or once its ETA lapses and the board closes it against the current reading.'
          : `Crews moved ${overall.moved} of the ${overall.ordered} bikes ordered. The gap between what is asked for and what arrives is the realization rate, and it is the number a supervisor should watch — a truck that reliably delivers 60% of an order is not a truck you can plan around.`
      }
      stats={[
        { label: 'in flight', value: openCount },
        { label: 'completed', value: overall.completed },
        { label: 'recovered', value: overall.recovered, tone: 'ok' },
        {
          label: 'realization',
          value: overall.realization === null ? '–' : `${Math.round(overall.realization * 100)}%`,
          tone,
        },
      ]}
    />
  );
}

function StatsTable({
  title,
  label,
  stats,
}: {
  title: string;
  label: string;
  stats: Record<string, ReturnType<typeof statsOverall>>;
}) {
  const rows = Object.entries(stats).sort((a, b) => b[1].runs - a[1].runs);

  return (
    <Card className="overflow-hidden">
      <CardHead title={title} />
      {rows.length === 0 ? (
        <p className="border-t border-[var(--color-line)] px-4 py-8 text-center text-[11px] text-[var(--color-ink-3)]">
          Nothing to summarise yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <Th>{label}</Th>
              <Th width={70} align="right">
                Runs
              </Th>
              <Th width={120} align="right">
                Realization
              </Th>
              <Th width={110} align="right">
                Recovered
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, s]) => (
              <tr key={key} className="border-b border-[var(--color-line-soft)] last:border-b-0">
                <Td className="num text-[12px] font-semibold text-[var(--color-ink)]">{key}</Td>
                <Td align="right">
                  <span className="num text-[11px] text-[var(--color-ink-2)]">
                    {s.completed}/{s.runs}
                  </span>
                </Td>
                <Td align="right">
                  <span className="num text-[11px] text-[var(--color-ink)]">
                    {s.realization === null ? '–' : `${Math.round(s.realization * 100)}%`}
                  </span>
                </Td>
                <Td align="right">
                  <span className="num text-[11px] text-[var(--color-ink)]">
                    {s.recoveryRate === null ? '–' : `${Math.round(s.recoveryRate * 100)}%`}
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

/** Small marker the queue uses; kept here so the tones stay in one place. */
export function OutcomeChip({ run }: { run: DispatchRun }) {
  const outcome = outcomeOf(run);
  if (!outcome) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: TONE.warn.fg }}>
        <Icon name="truck" size={10} />
        {run.truckId} · {elapsedMinutes(run)}m
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px]"
      style={{ color: TONE[OUTCOME_TONE[outcome]].fg }}
    >
      <Icon name="truck" size={10} />
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}
