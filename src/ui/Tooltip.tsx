import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

/**
 * A hover/focus layer that sits on top of whatever it wraps.
 *
 * Three things this gets right that a naive tooltip does not:
 *
 * 1. **The hover target is the trigger itself.** The wrapper is a zero-padding
 *    `inline-flex`, so its box is exactly the child's box. A tooltip attached
 *    to a padded wrapper fires in dead space beside the thing it describes,
 *    and on a table row that means it fires while you are aiming at the row.
 *
 * 2. **It portals to the body.** The queue table scrolls horizontally, so a
 *    panel positioned inside it gets clipped by `overflow-x-auto`. Fixed
 *    positioning against a measured rect is the only version that survives
 *    being inside a scroll container.
 *
 * 3. **It does not touch the cursor of a clickable child.** `cursor-help` goes
 *    on the wrapper only when the trigger is hover-only; buttons and links
 *    carry their own pointer cursor and sit above the wrapper, so a nested
 *    control never inherits the wrong affordance.
 */

const GAP = 8;

export function Tooltip({
  content,
  children,
  help = false,
  width = 280,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  /** True when the trigger only reveals information — no click behaviour. */
  help?: boolean;
  width?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; flip: boolean } | null>(null);

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();

    // Prefer above; flip below when there is not room, and clamp horizontally
    // so a panel on a right-hand column never runs off screen.
    const flip = r.top < 160;
    const left = Math.min(
      Math.max(GAP, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - GAP,
    );

    setBox({ top: flip ? r.bottom + GAP : r.top - GAP, left, flip });
  }, [width]);

  const hide = useCallback(() => setBox(null), []);

  // A tooltip anchored to a measured rect is wrong the moment anything moves.
  useEffect(() => {
    if (!box) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      document.removeEventListener('keydown', onKey);
    };
  }, [box, hide]);

  return (
    <span
      ref={ref}
      className={cn('relative inline-flex', help && 'cursor-help', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}

      {box &&
        createPortal(
          <span
            role="tooltip"
            className="fade-in pointer-events-none fixed z-[80] block rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-left shadow-[0_6px_24px_rgb(43_38_33/14%)]"
            style={{
              width,
              left: box.left,
              top: box.top,
              transform: box.flip ? undefined : 'translateY(-100%)',
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   The pieces tooltip bodies are built from, so every panel in the app reads
   the same way.
--------------------------------------------------------------------------- */

export function TipTitle({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold text-[var(--color-ink)]">{children}</p>;
}

export function TipBody({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-ink-2)]">{children}</p>;
}

/**
 * The line that says what clicking does.
 *
 * Always names its destination. "Click for more" tells a reader nothing they
 * could not guess and nothing they need — where they will land is the only
 * part worth the pixels. Rendered only when there is genuinely an action.
 */
export function TipAction({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 border-t border-[var(--color-line-soft)] pt-1.5 text-[10px] font-medium text-[var(--color-ink-3)]">
      {children}
    </p>
  );
}
