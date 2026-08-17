import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Cross-screen deep links.
 *
 * Several screens describe a relationship to another one and then stop —
 * Maintenance says stations are "routed off the queue onto this page" with no
 * link either way; Analytics lists neglected stations you cannot act on. This
 * is the one mechanism that carries a reader from any of them to the entity on
 * its home screen.
 *
 * Implemented on the URL rather than as in-memory handler state, for one
 * reason that matters more than the others: **the browser Back button then
 * works**. Every arrival has to be reversible, and the reversal a user will
 * actually reach for is the one already in their hands. A shareable link and
 * survival across reload come free with it.
 */

export interface Arrival {
  /** Entity to resolve and scroll to. */
  focus: string | null;
  /** Human name of where the reader came from, for the banner. */
  from: string | null;
  /** Path to send them back to. */
  back: string | null;
}

export function focusHref(path: string, focusId: string, from: string, back: string): string {
  const q = new URLSearchParams({ focus: focusId, from, back });
  return `${path}?${q.toString()}`;
}

export function useArrival(): Arrival & { dismiss: () => void } {
  const [params, setParams] = useSearchParams();

  const dismiss = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('focus');
    next.delete('from');
    next.delete('back');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return {
    focus: params.get('focus'),
    from: params.get('from'),
    back: params.get('back'),
    dismiss,
  };
}

/** Navigates to another screen focused on one entity. */
export function useFocusNav() {
  const navigate = useNavigate();
  return useCallback(
    (path: string, focusId: string, from: string, back: string) => {
      navigate(focusHref(path, focusId, from, back));
    },
    [navigate],
  );
}

/**
 * Scrolls the focused element into view once it exists.
 *
 * Deliberately fires once per focus id. Re-scrolling on every poll would yank
 * the page out from under someone reading it, and this board repaints every
 * sixty seconds.
 */
export function useScrollToFocus(focus: string | null, ready: boolean) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!focus || !ready || done.current === focus) return;
    const el = document.querySelector(`[data-focus-id="${CSS.escape(focus)}"]`);
    if (!el) return;
    done.current = focus;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus, ready]);
}
