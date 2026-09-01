import { useState } from 'react';
import { Icon } from './Icon';
import { GUIDES } from '../content/guides';
import { linkifyNode } from '../content/definitions';
import { cn } from '../lib/cn';

/**
 * "How to read this page" — the framing a new dispatcher needs once and a daily
 * one never does.
 *
 * So it is not permanent: open on a first visit, and once collapsed it shrinks
 * to a single blue link and stays that way. The choice is remembered per screen
 * in `localStorage`, keyed by `id`. Content lives in `src/content/guides.tsx`.
 */

const storageKey = (id: string) => `dispatch.guide.${id}`;

function isOpen(id: string): boolean {
  try {
    return localStorage.getItem(storageKey(id)) !== 'closed';
  } catch {
    return true;
  }
}

export function PageGuide({ id, className }: { id: string; className?: string }) {
  const body = GUIDES[id];
  const [open, setOpen] = useState(() => isOpen(id));

  if (!body) return null;

  const set = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(storageKey(id), next ? 'open' : 'closed');
    } catch {
      /* no persistence — the guide still works, it just won't remember */
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => set(true)}
        className={cn(
          'mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium underline-offset-2 hover:underline',
          className,
        )}
        style={{ color: 'var(--color-flood)' }}
      >
        <Icon name="info" size={12} />
        How to read this page
      </button>
    );
  }

  return (
    <div
      className={cn(
        'mb-3 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-flood-bg)',
        borderColor: 'var(--color-flood-line)',
      }}
    >
      <Icon
        name="info"
        size={13}
        className="mt-px shrink-0"
        style={{ color: 'var(--color-flood)' }}
      />
      <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-[var(--color-ink-2)]">
        <span className="font-semibold" style={{ color: 'var(--color-flood)' }}>
          How to read this page.{' '}
        </span>
        {linkifyNode(body)}
      </p>
      <button
        type="button"
        onClick={() => set(false)}
        aria-label="Hide the guide"
        className="shrink-0 text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
