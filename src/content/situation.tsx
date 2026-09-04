import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Finding } from '../ui/primitives';
import { TONE, type Tone } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import type { Situation } from '../model/situation';
import { elapsed, since, trend } from './clauses';

/**
 * The situation headline, in words.
 *
 * Every branch says the same four things in the same order — what is worst, how
 * much of it, how long, and what to do — and the alarming ones lead red while
 * the routine one stays amber. The decision of *which* situation this is lives
 * in `src/model/situation.ts`; this file only phrases it.
 */

type Stat = { label: string; value: ReactNode; tone?: Tone };

const SIGNAL_WORD: Record<string, string> = {
  empty: 'empty',
  full: 'full',
  outage: 'out of service',
  ok: 'drifting',
};

const num = (n: number) => n.toLocaleString('en-US');

/** A link or button styled to sit inside a Finding's detail line, in its tone. */
function Action({
  to,
  onClick,
  color,
  children,
}: {
  to?: string;
  onClick?: () => void;
  color: string;
  children: ReactNode;
}) {
  const cls = 'font-medium whitespace-nowrap underline underline-offset-2';
  return to ? (
    <Link to={to} className={cls} style={{ color }}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer`} style={{ color }}>
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
      const stats: Stat[] = [
        { label: 'silent', value: s.dark, tone: 'empty' },
        { label: 'of docks', value: `${(s.dockShare * 100).toFixed(1)}%` },
      ];
      if (s.neverReported > 0) stats.push({ label: 'never reported', value: s.neverReported });
      return (
        <Finding
          icon="radio-tower"
          tone="empty"
          headline={`The board can't see ${Math.round(s.dockShare * 100)}% of the network right now.`}
          detail={
            <>
              {s.dark} stations have gone quiet
              {s.worstBorough && s.worstBorough.stations >= 3 && (
                <>
                  {' '}
                  — {s.worstBorough.borough} worst, with {s.worstBorough.stations}
                </>
              )}
              {s.neverReported > 0 && <>; {s.neverReported} have never reported at all</>}. Their
              counts are dropped from the ranking, so nothing below reflects them.{' '}
              <Action to="/monitoring/unverified" color={TONE.empty.fg}>
                Open Not Reporting →
              </Action>
            </>
          }
          stats={stats}
        />
      );
    }

    case 'critical-stuck':
      return (
        <Finding
          icon="alert-triangle"
          tone="empty"
          headline={`${s.name} has scored critical for ${elapsed(s.minutes)} — no vehicle sent.`}
          detail={
            <>
              {SIGNAL_WORD[s.signal] ?? 'failing'} {since(s.failingSince)}
              {trend(s.delta)}. Something is momentarily worse on every poll, so it never reaches the
              top of the list — but an hour {SIGNAL_WORD[s.signal] ?? 'down'} is an hour of riders
              turned away.{' '}
              <Action onClick={() => openStation(s.stationId)} color={TONE.empty.fg}>
                Open its receipt →
              </Action>
            </>
          }
          stats={[
            { label: 'score', value: s.score, tone: 'empty' },
            { label: 'failing', value: elapsed(s.minutes) },
            {
              label: 'trend',
              value: s.delta > 5 ? `+${s.delta}` : s.delta < -5 ? `${s.delta}` : 'flat',
              tone: s.delta > 5 ? 'empty' : 'mute',
            },
          ]}
        />
      );

    case 'hardware-crippled':
      return (
        <Finding
          icon="wrench"
          tone="empty"
          headline={`Hardware is failing at scale — ${num(s.deadDocks)} dead docks, ${(s.dockShare * 100).toFixed(1)}% of the network.`}
          detail={
            <>
              {s.sites} station{s.sites === 1 ? ' has' : 's have'} most of the rack out of service
              {s.brokenBikes > 0 && <>, and {num(s.brokenBikes)} bikes are disabled on top</>}. None
              of it is a vehicle job — moving bikes cannot re-seat a dock.{' '}
              <Action to="/maintenance/hardware" color={TONE.empty.fg}>
                Open Hardware →
              </Action>
            </>
          }
          stats={[
            { label: 'dead docks', value: num(s.deadDocks), tone: 'empty' },
            { label: 'of network', value: `${(s.dockShare * 100).toFixed(1)}%` },
            { label: 'sites down', value: s.sites, tone: 'empty' },
          ]}
        />
      );

    case 'faults-unraised':
      return (
        <Finding
          icon="wrench"
          tone="warn"
          headline={
            s.count === 1
              ? '1 out-of-service station has no repair scheduled.'
              : `${s.count} out-of-service stations have no repair scheduled.`
          }
          detail={
            <>
              Worst is {s.worstName} ({s.worstBorough}) — {s.worstFault}, confirmed on the latest
              feed. A dead station is a hole the size of its dock count, and no vehicle closes it.{' '}
              <Action to="/maintenance/orders" color={TONE.warn.fg}>
                Send a mechanic →
              </Action>
            </>
          }
          stats={[
            { label: 'no repair', value: s.count, tone: 'warn' },
            { label: 'out of service', value: s.total },
          ]}
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
