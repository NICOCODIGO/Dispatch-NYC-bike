import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { ZONES } from '../mock/data';
import { liveZones } from '../data/insights';
import { useConsole } from '../state/useConsole';
import { useSidebar, type PinnedLayout } from '../state/useSidebar';
import { POLL_INTERVAL_MS, useDispatch } from '../store/useDispatch';
import { formatAgo, formatClock, useTicker } from '../lib/time';
import { cn } from '../lib/cn';

/**
 * The chrome rail.
 *
 * Near-black warm brown, full height. It is the only dark surface in the app:
 * everything the console *reports* lives on cream paper, and everything it is —
 * identity, navigation, session — lives here. That split is what keeps a nav
 * item from ever being mistaken for data.
 *
 * It rests as a ~56px strip of icons and peeks open to the full panel on hover
 * or keyboard focus, floating over the board rather than pushing it. A pin
 * (⌘/Ctrl+B) locks it open; while pinned the operator chooses whether it pushes
 * the content narrower or keeps floating over it.
 *
 * ## Why nothing jumps on peek
 *
 * Every row is laid out once at the full 200px width, inside a fixed-width plane
 * the `<aside>` clips with `overflow: hidden`. Widening the aside is the whole
 * animation — the icons never move or resize because each sits in a fixed slot,
 * and the labels simply fade in beside them. Nothing is re-rendered into a
 * different shape.
 *
 * Sections are a plain accordion: clicking a header toggles its sub-tabs, and
 * more than one can be open at a time. The section that owns the current route
 * opens itself on arrival, but the operator can close it and it stays closed.
 * While the rail is collapsed the children fold away regardless; they come back
 * as they were left when it opens again.
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
  icon: 'truck',
  children: [
    { to: '/fleet/trucks', label: 'Trucks', icon: 'truck' },
    // Under Fleet rather than Monitoring: the roster is not something you watch,
    // it is the constraint on every dispatch the truck screens make.
    { to: '/fleet/shift', label: 'Shift', icon: 'users' },
  ],
};

/** How long the pointer has to rest on the rail before it peeks open. */
const PEEK_DELAY_MS = 180;

/**
 * Every glyph — the logo, the live dot, each nav icon, the avatar — sits in a
 * 26px box that starts 15px from the rail's left edge, so all of them share one
 * vertical centre line down the 56px collapsed strip.
 */
const ICON_SLOT = 'relative flex w-[26px] shrink-0 items-center justify-center';
/** Left inset of a nav row, chosen so its ICON_SLOT lands on that centre line
 *  (the row already sits 8px in from the `px-2` list). */
const ROW_PAD = 'pl-[7px]';

/** Fades a label in only once the rail is open — collapsed shows bare icons. */
function reveal(expanded: boolean): string {
  return cn(
    'transition-opacity duration-150',
    expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
  );
}

/**
 * The highlight behind a top-level row. A ~40px lozenge centred in the collapsed
 * strip that grows to a full-width bar as the rail opens — so the selection is
 * never a rectangle sliced off at the rail's edge.
 */
function RowBg({ expanded, active }: { expanded: boolean; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'rail-ease pointer-events-none absolute inset-y-[2px] left-0 rounded-lg transition-[right]',
        expanded ? 'right-0' : 'right-[calc(100%-40px)]',
        active ? 'bg-[var(--color-rail-hi)]' : 'group-hover/row:bg-[#332c25]',
      )}
    />
  );
}

function isChildActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function Sidebar({ forceExpanded = false }: { forceExpanded?: boolean }) {
  const ticketCount = useConsole((s) => s.workOrders.length);
  const unverified = useDispatch((s) => s.lanes.unverified.length);
  const faults = useDispatch((s) => s.lanes.mechanic.length);
  const scored = useDispatch((s) => s.scored);

  const pinned = useSidebar((s) => s.pinned);
  const layout = useSidebar((s) => s.layout);
  const togglePinned = useSidebar((s) => s.togglePinned);
  const setLayout = useSidebar((s) => s.setLayout);

  // Hover intent: the pointer has to linger, so brushing past the edge on the
  // way somewhere else does not fire the panel open.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const expanded = pinned || forceExpanded || peek;
  // The panel only casts a shadow when it is actually floating over the board.
  const inline = forceExpanded || (pinned && layout === 'push');
  const floating = expanded && !inline;

  const openPeek = () => {
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(true), PEEK_DELAY_MS);
  };
  const closeRail = () => {
    clearTimeout(peekTimer.current);
    setPeek(false);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        togglePinned();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePinned]);

  // Unpinning while the pointer is still over the rail should leave it open
  // until the pointer actually leaves, not snap shut under the cursor.
  const handleTogglePin = () => {
    if (pinned) setPeek(true);
    togglePinned();
  };

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
    <aside
      onMouseEnter={openPeek}
      onMouseLeave={closeRail}
      onFocus={() => setPeek(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPeek(false);
      }}
      className={cn(
        'rail-ease absolute inset-y-0 left-0 z-30 overflow-hidden bg-[var(--color-rail)] text-[var(--color-rail-ink-2)] transition-[width,box-shadow]',
        expanded ? 'w-[200px]' : 'w-14',
        floating && 'shadow-[2px_0_28px_rgb(43_38_33/22%)]',
      )}
    >
      {/* The fixed plane. It is always 200px wide and laid out once; the aside
          above is the moving viewport onto it. */}
      <div className="flex h-full w-[200px] shrink-0 flex-col">
        <Brand expanded={expanded} pinned={pinned} onTogglePin={handleTogglePin} />
        <LiveStrip expanded={expanded} />

        <nav
          aria-label="Sections"
          className="thin-scroll flex-1 overflow-x-hidden overflow-y-auto py-3"
        >
          <ul className="flex flex-col gap-0.5 px-2">
            {sections.map((section) => (
              <Section
                key={section.key}
                section={section}
                expanded={expanded}
                open={openKeys.has(section.key)}
                active={section.key === activeKey}
                onToggle={() => toggleSection(section.key)}
              />
            ))}

            <NavRow to="/analytics" label="Analytics" icon="line-chart" expanded={expanded} />
          </ul>
        </nav>

        <UserFooter
          expanded={expanded}
          pinned={pinned}
          layout={layout}
          onSetLayout={setLayout}
        />
      </div>
    </aside>
  );
}

function Brand({
  expanded,
  pinned,
  onTogglePin,
}: {
  expanded: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-rail-line)] py-2.5 pr-2 pl-[15px] whitespace-nowrap">
      <span
        aria-hidden="true"
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-[var(--color-rail-hi)] text-white"
      >
        <Icon name="bike" size={15} />
      </span>
      <span className={cn('min-w-0 flex-1', reveal(expanded))}>
        <span className="block text-[12px] leading-tight font-semibold text-white">Dispatch</span>
        <span className="block text-[10px] leading-tight text-[var(--color-rail-ink-3)]">
          NYC Bike Ops
        </span>
      </span>
      <button
        type="button"
        onClick={onTogglePin}
        aria-pressed={pinned}
        aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
        title={`${pinned ? 'Unpin' : 'Pin'} sidebar  (⌘B)`}
        className={cn(
          'shrink-0 rounded p-1 transition-colors hover:bg-[#332c25] hover:text-white',
          pinned ? 'text-white' : 'text-[var(--color-rail-ink-3)]',
          reveal(expanded),
        )}
      >
        <Icon name="panel-left" size={14} />
      </button>
    </div>
  );
}

/**
 * The heartbeat.
 *
 * One place in the app states how fresh everything is. Collapsed, only the
 * status dot shows — it sits in the same icon slot as the nav glyphs, so it
 * holds still while the "Updated 2m ago" text fades in beside it.
 *
 * Its own component so the one-second tick repaints twelve pixels of chrome
 * instead of a table of two thousand rows.
 */
function LiveStrip({ expanded }: { expanded: boolean }) {
  const fetchedAtMs = useDispatch((s) => s.fetchedAtMs);
  const error = useDispatch((s) => s.error);
  const now = useTicker(1000);

  const stale = fetchedAtMs !== null && now - fetchedAtMs > POLL_INTERVAL_MS * 2;
  const dot = error || stale ? '#c0453a' : '#4ea373';

  return (
    <div
      className="flex items-center gap-2 border-b border-[var(--color-rail-line)] py-2 pr-3 pl-[15px] whitespace-nowrap"
      title={
        error
          ? `Feed unreachable: ${error.message}. Showing the last good data and retrying.`
          : 'The board polls every 60 seconds while this tab is visible.'
      }
    >
      <span className={ICON_SLOT}>
        <span
          aria-hidden="true"
          className={cn('h-[5px] w-[5px] rounded-full', !error && !stale && 'pulse-dot')}
          style={{ backgroundColor: dot }}
        />
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[10px] text-[var(--color-rail-ink-2)]',
          reveal(expanded),
        )}
      >
        {error
          ? 'Retrying'
          : fetchedAtMs === null
            ? 'Connecting…'
            : `Updated ${formatAgo(now - fetchedAtMs)} ago`}
      </span>
      <span
        className={cn('num shrink-0 text-[10px] text-[var(--color-rail-ink-3)]', reveal(expanded))}
      >
        {fetchedAtMs === null ? '--:--' : formatClock(fetchedAtMs).slice(0, 5)}
      </span>
    </div>
  );
}

/**
 * One section. Its header holds still at every width; clicking it toggles the
 * sub-tabs, which unfold on the same curve as the rail.
 */
function Section({
  section,
  expanded,
  open,
  active,
  onToggle,
}: {
  section: NavSection;
  expanded: boolean;
  open: boolean;
  active: boolean;
  onToggle: () => void;
}) {
  const badgeTotal = section.children.reduce((sum, c) => sum + (c.badge ?? 0), 0);
  const childrenVisible = expanded && open;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'group/row relative flex w-full items-center gap-2 py-[7px] pr-2 text-[11.5px] whitespace-nowrap transition-colors',
          ROW_PAD,
          active ? 'font-medium text-white' : 'text-[var(--color-rail-ink-2)] hover:text-white',
        )}
      >
        {/* Solid only as the collapsed accent — expanded, the active *child* row
            carries the highlight and a second bar on the header is just noise. */}
        <RowBg expanded={expanded} active={active && !expanded} />

        <span className={ICON_SLOT}>
          <Icon name={section.icon} size={15} />
        </span>
        <span className={cn('relative flex-1 truncate text-left', reveal(expanded))}>
          {section.label}
        </span>

        {/* Rides the icon so it survives while the rail is a bare strip. */}
        {badgeTotal > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1 left-[26px] h-[6px] w-[6px] rounded-full border border-[var(--color-rail)] bg-[#c0453a] transition-opacity duration-150',
              expanded ? 'opacity-0' : 'opacity-100',
            )}
          />
        )}
        {badgeTotal > 0 && !open && (
          <span
            className={cn(
              'num relative shrink-0 rounded bg-[#453d33] px-1.5 py-px text-[10px] font-semibold text-[#d8cfc0]',
              reveal(expanded),
            )}
          >
            {badgeTotal}
          </span>
        )}
        <Icon
          name="chevron-right"
          size={12}
          className={cn(
            'relative shrink-0 text-[var(--color-rail-ink-3)] transition-[transform,opacity] duration-150',
            open && 'rotate-90',
            expanded ? 'opacity-100' : 'opacity-0',
          )}
        />
      </button>

      {/* One tree at every width — the group just unfolds. `inert` keeps the
          folded-away rows out of the tab order and the accessibility tree. */}
      <div
        className="rail-ease grid transition-[grid-template-rows]"
        style={{ gridTemplateRows: childrenVisible ? '1fr' : '0fr' }}
        aria-hidden={!childrenVisible}
        {...(!childrenVisible ? { inert: '' } : {})}
      >
        <ul className="ml-[26px] flex min-h-0 flex-col gap-px overflow-hidden border-l border-[var(--color-rail-line)] pl-1.5">
          {section.children.map((item) => (
            <NavRow key={item.to} {...item} nested expanded={expanded} />
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
  expanded,
}: NavItem & { nested?: boolean; expanded: boolean }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'group/row relative flex items-center gap-2 py-[6px] pr-2 text-[11.5px] whitespace-nowrap transition-colors',
            nested ? 'rounded-lg pl-2' : ROW_PAD,
            isActive
              ? 'font-medium text-white'
              : 'text-[var(--color-rail-ink-2)] hover:text-white',
            nested && (isActive ? 'bg-[var(--color-rail-hi)]' : 'hover:bg-[#332c25]'),
          )
        }
      >
        {({ isActive }) => (
          <>
            {!nested && <RowBg expanded={expanded} active={isActive} />}
            <span className={ICON_SLOT}>
              {icon ? (
                <Icon name={icon} size={15} />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-[5px] w-[5px] rounded-full bg-current opacity-50"
                />
              )}
            </span>
            <span className={cn('relative flex-1 truncate', reveal(expanded))}>{label}</span>
            {badge !== undefined && badge > 0 && (
              <span
                className={cn(
                  'num relative shrink-0 rounded bg-[#453d33] px-1.5 py-px text-[10px] font-semibold text-[#d8cfc0]',
                  reveal(expanded),
                )}
              >
                {badge}
              </span>
            )}
            {count !== undefined && (
              <span
                className={cn(
                  'num relative shrink-0 text-[10px] text-[var(--color-rail-ink-3)]',
                  reveal(expanded),
                )}
              >
                {count}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

function UserFooter({
  expanded,
  pinned,
  layout,
  onSetLayout,
}: {
  expanded: boolean;
  pinned: boolean;
  layout: PinnedLayout;
  onSetLayout: (l: PinnedLayout) => void;
}) {
  return (
    <div className="border-t border-[var(--color-rail-line)]">
      {pinned && (
        <div
          className={cn(
            'flex items-center justify-between gap-2 border-b border-[var(--color-rail-line)] py-2 pr-3 pl-[15px] whitespace-nowrap',
            reveal(expanded),
          )}
        >
          <span className="text-[10px] text-[var(--color-rail-ink-3)]">Layout</span>
          <span className="inline-flex shrink-0 rounded border border-[var(--color-rail-line)] p-0.5">
            {(['push', 'overlay'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onSetLayout(opt)}
                aria-pressed={layout === opt}
                className={cn(
                  'rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  layout === opt
                    ? 'bg-[var(--color-rail-hi)] text-white'
                    : 'text-[var(--color-rail-ink-3)] hover:text-[var(--color-rail-ink-2)]',
                )}
              >
                {opt === 'overlay' ? 'Float' : 'Push'}
              </button>
            ))}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 py-2.5 pr-3 pl-[17px] whitespace-nowrap">
        <span
          aria-hidden="true"
          className="h-[22px] w-[22px] shrink-0 rounded-full bg-gradient-to-br from-[#8a7c68] to-[#5c5145]"
        />
        <span className={cn('min-w-0 flex-1', reveal(expanded))}>
          <span className="block text-[11px] leading-tight font-medium text-white">Ops Center</span>
          <span className="block text-[10px] leading-tight text-[var(--color-rail-ink-3)]">Admin</span>
        </span>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            'shrink-0 text-[var(--color-rail-ink-3)] hover:text-white',
            reveal(expanded),
          )}
        >
          <Icon name="more-vertical" size={13} />
        </button>
      </div>
    </div>
  );
}
