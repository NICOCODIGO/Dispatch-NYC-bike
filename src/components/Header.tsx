import { NavLink } from 'react-router-dom';
import { cn } from '../lib/cn';

/**
 * Masthead and tab navigation.
 *
 * The wordmark is Archivo Expanded Black under a safety-orange rule — the
 * condensed-industrial voice of highway and transit signage, in the color of
 * the vehicles this board dispatches. That rule and the active tab are the only
 * orange up here.
 *
 * There is no timestamp in this header. It used to carry "UPDATED / 6s ago"
 * while the situation readout carried its own clock; one fact, stated twice, in
 * two typefaces. The dateline now lives with the readout it qualifies.
 */
export function Header() {
  return (
    <header className="border-b border-[var(--line)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-end justify-between gap-x-8 gap-y-3 px-5 pt-5 sm:px-8">
        <div>
          <h1 className="display-black inline-block text-[24px] leading-none tracking-[0.01em] text-[var(--ink)] sm:text-[27px]">
            DISPATCH
            <span
              aria-hidden="true"
              className="mt-1.5 block h-[3px] w-full"
              style={{ backgroundColor: 'var(--accent)' }}
            />
          </h1>
          <p className="mt-2 text-[13px] text-[var(--ink-soft)]">
            Citi Bike rebalancing board — which stations need a truck, and why.
          </p>
        </div>

        <nav aria-label="Views">
          <ul className="-mb-px flex gap-6">
            <Tab to="/" label="Queue" end />
            <Tab to="/verify" label="Verify" />
          </ul>
        </nav>
      </div>
    </header>
  );
}

function Tab({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'inline-block border-b-2 pb-2.5 text-[15px] transition-colors',
            isActive
              ? 'font-semibold text-[var(--ink)]'
              : 'border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]',
          )
        }
        style={({ isActive }) => (isActive ? { borderBottomColor: 'var(--accent)' } : undefined)}
      >
        {label}
      </NavLink>
    </li>
  );
}
