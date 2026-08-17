import { Navigate, useParams } from 'react-router-dom';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Bar, Button, Card, StatCard, Td, Th } from '../ui/primitives';
import { ScorePeek } from '../ui/ScorePeek';
import { TipAction, TipBody, TipTitle, Tooltip } from '../ui/Tooltip';
import { COLUMN_HELP } from '../content/columns';
import { TONE } from '../ui/tone';
import { useConsole } from '../state/useConsole';
import { useDispatch } from '../store/useDispatch';
import { zoneStats } from '../data/insights';
import { toStationRow } from '../data/adapt';
import { ZONES, zoneDetail } from '../mock/data';

/**
 * One borough.
 *
 * The same information the queue carries, scoped and re-ordered: the zone's own
 * four numbers, a picture of where its trouble is clustered, and the three
 * stations at the top of its list.
 */
export function ZoneView() {
  const { slug = '' } = useParams();
  const openStation = useConsole((s) => s.openStation);
  const scored = useDispatch((s) => s.scored);
  const phase = useDispatch((s) => s.phase);

  const live = zoneStats(scored, slug);
  const fixture = ZONES.find((z) => z.slug === slug);

  // Before the first poll there is nothing to resolve the slug against, so the
  // fixture list stands in rather than bouncing the user back to the queue.
  if (!live && !fixture) {
    if (phase === 'loading') {
      return (
        <PageBody className="text-[12px] text-[var(--color-ink-3)]">Reading the live feed…</PageBody>
      );
    }
    return <Navigate to="/" replace />;
  }

  const zone = live ?? { slug, name: fixture!.name, stations: fixture!.stations };
  const d = zoneDetail(fixture?.slug ?? 'manhattan');
  // Arrow, not a bare reference: `map` passes the index as the second argument
  // and `toStationRow` now takes a duration there.
  const ranked = live ? live.ranked.slice(0, 8).map((s) => toStationRow(s)) : d.ranked;
  const needsDispatch = live ? live.needsTruck : d.needsDispatch;
  const avgFill = live?.avgFill ?? d.avgFill;

  return (
    <>
      <PageHeader
        title={`${zone.name} Operations`}
        subtitle={`${zone.stations.toLocaleString('en-US')} stations, ${needsDispatch} of them needing a truck right now${live ? `. ${live.unverified} not reporting, ${live.mechanic} mechanically out of service.` : '.'}`}
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] text-[var(--color-ink-2)]">
              AVG FILL:
              <span className="num font-semibold" style={{ color: TONE.ok.fg }}>
                {avgFill === null ? '–' : `${Math.round(avgFill * 100)}%`}
              </span>
            </span>
            <Button variant="dark" notBuilt="Would dedicate a truck to this zone for the shift.">
              Assign Zone Truck
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatCard
            label="Needs dispatch"
            value={needsDispatch.toLocaleString('en-US')}
            tone="empty"
            foot={`${zone.stations > 0 ? Math.round((needsDispatch / zone.stations) * 100) : 0}% of the zone`}
          />
          <StatCard
            label="Not reporting"
            value={live ? live.unverified : '—'}
            tone={live && live.unverified > 0 ? 'warn' : 'ink'}
            foot="excluded from scoring"
          />
          <StatCard
            label="Out of service"
            value={live ? live.mechanic : '—'}
            tone={live && live.mechanic > 0 ? 'empty' : 'ink'}
            foot="needs a mechanic"
          />
          <StatCard
            label="Zone avg fill"
            value={avgFill === null ? '—' : Math.round(avgFill * 100)}
            unit={avgFill === null ? undefined : '%'}
            tone="ok"
            foot="bikes per usable slot"
          />
        </div>

        <ClusterPanel
          title={`${zone.name} priority clusters`}
          detail={`${needsDispatch} station${needsDispatch === 1 ? '' : 's'} above the threshold across ${zone.name}`}
        />

        <Card className="mt-3.5 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-3">
            <h2 className="eyebrow text-[9px]">Ranked priority: {zone.name} zone</h2>
            <span className="num inline-flex items-center gap-1.5 text-[9px] tracking-[0.08em] text-[var(--color-ink-3)] uppercase">
              <span
                aria-hidden="true"
                className="h-[5px] w-[5px] rounded-full"
                style={{ backgroundColor: TONE.ok.fg }}
              />
              Sync: {d.sync}
            </span>
          </div>

          {ranked.length === 0 ? (
            <p className="border-t border-[var(--color-line)] px-4 py-10 text-center text-[12px] text-[var(--color-ink-3)]">
              No stations in {zone.name} are above the dispatch threshold right now.
            </p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <Th width={70} sortable>
                    Rank
                  </Th>
                  <Th>Station Name &amp; Capacity</Th>
                  <Th width={100} align="right" help={COLUMN_HELP.urgency}>
                    Urgency
                  </Th>
                  <Th width={220} help={COLUMN_HELP.fillStatus}>
                    Fill Status
                  </Th>
                  <Th width={80} align="right">
                    Action
                  </Th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, i) => (
                  <tr
                    key={s.id}
                    onClick={() => openStation(s.id)}
                    className="cursor-pointer border-b border-[var(--color-line-soft)] transition-colors last:border-b-0 hover:bg-[var(--color-sunken)]"
                  >
                    <Td>
                      <span className="num text-[11px] text-[var(--color-ink-3)]">#{i + 1}</span>
                    </Td>
                    <Td>
                      <span className="block text-[12px] font-semibold text-[var(--color-ink)]">
                        {s.name}
                      </span>
                      <span className="mt-px block text-[10px] text-[var(--color-ink-3)]">
                        <span className="num">{s.docks}</span> total docks · Station{' '}
                        {s.stationNumber}
                      </span>
                    </Td>
                    <Td align="right">
                      <ScorePeek
                        breakdown={s.breakdown}
                        size="sm"
                        onOpen={() => openStation(s.id)}
                      />
                    </Td>
                    <Td>
                      <span className="block w-[110px]">
                        <span className="num mb-1 block text-[11px] text-[var(--color-ink)]">
                          {s.bikes === null ? '—' : s.bikes}
                          <span className="mx-1 text-[var(--color-ink-3)]">/</span>
                          <span className="text-[var(--color-ink-2)]">{s.docks}</span>
                        </span>
                        <Bar value={s.fill} tone={s.fillTone} height={4} />
                      </span>
                    </Td>
                    <Td align="right">
                      <Tooltip
                        content={
                          <>
                            <TipTitle>{s.name}</TipTitle>
                            <TipBody>
                              The full receipt — every step of how this station&rsquo;s urgency
                              was calculated, and what a truck should do when it arrives.
                            </TipBody>
                            <TipAction>Opens the score breakdown</TipAction>
                          </>
                        }
                      >
                        <button
                          type="button"
                          onClick={() => openStation(s.id)}
                          aria-label={`Open the score breakdown for ${s.name}`}
                          className="inline-flex cursor-pointer text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
                        >
                          <Icon name="info" size={14} />
                        </button>
                      </Tooltip>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="border-t border-[var(--color-line)] px-4 py-3 text-center">
            <button
              type="button"
              className="eyebrow text-[9px] hover:text-[var(--color-ink)]"
            >
              View all {zone.stations} {zone.name} stations
            </button>
          </div>
        </Card>
      </PageBody>
    </>
  );
}

/**
 * The cluster panel.
 *
 * The Figma comp puts an aerial photograph here. There is no such asset in the
 * repo and nothing may be fetched at runtime, so this draws the same object as
 * a tinted abstract plan — park mass, water, street grid, hotspots — sized and
 * captioned identically. Drop a real image in `/public` and swap the <svg> for
 * an <img> when one exists.
 */
function ClusterPanel({ title, detail }: { title: string; detail: string }) {
  const hotspots = [
    { x: 38, y: 42, tone: 'empty' as const },
    { x: 44, y: 30, tone: 'empty' as const },
    { x: 49, y: 36, tone: 'empty' as const },
    { x: 55, y: 26, tone: 'warn' as const },
    { x: 60, y: 48, tone: 'warn' as const },
    { x: 30, y: 55, tone: 'ok' as const },
    { x: 35, y: 66, tone: 'ok' as const },
    { x: 46, y: 62, tone: 'ok' as const },
  ];

  return (
    <div
      className="relative mt-3.5 h-[200px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[#dfe7e2]"
      role="img"
      aria-label={detail}
    >
      {/* Park mass and water, then the grid on top. */}
      <div aria-hidden="true" className="absolute inset-0">
        <div
          className="absolute top-[-20%] left-[26%] h-[140%] w-[26%] bg-[#cfdccc]"
          style={{ transform: 'rotate(9deg)' }}
        />
        <div className="absolute inset-x-0 bottom-0 h-[26%] bg-[#d5e0e2]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(174deg, transparent 0 22px, rgb(255 255 255 / 34%) 22px 25px)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(80deg, transparent 0 54px, rgb(255 255 255 / 34%) 54px 59px)',
          }}
        />
        {/* A wash so the caption below stays readable over the plan. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#eef1ec]/85 via-transparent to-transparent" />
      </div>

      {hotspots.map((h, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute h-[7px] w-[7px] rounded-full border border-white/80"
          style={{ left: `${h.x}%`, top: `${h.y}%`, backgroundColor: TONE[h.tone].fg }}
        />
      ))}

      <div className="absolute top-3 right-3">
        <Button
          size="sm"
          icon="maximize"
          notBuilt="Use Map View and filter — a zone-scoped map is not built."
        >
          Full Zone Map
        </Button>
      </div>

      <div className="absolute bottom-3 left-4">
        <p className="text-[12px] font-semibold text-[var(--color-ink)]">{title}</p>
        <p className="mt-0.5 text-[10px] text-[var(--color-ink-2)]">{detail}</p>
      </div>
    </div>
  );
}
