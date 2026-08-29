import { create } from 'zustand';

/**
 * Chrome-rail preferences.
 *
 * The rail rests at ~56px and peeks open on hover (that part is transient view
 * state, held in the component). What lives here is the sticky choice: whether
 * the operator has pinned it open, and — while pinned — whether it pushes the
 * board narrower or floats over it.
 *
 * Persisted by hand rather than through a middleware, matching the rest of the
 * stores. A failed write (private mode, quota) just means the rail forgets, so
 * it is swallowed.
 */

export type PinnedLayout = 'push' | 'overlay';

interface SidebarState {
  pinned: boolean;
  /** Only consulted while `pinned`. */
  layout: PinnedLayout;
  togglePinned: () => void;
  setLayout: (layout: PinnedLayout) => void;
}

const KEY = 'dispatch.sidebar';

interface Persisted {
  pinned: boolean;
  layout: PinnedLayout;
}

function load(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted>;
    return {
      pinned: typeof raw.pinned === 'boolean' ? raw.pinned : false,
      layout: raw.layout === 'overlay' ? 'overlay' : 'push',
    };
  } catch {
    return { pinned: false, layout: 'push' };
  }
}

function persist(next: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* no persistence available — the rail still works, it just won't remember */
  }
}

export const useSidebar = create<SidebarState>((set) => ({
  ...load(),
  togglePinned: () =>
    set((s) => {
      const next = { pinned: !s.pinned, layout: s.layout };
      persist(next);
      return { pinned: next.pinned };
    }),
  setLayout: (layout) =>
    set((s) => {
      persist({ pinned: s.pinned, layout });
      return { layout };
    }),
}));
