import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { ZONES } from '../mock/data';
import { liveZones } from '../data/insights';
import { useConsole } from '../state/useConsole';
import { POLL_INTERVAL_MS, useDispatch } from '../store/useDispatch';
import { formatAgo, formatClock, useTicker } from '../lib/time';
import { cn } from '../lib/cn';

/**
 * The chrome rail.
 *
 * Near-black warm brown, full height, fixed width. It is the only dark surface
 * in the app: everything the console *reports* lives on cream paper, and
 * everything it is — identity, navigation, session — lives here. That split is
 * what keeps a nav item from ever being mistaken for data.
 */

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  badge?: number;
  end?: boolean;
}

const DISPATCH_NAV: NavItem[] = [
  { to: '/', label: 'Priority Queue', icon: 'list-ordered', end: true },
  { to: '/map', label: 'Map View', icon: 'map' },
  { to: '/trucks', label: 'Truck Dispatch', icon: 'truck' },
  { to: '/history', label: 'Dispatch History', icon: 'clipboard-list' },
];

export function Sidebar() {
  // Badges count the real lanes, so escalating a node from Unverified moves
  // the Mechanic Alerts badge as it happens, and both track the live feed.
  const ticketCount = useConsole((s) => s.tickets.length);
  const unverified = useDispatch((s) => s.lanes.unverified.length);
  const faults = useDispatch((s) => s.lanes.mechanic.length);
  const scored = useDispatch((s) => s.scored);

  // Fixture list only until the first poll lands, so the rail is never empty.
  const zones = scored.length > 0 ? liveZones(scored) : ZONES;

  const monitoringNav: NavItem[] = [
    { to: '/unverified', label: 'Unverified', icon: 'alert-triangle', badge: unverified },
    { to: '/mechanics', label: 'Mechanic Alerts', icon: 'wrench', badge: faults + ticketCount },
    { to: '/analytics', label: 'Analytics', icon: 'line-chart' },
  ];

  return (
    <aside className="flex h-full w-[175px] shrink-0 flex-col bg-[var(--color-rail)] text-[var(--color-rail-ink-2)]">
      <Brand />
      <LiveStrip />

      <nav aria-label="Sections" className="thin-scroll flex-1 overflow-y-auto px-2.5 py-3.5">
        <Group label="Dispatch">
          {DISPATCH_NAV.map((item) => (
            <NavRow key={item.to} {...item} />
          ))}
        </Group>

        <Group label="Monitoring" className="mt-5">
          {monitoringNav.map((item) => (
            <NavRow key={item.to} {...item} />
          ))}
        </Group>

        <Group label="Zones" className="mt-5">
          {zones.map((z) => (
            <NavRow key={z.slug} to={`/zone/${z.slug}`} label={z.name} count={z.stations} />
          ))}
        </Group>
      </nav>

      <UserFooter />
    </aside>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-rail-line)] px-3 py-2.5">
      <span
        aria-hidden="true"
        className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-[var(--color-rail-hi)] text-white"
      >
        <Icon name="bike" size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] leading-tight font-semibold text-white">Dispatch</span>
        <span className="block text-[9px] leading-tight text-[var(--color-rail-ink-3)]">
          NYC Bike Ops
        </span>
      </span>
    </div>
  );
}

/**
 * The heartbeat.
 *
 * One place in the app states how fresh everything is, and it is here rather
 * than on a card — the age of the feed qualifies every number on every screen,
 * so attaching it to one statistic implied it was about that statistic.
 *
 * Its own component so the one-second tick repaints twelve pixels of chrome
 * instead of a table of two thousand rows.
 */
function LiveStrip() {
  const fetchedAtMs = useDispatch((s) => s.fetchedAtMs);
  const error = useDispatch((s) => s.error);
  const now = useTicker(1000);

  const stale = fetchedAtMs !== null && now - fetchedAtMs > POLL_INTERVAL_MS * 2;
  const dot = error || stale ? '#c0453a' : '#4ea373';

  return (
    <div
      className="flex items-center justify-between border-b border-[var(--color-rail-line)] px-3 py-2"
      title={
        error
          ? `Feed unreachable: ${error.message}. Showing the last good data and retrying.`
          : 'The board polls every 60 seconds while this tab is visible.'
      }
    >
      <span className="flex items-center gap-1.5 text-[9px] text-[var(--color-rail-ink-2)]">
        <span
          aria-hidden="true"
          className={cn('h-[5px] w-[5px] rounded-full', !error && !stale && 'pulse-dot')}
          style={{ backgroundColor: dot }}
        />
        {error ? 'Retrying' : fetchedAtMs === null ? 'Connecting…' : `Updated ${formatAgo(now - fetchedAtMs)} ago`}
      </span>
      <span className="num text-[9px] text-[var(--color-rail-ink-3)]">
        {fetchedAtMs === null ? '--:--' : formatClock(fetchedAtMs).slice(0, 5)}
      </span>
    </div>
  );
}

function Group({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="px-2 pb-1 text-[8px] font-semibold tracking-[0.12em] text-[var(--color-rail-ink-3)] uppercase">
        {label}
      </p>
      <ul className="flex flex-col gap-px">{children}</ul>
    </div>
  );
}

function NavRow({
  to,
  label,
  icon,
  badge,
  count,
  end,
}: {
  to: string;
  label: string;
  icon?: IconName;
  badge?: number;
  count?: number;
  end?: boolean;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'relative flex items-center gap-2 rounded-md py-[6px] pr-2 text-[11.5px] transition-colors',
            icon ? 'pl-2' : 'pl-2.5',
            isActive
              ? 'bg-[var(--color-rail-hi)] font-medium text-white'
              : 'text-[var(--color-rail-ink-2)] hover:bg-[#332c25] hover:text-white',
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-0 h-[16px] w-[2px] -translate-y-1/2 rounded-r bg-white"
              />
            )}
            {icon && <Icon name={icon} size={13} />}
            <span className="flex-1 truncate">{label}</span>
            {badge !== undefined && (
              <span className="num rounded bg-[#453d33] px-1.5 py-px text-[9px] font-semibold text-[#d8cfc0]">
                {badge}
              </span>
            )}
            {count !== undefined && (
              <span className="num text-[9px] text-[var(--color-rail-ink-3)]">{count}</span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

function UserFooter() {
  return (
    <div className="flex items-center gap-2 border-t border-[var(--color-rail-line)] px-3 py-2.5">
      <span
        aria-hidden="true"
        className="h-[22px] w-[22px] shrink-0 rounded-full bg-gradient-to-br from-[#8a7c68] to-[#5c5145]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-tight font-medium text-white">Ops Center</span>
        <span className="block text-[9px] leading-tight text-[var(--color-rail-ink-3)]">Admin</span>
      </span>
      <button
        type="button"
        aria-label="Account menu"
        className="text-[var(--color-rail-ink-3)] hover:text-white"
      >
        <Icon name="more-vertical" size={13} />
      </button>
    </div>
  );
}
