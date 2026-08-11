import { useCallback, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from './cn';

/** The app's single orchestrated motion, in ms. */
export const FLIP_DURATION_MS = 200;

/**
 * FLIP re-ordering for the queue.
 *
 * On refresh the ranking changes and rows move. Animating that move is the one
 * piece of motion in the app, and it exists for a reason: a dispatcher watching
 * the board needs to see that row 4 climbed to row 1, not just find a different
 * number there. Everything else is static.
 *
 * Usage: call `register(key)` as the row's ref. After each commit the hook
 * measures every registered row, compares against the previous commit, and for
 * any row that moved applies the inverse translation before releasing it.
 */
export function useFlip(revision: number) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, number>());
  const lastRevision = useRef(revision);

  const register = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(key, el);
      else nodes.current.delete(key);
    },
    [],
  );

  useLayoutEffect(() => {
    const previous = positions.current;
    const next = new Map<string, number>();

    for (const [key, el] of nodes.current) {
      next.set(key, el.offsetTop);
    }

    // Only animate on an actual data refresh. Typing in the search box also
    // reorders rows, and animating that would make filtering feel laggy.
    const isRefresh = revision !== lastRevision.current;
    lastRevision.current = revision;

    if (isRefresh && previous.size > 0 && !prefersReducedMotion()) {
      for (const [key, el] of nodes.current) {
        const before = previous.get(key);
        const after = next.get(key);
        if (before === undefined || after === undefined) continue;

        const delta = before - after;
        if (Math.abs(delta) < 1) continue;

        el.style.transform = `translateY(${delta}px)`;
        el.style.transition = 'none';
      }

      // Two frames: one to flush the inverted position, one to release it.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          for (const el of nodes.current.values()) {
            if (!el.style.transform) continue;
            el.style.transition = `transform ${FLIP_DURATION_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)`;
            el.style.transform = '';
          }
        });
      });
    }

    positions.current = next;
  });

  return register;
}
