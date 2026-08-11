/**
 * Loading state.
 *
 * Skeleton rows shaped like the real table, not a spinner. A spinner says
 * "wait"; a skeleton says "here is what is arriving and where it will be", and
 * because it occupies the same space the real rows will, nothing shifts when
 * the data lands.
 */
export function QueueSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[38px_1fr] items-center gap-4 border-b border-[var(--line)] px-4 py-4 sm:grid-cols-[38px_minmax(0,1fr)_110px_150px_90px]"
          // Fade the tail so the list reads as "loading", not "empty".
          style={{ opacity: Math.max(0.15, 1 - i / rows) }}
        >
          <div className="skeleton h-[38px] w-[38px] rounded-[8px]" />
          <div className="min-w-0">
            <div className="skeleton h-[13px] w-[52%]" />
            <div className="skeleton mt-2 h-[10px] w-[26%]" />
          </div>
          <div className="skeleton hidden h-[10px] w-[64px] sm:block" />
          <div className="skeleton hidden h-[14px] w-[130px] sm:block" />
          <div className="skeleton hidden h-[10px] w-[54px] sm:block" />
        </div>
      ))}
    </div>
  );
}
