import { cn } from '../lib/cn';

/**
 * Error and warning banners.
 *
 * Errors state what happened and what the app is doing about it. They never
 * apologise: a dispatcher needs to know whether the numbers on screen can be
 * trusted, and "Sorry, something went wrong" answers nothing.
 */
export function Banner({
  tone,
  children,
  action,
}: {
  tone: 'error' | 'warning';
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 py-2.5 pr-4 pl-3 text-[14px]',
        tone === 'error'
          ? 'border-l-[var(--signal-empty)] bg-[var(--surface)]'
          : 'border-l-[var(--amber)] bg-[var(--surface)]',
      )}
    >
      <span
        aria-hidden="true"
        className="num text-[12px] font-semibold"
        style={{ color: tone === 'error' ? 'var(--signal-empty)' : 'var(--amber-ink)' }}
      >
        {tone === 'error' ? '!' : '?'}
      </span>
      <span className="flex-1 text-[var(--ink)]">{children}</span>
      {action}
    </div>
  );
}
