import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { BarRow } from '../ui/charts';
import { Card, CardHead, Finding, FixtureNote } from '../ui/primitives';
import { TONE } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { isOpen } from '../model/workOrder';
import { CELLULAR, OUTAGE_FREQUENCY, REPORTING_HEALTH } from '../mock/data';

/**
 * Everything about a station that is not its bike count.
 *
 * GBFS carries a `last_reported` timestamp and nothing else about the hardware —
 * no battery, no carrier, no modem state. So this screen is mostly fixtures, and
 * says so. The one honest panel is Site power, which counts the power orders
 * actually raised and the stations actually silent rather than inventing a
 * charge level.
 *
 * Split out of Not Reporting, where these three panels sat under the
 * silent-station table. That table is live and acted on; this is context you
 * glance at. Different jobs, different screens.
 */
export function SiteHealth() {
  const silent = useDispatch((s) => s.lanes.unverified.length);
  const workOrders = useConsole((s) => s.workOrders);
  const powerOrders = useMemo(
    () => workOrders.filter((o) => o.type === 'station-power' && isOpen(o)).length,
    [workOrders],
  );

  const trouble = powerOrders > 0 || silent > 0;

  return (
    <>
      <PageHeader
        title="Site Health"
        subtitle="Reporting uptime, site power and the cellular link behind the network. The feed publishes none of this directly — most of what is below is a fixture, and the page marks which."
      />

      <PageBody>
        <Finding
          icon="battery-low"
          tone={powerOrders > 0 ? 'empty' : silent > 0 ? 'warn' : 'ok'}
          headline={
            powerOrders > 0
              ? `${powerOrders} open power order${powerOrders === 1 ? '' : 's'} — a site has lost mains and is running on battery.`
              : silent > 0
                ? `${silent} station${silent === 1 ? ' is' : 's are'} silent — a flat site battery is the usual cause.`
                : 'Every site is powered and reporting.'
          }
          detail={
            trouble ? (
              <>
                The feed carries no battery reading, so charge is inferred from the consequence: a
                site that loses power stops talking.{' '}
                {silent > 0 && (
                  <Link
                    to="/monitoring/unverified"
                    className="font-medium underline underline-offset-2"
                    style={{ color: TONE.empty.fg }}
                  >
                    See the silent list →
                  </Link>
                )}
              </>
            ) : (
              'No open power orders and no station past the reporting cutoff.'
            )
          }
        />

        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-3">
          <ReportingHealth />
          <SitePower silent={silent} />
          <CellularCard />
        </div>

        <FixtureNote>
          Reporting health and the carrier panel are fixtures — the public feed publishes a
          last-reported timestamp and nothing else about the hardware, so uptime, carrier and modem
          state would each need a telemetry source of their own. Site power is the exception: the
          charge itself is unobservable, so that panel counts the power orders actually raised and
          the stations actually silent instead of inventing a battery level.
        </FixtureNote>

        <p className="mt-4 text-[11px] text-[var(--color-ink-2)]">
          <Link
            to="/monitoring/unverified"
            className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
            style={{ color: TONE.flood.fg }}
          >
            <Icon name="radio-tower" size={13} />
            {silent} station{silent === 1 ? ' is' : 's are'} silent right now — see the list
          </Link>
        </p>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ReportingHealth() {
  return (
    <Card>
      <CardHead
        title="Reporting health (24h)"
        right={
          <span
            className="text-[10px] font-semibold tracking-[0.08em] uppercase"
            style={{ color: TONE.ok.fg }}
          >
            {REPORTING_HEALTH.verdict}
          </span>
        }
      />
      <div className="px-3.5 pb-3.5">
        <BarRow bars={REPORTING_HEALTH.bars} height={54} />
        <div className="num mt-1.5 flex justify-between text-[10px] text-[var(--color-ink-3)]">
          {REPORTING_HEALTH.axis.map((a) => (
            <span key={a}>{a}</span>
          ))}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--color-line-soft)] pt-2.5">
          <p className="num text-[22px] leading-none font-semibold text-[var(--color-ink)]">
            {REPORTING_HEALTH.uptime}
            <span className="text-[13px]">%</span>
          </p>
          <p className="eyebrow text-[10px]">Avg uptime</p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Site power — what can honestly be said about it.
 *
 * GBFS publishes no battery telemetry at any level, so a "stations under 15%"
 * number could never move and would silently contradict the two *other* battery
 * concepts the app carries — e-bike state of charge on the rack, and
 * `station-power` work orders.
 *
 * What is genuinely knowable is the consequence rather than the cause. A site
 * whose battery flattens stops talking to the feed, and a station that stops
 * talking is exactly what Not Reporting lists. So the card counts the power
 * orders actually raised, names the stations currently silent, and says plainly
 * that the charge itself is not observable.
 */
function SitePower({ silent }: { silent: number }) {
  const workOrders = useConsole((s) => s.workOrders);
  const powerOrders = workOrders.filter((o) => o.type === 'station-power' && isOpen(o));

  return (
    <Card>
      <CardHead title="Site power" />
      <div className="px-3.5 pb-3.5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: powerOrders.length > 0 ? TONE.empty.bg : TONE.ok.bg,
              color: powerOrders.length > 0 ? TONE.empty.fg : TONE.ok.fg,
            }}
          >
            <Icon name="battery-low" size={19} />
          </span>
          <div>
            <p className="num text-[22px] leading-none font-semibold text-[var(--color-ink)]">
              {powerOrders.length}
            </p>
            <p className="eyebrow mt-1 text-[10px]">Open power orders</p>
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-[var(--color-ink-2)]">
          The feed carries no battery reading for any station, so site charge cannot be shown. What
          it does show is the consequence: a site that loses power stops reporting, and{' '}
          <span className="num font-semibold text-[var(--color-ink)]">{silent}</span> station
          {silent === 1 ? ' is' : 's are'} silent right now — the Not Reporting list.
        </p>
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
            <dd className="flex items-center gap-1.5 font-medium" style={{ color: TONE[c.tone].fg }}>
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
          <dt className="text-[var(--color-ink-2)]">Outage frequency</dt>
          <dd className="num font-medium text-[var(--color-ink)]">{OUTAGE_FREQUENCY}</dd>
        </div>
      </dl>
    </Card>
  );
}
