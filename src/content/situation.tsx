import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Finding } from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import type { Situation } from '../model/situation';
import { elapsed, since } from './clauses';

/**
 * The situation headline, in words.
 *
 * Every branch says the same four things in the same order — what is worst, how
 * much of it, how long, and what to do — and the alarming ones lead red while
 * the routine one stays amber. The decision of *which* situation this is lives
 * in `src/model/situation.ts`; this file only phrases it.
 *
 * ## Two heights, one ranking
 *
 * `compact` marks the branches whose answer is on another screen: a blind spot
 * goes to Not Reporting, hardware and unraised faults go to Maintenance. Those
 * render as one line. The branches about *this* board — a critical station
 * nobody has driven to, the worst station right now, an all-clear — keep the
 * full treatment.
 *
 * The ranking is untouched. A network-wide hardware failure really is the worst
 * thing on the network and should still win; what it should not do is open a
 * rebalancing dispatcher's board with 153px telling them to go somewhere else.
 * Severity decides the order, actionability decides the size.
 */

type Stat = { label: string; value: ReactNode; tone?: Tone };

const SIGNAL_WORD: Record<string, string> = {
  empty: 'empty',
  full: 'full',
  outage: 'out of service',
  ok: 'drifting',
};

const num = (n: number) => n.toLocaleString('en-US');

/**
 * A real button for the Finding's footer — the situation headline is the one
 * place the banner is an alert rather than a caption, so its call to action
 * gets a button rather than an underlined word buried mid-sentence.
 */
function ActionButton({
  to,
  onClick,
  tone,
  primary = false,
  children,
}: {
  to?: string;
  onClick?: () => void;
  tone: Tone;
  primary?: boolean;
  children: ReactNode;
}) {
  const t = TONE[tone];
  const cls =
    'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors';
  const style = primary
    ? { color: t.onFg, backgroundColor: t.fg, borderColor: t.fg }
    : { color: t.fg, backgroundColor: 'transparent', borderColor: t.line };
  return to ? (
    <Link to={to} className={cls} style={style}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer`} style={style}>
      {children}
    </button>
  );
}

export function SituationFinding({ situation: s }: { situation: Situation }) {
  const openStation = useConsole((st) => st.openStation);

  switch (s.kind) {
    case 'loading':
      return <Finding icon="list-ordered" tone="mute" headline="Reading the live feed…" />;

    case 'blind': {
      // Silent count and dock share are the headline and the hero; repeating
      // them in the footer is the same fact three times on one card.
      const stats: Stat[] = [];
      if (s.neverReported > 0) stats.push({ label: 'never reported', value: s.neverReported });
      return (
        <Finding
          icon="radio-tower"
          tone="empty"
          compact
          eyebrow="Blind spot"
          hero={`${Math.round(s.dockShare * 100)}%`}
          heroNote="of the network the board cannot see"
          headline={
            <>
              {s.dark} stations have gone quiet
              {s.worstBorough && s.worstBorough.stations >= 3 && (
                <>
                  {' '}
                  — {s.worstBorough.borough} worst, with {s.worstBorough.stations}
                </>
              )}
              .
            </>
          }
          detail={
            <>
              {s.neverReported > 0 && <>{s.neverReported} have never reported at all. </>}Their
              counts are dropped from the ranking, so nothing below reflects them.
            </>
          }
          stats={stats}
          actions={
            <ActionButton to="/monitoring/unverified" tone="empty" primary>
              Open Not Reporting →
            </ActionButton>
          }
        />
      );
    }

    case 'critical-stuck':
      return (
        <Finding
          icon="alert-triangle"
          tone="empty"
          eyebrow="Unserved"
          /* The duration is the alarming figure, so it is the big one — not the
             score, which the KPI row is already shouting. The headline no
             longer repeats it. */
          hero={elapsed(s.minutes)}
          heroNote="critical, no vehicle sent"
          headline={`${s.name} — ${SIGNAL_WORD[s.signal] ?? 'failing'} ${since(s.failingSince)}`}
          detail={
            <>
              Something is momentarily worse on every poll, so it never reaches the top of the list
              — but an hour {SIGNAL_WORD[s.signal] ?? 'down'} is an hour of riders turned away.
            </>
          }
          stats={[
            { label: 'score', value: s.score, tone: 'empty' },
            {
              label: 'trend',
              value: s.delta > 5 ? `+${s.delta}` : s.delta < -5 ? `${s.delta}` : 'flat',
              tone: s.delta > 5 ? 'empty' : 'mute',
            },
          ]}
          actions={
            <ActionButton onClick={() => openStation(s.stationId)} tone="empty" primary>
              Open station →
            </ActionButton>
          }
        />
      );

    case 'hardware-crippled':
      return (
        <Finding
          icon="wrench"
          tone="empty"
          compact
          eyebrow="Hardware"
          hero={num(s.deadDocks)}
          heroNote={`dead docks · ${(s.dockShare * 100).toFixed(1)}% of the network`}
          headline={`${s.sites} station${s.sites === 1 ? ' has' : 's have'} most of the rack out of service.`}
          detail={
            <>
              {s.brokenBikes > 0 && <>{num(s.brokenBikes)} bikes are disabled on top. </>}None of it
              is a vehicle job — moving bikes cannot re-seat a dock.
            </>
          }
          stats={
            s.brokenBikes > 0
              ? [{ label: 'bikes disabled', value: num(s.brokenBikes), tone: 'warn' as const }]
              : []
          }
          actions={
            <ActionButton to="/maintenance/hardware" tone="empty" primary>
              Open Hardware →
            </ActionButton>
          }
        />
      );

    case 'faults-unraised':
      return (
        <Finding
          icon="wrench"
          tone="warn"
          compact
          eyebrow="No repair"
          hero={num(s.count)}
          heroNote={`out-of-service station${s.count === 1 ? '' : 's'} with no repair scheduled`}
          headline={`Worst is ${s.worstName} (${s.worstBorough}) — ${s.worstFault}.`}
          detail={
            <>
              Confirmed on the latest feed. A dead station is a hole the size of its dock count, and
              no vehicle closes it.
            </>
          }
          stats={[{ label: 'out of service in total', value: s.total }]}
          actions={
            <ActionButton to="/maintenance/orders" tone="warn" primary>
              Send a mechanic →
            </ActionButton>
          }
        />
      );

    case 'worst': {
      const side =
        s.dominant && s.dominant.share >= 0.6
          ? `, mostly ${s.dominant.signal === 'full' ? 'full' : 'empty'}-side`
          : '';
      const stats: Stat[] = [{ label: 'need a vehicle', value: num(s.needsVehicle), tone: 'warn' }];
      if (s.dominant) {
        stats.push({
          label: `${s.dominant.signal === 'full' ? 'full' : 'empty'}-side`,
          value: num(s.dominant.count),
        });
      }
      if (s.mechanic > 0) stats.push({ label: 'out of service', value: s.mechanic });
      return (
        <Finding
          icon="list-ordered"
          tone="warn"
          eyebrow="Worst now"
          headline={`Worst right now: ${s.name}, score ${s.score}.`}
          detail={
            <>
              {num(s.needsVehicle)} stations need a vehicle{side}. This is the day job — the ranked board
              is below.
              {(s.mechanic > 0 || s.crippled > 0) && (
                <>
                  {' '}
                  Separately, {s.mechanic} {s.mechanic === 1 ? 'is' : 'are'} out of service
                  {s.unraised > 0 && <> ({s.unraised} with no work order)</>}
                  {s.crippled > 0 && <>, {s.crippled} with most of the rack down</>}.
                </>
              )}
            </>
          }
          stats={stats}
        />
      );
    }

    case 'clear': {
      const stats: Stat[] = [];
      if (s.networkFill !== null) {
        stats.push({ label: 'network fill', value: `${Math.round(s.networkFill * 100)}%`, tone: 'ok' });
      }
      if (s.mechanic > 0) stats.push({ label: 'out of service', value: s.mechanic });
      return (
        <Finding
          icon="list-ordered"
          tone="ok"
          eyebrow="All clear"
          headline="Nothing needs a vehicle right now."
          detail={
            <>
              {s.networkFill === null
                ? 'The network is holding steady.'
                : `The network is ${Math.round(s.networkFill * 100)}% full${
                    s.networkFill >= 0.4 && s.networkFill <= 0.6 ? ' — balanced' : ''
                  }.`}
              {s.mechanic > 0 && (
                <>
                  {' '}
                  {s.mechanic} station{s.mechanic === 1 ? ' is' : 's are'} out of service and belong
                  {s.mechanic === 1 ? 's' : ''} to Maintenance
                  {s.unraised > 0 && <> — {s.unraised} without a work order</>}.
                </>
              )}
            </>
          }
          stats={stats}
        />
      );
    }
  }
}
