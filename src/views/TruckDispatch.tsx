import { useState } from 'react';
import { PageBody, PageHeader } from '../shell/AppShell';
import { Icon } from '../ui/Icon';
import { Bar, Button, Card, CardHead, TonePill } from '../ui/primitives';
import { TONE } from '../ui/tone';
import {
  TRUCKS,
  TRUCK_FOCUS,
  TRUCK_STATE_LABEL,
  TRUCK_STATE_TONE,
  TRUCKS_ACTIVE,
  type Truck,
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
  const enRoute = TRUCKS.filter((t) => t.state !== 'idle').length;
  const idle = TRUCKS.filter((t) => t.state === 'idle').length;

  return (
    <>
      <PageHeader
        title="Fleet Operations"
        subtitle={`${TRUCKS.length} total trucks · ${TRUCKS_ACTIVE} active en route · ${idle} idle at depots`}
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h2 className="eyebrow text-[9px]">Operational fleet ({TRUCKS.length} total)</h2>
              <div className="flex items-center gap-1.5">
                <TonePill label={`${enRoute} En Route`} tone="ok" />
                <TonePill label={`${idle} Idle`} tone="mute" />
              </div>
            </div>

            <ul className="flex flex-col gap-2">
              {TRUCKS.map((truck) =>
                truck.id === focused ? (
                  <li key={truck.id}>
                    <ExpandedTruck truck={truck} />
                  </li>
                ) : (
                  <li key={truck.id}>
                    <CollapsedTruck truck={truck} onOpen={() => setFocused(truck.id)} />
                  </li>
                ),
              )}
            </ul>
          </div>

          <aside aria-label="Active truck focus">
            <FocusCard />
          </aside>
        </div>
      </PageBody>
    </>
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
  const tone = TRUCK_STATE_TONE[truck.state];

  return (
    <Card className="border-[var(--color-ink)]">
      <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-3">
        <TruckGlyph />
        <div className="min-w-0 flex-1">
          <p className="num text-[13px] font-semibold text-[var(--color-ink)]">Truck {truck.id}</p>
          <p className="mt-px text-[11px]" style={{ color: TONE[tone].fg }}>
            {TRUCK_STATE_LABEL[truck.state]}
            {truck.eta && ` · ${truck.eta}`}
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
        <p className="text-[11px] text-[var(--color-ink-2)]">
          <span className="font-semibold text-[var(--color-ink)]">Active:</span> {truck.active}
        </p>
        <Button size="sm">Options</Button>
      </div>
    </Card>
  );
}

function CollapsedTruck({ truck, onOpen }: { truck: Truck; onOpen: () => void }) {
  const tone = TRUCK_STATE_TONE[truck.state];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:border-[var(--color-ink-3)]"
    >
      <TruckGlyph size={28} />
      <span className="num text-[12px] font-semibold text-[var(--color-ink)]">
        Truck {truck.id}
      </span>
      <span
        className="text-[9px] font-semibold tracking-[0.08em] uppercase"
        style={{ color: TONE[tone].fg }}
      >
        {TRUCK_STATE_LABEL[truck.state]}
      </span>

      <span className="ml-auto flex items-center gap-3">
        <span className="w-[80px] shrink-0">
          <Bar
            value={truck.capacity > 0 ? truck.load / truck.capacity : 0}
            tone={truck.state === 'idle' ? 'mute' : 'ok'}
            height={4}
          />
        </span>
        <Icon name="chevron-right" size={14} className="text-[var(--color-ink-3)]" />
      </span>
    </button>
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
