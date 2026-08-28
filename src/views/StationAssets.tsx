import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Button, Segmented, StatusPill } from '../ui/primitives';
import { ProvenancePill } from '../ui/ProvenancePill';
import { TONE } from '../ui/tone';
import {
  BIKE_FAULT_LABEL,
  CONDITION_LABEL,
  DOCK_FAULT_LABEL,
  LOW_CHARGE,
  bikesAt,
  docksAt,
  statusFromRow,
  summarize,
  summarizeDocks,
  type Bike,
  type Dock,
} from '../sim/fleet';
import { useConsole } from '../state/useConsole';
import type { WorkOrderType } from '../model/workOrder';
import type { StationRow } from '../data/stationRow';
import { cn } from '../lib/cn';

/**
 * Every bike and dock at one station, as its own panel.
 *
 * These lists used to expand inline inside the score drawer. At a large station
 * that meant unfolding sixty bike rows and a hundred and fifteen dock rows into
 * a column already holding the fill chart, the readiness checks, the feed
 * figures and the whole score receipt — so opening one pushed everything else
 * a thousand pixels up the page and left you scrolling to find your way back.
 *
 * Splitting them out fixes that by changing what each surface is *for*. The
 * drawer answers "should a vehicle come here", which is a paragraph. This
 * answers "what exactly is wrong with which machine", which is a list, and a
 * list wants its own scroll container and its own way out.
 *
 * The rows are also where work gets raised, which is the reason the detail
 * exists at all: a fault you cannot hand to anybody is trivia.
 */

type Tab = 'bikes' | 'docks';

export function StationAssets({
  row,
  initial = 'bikes',
  onClose,
}: {
  row: StationRow;
  initial?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initial);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const status = useMemo(() => statusFromRow(row), [row]);
  const bikes = useMemo(() => (status ? bikesAt(status, Date.now()) : []), [status]);
  const docks = useMemo(() => (status ? docksAt(status) : []), [status]);
  const fleet = useMemo(() => summarize(bikes, row.id), [bikes, row.id]);
  const dockStats = useMemo(() => summarizeDocks(docks), [docks]);

  const deadDocks = useMemo(
    () => docks.filter((d) => d.state === 'out-of-service'),
    [docks],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[78] flex justify-end">
      <button
        type="button"
        aria-label="Close station assets"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[rgb(43_38_33/34%)]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Bikes and docks at ${row.name}`}
        className="drawer-in relative flex w-[560px] max-w-full flex-col border-l border-[var(--color-line)] bg-[var(--color-surface)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-[13px] font-semibold text-[var(--color-ink)] outline-none"
              >
                {row.name}
              </h2>
              <ProvenancePill
                provenance="simulated"
                detail="GBFS carries counts, never individual machines. Frame numbers, charge and fault reasons are modelled — the number of bikes, how many are electric and how many are broken all come from the live feed."
              />
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-2)]">
              {row.borough} · <span className="num">{fleet.total}</span> bikes on{' '}
              <span className="num">{dockStats.total}</span> docks
              {dockStats.dead > 0 && (
                <span style={{ color: TONE.empty.fg }}>
                  {' '}
                  · <span className="num">{dockStats.dead}</span> out of service
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 cursor-pointer text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-2.5">
          <Segmented
            label="Asset view"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: 'bikes', label: `Bikes (${fleet.total})` },
              { value: 'docks', label: `Dead docks (${dockStats.dead})` },
            ]}
          />
          {tab === 'bikes' && fleet.lowCharge > 0 && (
            <span className="text-[10px] whitespace-nowrap" style={{ color: TONE.warn.fg }}>
              {fleet.lowCharge} under {LOW_CHARGE}%
            </span>
          )}
        </div>

        {/* The list scrolls, not the panel. That is the whole point of moving
            it here: a hundred rows can no longer push the rest of the interface
            off the screen, because there is no rest of the interface. */}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {tab === 'bikes' ? (
            bikes.length === 0 ? (
              <Empty>Nothing on the rack — the station reports no bikes present.</Empty>
            ) : (
              <ul>
                {bikes.map((b) => (
                  <BikeRow key={b.id} bike={b} row={row} disabledCount={row.raw?.bikesDisabled ?? 0} />
                ))}
              </ul>
            )
          ) : deadDocks.length === 0 ? (
            <Empty>Every dock at this station is reporting normally.</Empty>
          ) : (
            <ul>
              {deadDocks.map((d) => (
                <DockRow
                  key={d.index}
                  dock={d}
                  row={row}
                  deadCount={row.raw?.docksDisabled ?? 0}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--color-line)] px-4 py-3">
          <Button variant="dark" className="w-full" onClick={onClose}>
            Back to the station
          </Button>
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 py-8 text-center text-[11px] text-[var(--color-ink-3)]">{children}</p>
  );
}

/**
 * A grid, not a flex row with `ml-auto`.
 *
 * The flex version sized every cell to its content and let the last one absorb
 * the slack, which worked until a fault name ran long — "Wheel out of true"
 * wrapped onto three lines and shoved the raise-order link into the text beside
 * it. Fixed tracks plus a `minmax(0,1fr)` fault column means the label truncates
 * and nothing else moves.
 */
const ROW = 'grid grid-cols-[30px_62px_58px_46px_minmax(0,1fr)_auto] items-center gap-2';

function BikeRow({
  bike,
  row,
  disabledCount,
}: {
  bike: Bike;
  row: StationRow;
  disabledCount: number;
}) {
  return (
    <li
      className={cn(
        ROW,
        'border-b border-[var(--color-line-soft)] py-2 text-[10.5px] last:border-b-0',
      )}
    >
      <span className="num text-[var(--color-ink-3)]">{bike.dock}</span>
      <span className="num font-semibold text-[var(--color-ink)]">{bike.id}</span>
      <span className="text-[var(--color-ink-2)]">
        {bike.kind === 'electric' ? 'E-bike' : 'Classic'}
      </span>
      <span>
        {bike.charge === null ? (
          <span className="text-[var(--color-ink-3)]">—</span>
        ) : (
          <span
            className="num font-semibold"
            style={{ color: bike.charge < LOW_CHARGE ? TONE.warn.fg : TONE.ok.fg }}
          >
            {bike.charge}%
          </span>
        )}
      </span>

      <span className="min-w-0 truncate">
        {bike.fault === null ? (
          <span className="text-[var(--color-ink-3)]">{CONDITION_LABEL[bike.condition]}</span>
        ) : (
          <span
            style={{
              color: bike.condition === 'out-of-service' ? TONE.empty.fg : TONE.warn.fg,
            }}
            title={BIKE_FAULT_LABEL[bike.fault]}
          >
            {BIKE_FAULT_LABEL[bike.fault]}
          </span>
        )}
      </span>

      <span className="flex items-center gap-1.5 justify-self-end whitespace-nowrap">
        {bike.condition === 'out-of-service' && <StatusPill label="Out" />}
        {bike.fault !== null && (
          <RaiseOrder
            orderKey={`bike-${bike.id}`}
            type={bike.fault === 'battery-fault' ? 'battery-swap' : 'bike-repair'}
            name={`${bike.id} — ${BIKE_FAULT_LABEL[bike.fault]}`}
            row={row}
            detail={`${BIKE_FAULT_LABEL[bike.fault]} on ${bike.kind === 'electric' ? 'e-bike' : 'bike'} ${bike.id}, dock ${bike.dock} at ${row.name}. Reported by the operator's own feed as one of ${disabledCount} disabled bike${disabledCount === 1 ? '' : 's'} at this station.`}
            bikeId={bike.id}
          />
        )}
      </span>
    </li>
  );
}

function DockRow({
  dock,
  row,
  deadCount,
}: {
  dock: Dock;
  row: StationRow;
  deadCount: number;
}) {
  if (!dock.fault) return null;

  return (
    <li
      className={cn(
        ROW,
        'border-b border-[var(--color-line-soft)] py-2 text-[10.5px] last:border-b-0',
      )}
    >
      <span className="num text-[var(--color-ink-3)]">{dock.index}</span>
      <span className="col-span-3 text-[var(--color-ink-2)]">Dock {dock.index}</span>
      <span className="min-w-0 truncate" style={{ color: TONE.empty.fg }}>
        {DOCK_FAULT_LABEL[dock.fault]}
      </span>
      <span className="justify-self-end whitespace-nowrap">
        <RaiseOrder
          orderKey={`dock-${row.id}-${dock.index}`}
          /* A dock with no power or no comms is a site failure reported per
             dock — a different crew from somebody with a spanner. */
          type={
            dock.fault === 'no-power' || dock.fault === 'no-comms'
              ? 'station-power'
              : 'dock-repair'
          }
          name={`${row.name} — dock ${dock.index}`}
          row={row}
          detail={`${DOCK_FAULT_LABEL[dock.fault]} at dock ${dock.index}, ${row.name}. One of ${deadCount} dock${deadCount === 1 ? '' : 's'} the feed reports out of service here, which is already excluded from this station's fill.`}
        />
      </span>
    </li>
  );
}

/**
 * Turn one broken thing into a job somebody owns.
 *
 * Idempotent by `orderKey`, and keyed per asset rather than per station: a dead
 * dock and a bike with a flat tyre at one address are two different jobs.
 */
export function RaiseOrder({
  orderKey,
  type,
  name,
  detail,
  row,
  bikeId,
}: {
  orderKey: string;
  type: WorkOrderType;
  name: string;
  detail: string;
  row: StationRow;
  bikeId?: string;
}) {
  const dispatchMechanic = useConsole((s) => s.dispatchMechanic);
  const dispatched = useConsole((s) => s.dispatched);

  if (dispatched.includes(orderKey)) {
    return (
      <span className="text-[10px] whitespace-nowrap" style={{ color: TONE.ok.fg }}>
        order raised
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        dispatchMechanic({
          key: orderKey,
          name,
          where: `${row.name} · ${row.borough}`,
          region: row.borough,
          stationId: row.id,
          type,
          priority: row.score,
          detail,
          ...(bikeId ? { bikeId } : {}),
        })
      }
      className="cursor-pointer text-[10px] whitespace-nowrap text-[var(--color-ink-3)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-ink)]"
    >
      raise order
    </button>
  );
}
