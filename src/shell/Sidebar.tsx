import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
 * Near-black warm brown, full height, fixed width, always open. It is the only
 * dark surface in the app: everything the console *reports* lives on cream
 * paper, and everything it is — identity, navigation, session — lives here.
 * That split is what keeps a nav item from ever being mistaken for data.
 *
 * It sits in the flex flow beside the work area rather than floating over it.
 * The rail is permanent furniture, so the board is laid out in the width that
 * is left and no part of a screen is ever underneath the navigation. A rail
 * that collapses to a strip and peeks open on hover was tried and reverted: it
 * bought back 144px that a dense table did not need, at the cost of covering
 * the leftmost column of whatever the operator was reading and of hiding the
 * route tree behind a gesture.
 *
 * Sections are a plain accordion: clicking a header toggles its sub-tabs, and
 * more than one can be open at a time. The section that owns the current route
 * opens itself on arrival, but the operator can close it and it stays closed.
 */

interface NavItem {
  to: string;
  label: string;
  icon?: IconName;
  badge?: number;
  count?: number;
  end?: boolean;
}

interface NavSection {
  key: string;
  label: string;
  icon: IconName;
  children: NavItem[];
}

const DISPATCH: NavSection = {
  key: 'dispatch',
  label: 'Dispatch',
  icon: 'list-ordered',
  children: [
    { to: '/', label: 'Rebalancing', icon: 'list-ordered', end: true },
    { to: '/dispatch/map', label: 'Map', icon: 'map' },
    { to: '/dispatch/history', label: 'History', icon: 'clipboard-list' },
  ],
};

const FLEET: NavSection = {
  key: 'fleet',
  label: 'Fleet',
  icon: 'vehicle',
  children: [
    { to: '/fleet/vehicles', label: 'Vehicles', icon: 'vehicle' },
    // Under Fleet rather than Monitoring: the roster is not something you watch,
    // it is the constraint on every dispatch the vehicle screens make.
    { to: '/fleet/shift', label: 'Shift', icon: 'users' },
  ],
};

/**
 * Every glyph — the logo, the live dot, each top-level nav icon, the avatar —
 * sits in a 26px box that starts 15px from the rail's left edge, so all of them
 * share one vertical centre line down the rail.
 */
const ICON_SLOT = 'relative flex w-[26px] shrink-0 items-center justify-center';
/** Left inset of a top-level row, chosen so its ICON_SLOT lands on that centre
 *  line (the row already sits 8px in from the `px-2` list). */
const ROW_PAD = 'pl-[7px]';

/** Shared row shape. Nested sub-tabs indent instead of taking the icon slot. */
const ROW_BASE =
  'group/row relative flex items-center gap-2 rounded-lg py-[6px] pr-2 text-[11.5px] whitespace-nowrap transition-colors';

function isChildActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function Sidebar() {
  const ticketCount = useConsole((s) => s.workOrders.length);
  const unverified = useDispatch((s) => s.lanes.unverified.length);
  const faults = useDispatch((s) => s.lanes.mechanic.length);
  const scored = useDispatch((s) => s.scored);

  // Fixture list only until the first poll lands, so the rail is never empty.
  const zones = scored.length > 0 ? liveZones(scored) : ZONES;

  const sections = useMemo<NavSection[]>(
    () => [
      DISPATCH,
      FLEET,
      {
        key: 'maintenance',
        label: 'Maintenance',
        icon: 'wrench',
        children: [
          {
            to: '/maintenance/orders',
            label: 'Work Orders',
            icon: 'wrench',
            badge: faults + ticketCount,
          },
          { to: '/maintenance/hardware', label: 'Hardware', icon: 'cog' },
        ],
      },
      {
        key: 'monitoring',
        label: 'Monitoring',
        icon: 'radio-tower',
        children: [
          {
            to: '/monitoring/unverified',
            label: 'Not Reporting',
            icon: 'alert-triangle',
            badge: unverified,
          },
          { to: '/monitoring/site-health', label: 'Site Health', icon: 'radio-tower' },
        ],
      },
      {
        key: 'zones',
        label: 'Zones',
        icon: 'map',
        children: zones.map((z) => ({
          to: `/zone/${z.slug}`,
          label: z.name,
          count: z.stations,
        })),
      },
    ],
    [faults, ticketCount, unverified, zones],
  );

  const { pathname } = useLocation();
  const activeKey = sections.find((s) => s.children.some((c) => isChildActive(c, pathname)))?.key;

  // Manual accordion. Seeded with the section you land on; toggled by hand after.
  const [openKeys, setOpenKeys] = useState<Set<string>>(
    () => new Set(activeKey ? [activeKey] : []),
  );

  // Arriving on a route opens its section once — a redirect or a stat-card link
  // should not drop you onto a screen whose place in the tree is hidden. A
  // section the operator has since closed by hand is left closed.
  useEffect(() => {
    if (!activeKey) return;
    setOpenKeys((prev) => (prev.has(activeKey) ? prev : new Set(prev).add(activeKey)));
  }, [activeKey]);

  const toggleSection = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col bg-[var(--color-rail)] text-[var(--color-rail-ink-2)]">
      <Brand />
      <LiveStrip />

      <nav
        aria-label="Sections"
        className="thin-scroll flex-1 overflow-x-hidden overflow-y-auto py-3"
      >
        <ul className="flex flex-col gap-0.5 px-2">
          {sections.map((section) => (
            <Section
              key={section.key}
              section={section}
              open={openKeys.has(section.key)}
              active={section.key === activeKey}
              onToggle={() => toggleSection(section.key)}
            />
          ))}

          <NavRow to="/analytics" label="Analytics" icon="line-chart" />
        </ul>
      </nav>

      <UserFooter />
    </aside>
  );
}

/**
 * The wordmark.
 *
 * One line, set large enough to hold the rail's width on its own. It carried a
 * second line naming the operator until that was dropped, which left a 12px
 * word floating beside a 26px logo in a block still sized for two — the mark
 * read as a caption for the icon rather than as the name of the product. At
 * 16px it balances the logo and the space beside it is margin, not a gap.
 */
function Brand() {
  return (
    <div className="flex items-center gap-2.5 border-b border-[var(--color-rail-line)] py-3 pr-2 pl-[15px] whitespace-nowrap">
      <span
        aria-hidden="true"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-[var(--color-rail-hi)] text-white"
      >
        <Icon name="bike" size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[16px] leading-none font-semibold tracking-[-0.015em] text-white">
        Dispatch
      </span>
    </div>
  );
}

/**
 * The rail's alarm red, lightened for text.
 *
 * The dot can sit at the palette's `--color-empty` because a 6px disc only has
 * to be *seen*; the same value as 10px type on the near-black rail lands around
 * 3:1 and has to be read. Lightened to clear 4.5:1 without becoming a different
 * colour from the dot it sits beside.
 */
const RAIL_ALARM_DOT = '#c0453a';
const RAIL_ALARM_TEXT = '#e08b82';
const RAIL_LIVE_DOT = '#4ea373';

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
  const connecting = !error && fetchedAtMs === null;
  const down = Boolean(error) || stale;

  /*
   * The state gets a word, not just a colour.
   *
   * This strip previously said "Updated 53s ago" whether the feed was healthy
   * or had been failing for ten minutes — the only difference was five pixels
   * of green turning red, which is invisible to anyone who does not happen to
   * be looking at it and to anyone who cannot tell the two apart. The word is
   * the signal now and the colour reinforces it.
   *
   * Ordered by hierarchy rather than by reading order: the state is what you
   * check, the age is why, and the wall-clock time is a receipt you only want
   * when something looks wrong. Three lines of the same 10px grey made you read
   * all three to find out which one mattered.
   */
  const state = error
    ? 'Feed offline'
    : stale
      ? 'Feed delayed'
      : connecting
        ? 'Connecting'
        : 'Live';

  const detail = error
    ? 'retrying — last good data shown'
    : fetchedAtMs === null
      ? 'waiting for the first poll'
      : `updated ${formatAgo(now - fetchedAtMs)} ago`;

  return (
    <div
      className="border-b border-[var(--color-rail-line)] py-2.5 pr-3 pl-[15px]"
      title={
        error
          ? `Feed unreachable: ${error.message}. Showing the last good data and retrying.`
          : 'The board polls every 60 seconds while this tab is visible.'
      }
    >
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className={ICON_SLOT}>
          <span
            aria-hidden="true"
            className={cn('h-[6px] w-[6px] rounded-full', !down && !connecting && 'pulse-dot')}
            style={{
              backgroundColor: down
                ? RAIL_ALARM_DOT
                : connecting
                  ? 'var(--color-rail-ink-3)'
                  : RAIL_LIVE_DOT,
            }}
          />
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11px] leading-none font-medium"
          style={{ color: down ? RAIL_ALARM_TEXT : 'var(--color-rail-ink)' }}
        >
          {state}
        </span>
        <span className="num shrink-0 text-[10px] leading-none text-[var(--color-rail-ink-3)]">
          {fetchedAtMs === null ? '--:--' : formatClock(fetchedAtMs).slice(0, 5)}
        </span>
      </div>

      {/* Aligned under the state word, not the dot: 26px icon slot + the 8px
          gap. The indent is what makes it read as a sub-line rather than a
          second, competing row. */}
      <p className="mt-1.5 truncate pl-[34px] text-[10px] leading-none text-[var(--color-rail-ink-3)]">
        {detail}
      </p>
    </div>
  );
}

/**
 * One section: a header that toggles its sub-tabs.
 *
 * The header carries no solid highlight of its own even when it owns the route
 * — the active *child* row is already marked, and a second bar above it reads
 * as two selections.
 */
function Section({
  section,
  open,
  active,
  onToggle,
}: {
  section: NavSection;
  open: boolean;
  active: boolean;
  onToggle: () => void;
}) {
  const badgeTotal = section.children.reduce((sum, c) => sum + (c.badge ?? 0), 0);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          ROW_BASE,
          ROW_PAD,
          'w-full py-[7px] hover:bg-[#332c25]',
          active ? 'font-medium text-white' : 'text-[var(--color-rail-ink-2)] hover:text-white',
        )}
      >
        <span className={ICON_SLOT}>
          <Icon name={section.icon} size={15} />
        </span>
        <span className="flex-1 truncate text-left">{section.label}</span>

        {/* Folded away, the header speaks for its children: it carries their
            total so a closed section cannot hide a queue that is filling up. */}
        {badgeTotal > 0 && !open && (
          <span className="num shrink-0 rounded bg-[#453d33] px-1.5 py-px text-[10px] font-semibold text-[#d8cfc0]">
            {badgeTotal}
          </span>
        )}
        <Icon
          name="chevron-right"
          size={12}
          className={cn(
            'shrink-0 text-[var(--color-rail-ink-3)] transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
      </button>

      {/* Height is animated by the 0fr → 1fr grid row rather than a guessed
          max-height, so the curve is the same whether a section holds two
          sub-tabs or six. `inert` keeps the folded-away rows out of the tab
          order and the accessibility tree. */}
      <div
        className="rail-ease grid transition-[grid-template-rows]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
        aria-hidden={!open}
        {...(!open ? { inert: '' } : {})}
      >
        <ul className="ml-[26px] flex min-h-0 flex-col gap-px overflow-hidden border-l border-[var(--color-rail-line)] pl-1.5">
          {section.children.map((item) => (
            <NavRow key={item.to} {...item} nested />
          ))}
        </ul>
      </div>
    </li>
  );
}

function NavRow({
  to,
  label,
  icon,
  badge,
  count,
  end,
  nested = false,
}: NavItem & { nested?: boolean }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            ROW_BASE,
            nested ? 'pl-2' : ROW_PAD,
            isActive
              ? 'bg-[var(--color-rail-hi)] font-medium text-white'
              : 'text-[var(--color-rail-ink-2)] hover:bg-[#332c25] hover:text-white',
          )
        }
      >
        <span className={ICON_SLOT}>
          {icon ? (
            <Icon name={icon} size={15} />
          ) : (
            <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-current opacity-50" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="num shrink-0 rounded bg-[#453d33] px-1.5 py-px text-[10px] font-semibold text-[#d8cfc0]">
            {badge}
          </span>
        )}
        {count !== undefined && (
          <span className="num shrink-0 text-[10px] text-[var(--color-rail-ink-3)]">{count}</span>
        )}
      </NavLink>
    </li>
  );
}

function UserFooter() {
  return (
    <div className="flex items-center gap-2 border-t border-[var(--color-rail-line)] py-2.5 pr-3 pl-[17px] whitespace-nowrap">
      <span
        aria-hidden="true"
        className="h-[22px] w-[22px] shrink-0 rounded-full bg-gradient-to-br from-[#8a7c68] to-[#5c5145]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-tight font-medium text-white">Ops Center</span>
        <span className="block text-[10px] leading-tight text-[var(--color-rail-ink-3)]">Admin</span>
      </span>
      <button
        type="button"
        aria-label="Account menu"
        className="shrink-0 text-[var(--color-rail-ink-3)] hover:text-white"
      >
        <Icon name="more-vertical" size={13} />
      </button>
    </div>
  );
}
