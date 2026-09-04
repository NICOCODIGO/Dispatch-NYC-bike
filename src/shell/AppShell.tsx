import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { StationDrawerHost } from './StationDrawerHost';
import { RunWatcher } from './RunWatcher';
import { cn } from '../lib/cn';

/**
 * Rail plus scrolling work area.
 *
 * The rail holds a fixed width in the flex flow and the main column is the only
 * thing that scrolls, so the nav, the live indicator and the account row stay
 * put no matter how long a table runs — the behaviour of a console someone sits
 * in front of all shift, not a page they read top to bottom.
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
      <RunWatcher />
    </div>
  );
}

/**
 * The masthead of a screen: what this page is, and one sentence on what it is
 * for. Sits on the canvas rather than in a card — it names the page, it is not
 * part of the data.
 *
 * Deliberately the largest type in the app. Everything below it is
 * instrumentation set at 9–12px, so the console needs one unambiguous "you are
 * here" before the density starts.
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
        'flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-[var(--color-line)] px-4 pt-4 pb-3.5',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-[21px] leading-none font-semibold tracking-[-0.015em] text-[var(--color-ink)]">
          {title}
        </h1>
        {/* 12px at ink-2 read as fine print and got skipped — which matters
            more now that the page's whole explanation lives here rather than in
            a banner below. Bumped to 12.5px and the darker ink-2 sits at 5.09:1
            against the canvas: still clearly secondary to the title, no longer
            something the eye slides off. */}
        {subtitle && (
          <p className="mt-1.5 max-w-[92ch] text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 pt-0.5">{actions}</div>}
    </header>
  );
}

/** Standard padding for the body of a screen. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-4', className)}>{children}</div>;
}
