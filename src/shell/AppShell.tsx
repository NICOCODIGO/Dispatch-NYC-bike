import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { StationDrawerHost } from './StationDrawerHost';
import { cn } from '../lib/cn';

/**
 * Rail plus scrolling work area.
 *
 * The rail is fixed and the main column is the only thing that scrolls, so the
 * nav, the live indicator and the account row stay put no matter how long a
 * table runs — the behaviour of a console someone sits in front of all shift,
 * not a page they read top to bottom.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-canvas)]">
      <a
        href="#main"
        className="sr-only bg-[var(--color-ink)] px-4 py-2 text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md"
      >
        Skip to content
      </a>

      <Sidebar />

      <div id="main" className="thin-scroll min-w-0 flex-1 overflow-y-auto">
        {children}
      </div>

      {/* The station receipt lives at the shell, not on the queue: a station is
          openable from a map pin, a zone row, a ticket or an offender list, and
          it should look and behave identically from all of them. */}
      <StationDrawerHost />
    </div>
  );
}

/**
 * The bar at the top of every screen: title, one line of context, and the
 * screen's actions. Sits on the canvas rather than in a card — it labels the
 * page, it is not part of the data.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[var(--color-line)] px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[14px] leading-tight font-semibold text-[var(--color-ink)]">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[11px] leading-tight text-[var(--color-ink-2)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standard padding for the body of a screen. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-4', className)}>{children}</div>;
}
