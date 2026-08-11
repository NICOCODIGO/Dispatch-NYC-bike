import { formatReportedAge } from '../lib/time';
import { cn } from '../lib/cn';

/**
 * "How old is this reading."
 *
 * Staleness used to be amber. It isn't any more: a color that means "slightly
 * suspect" competes with the signal colors for attention while telling a
 * dispatcher nothing they can act on, and the genuinely untrustworthy readings
 * are now quarantined in the Unverified section rather than tinted in place.
 * What's left is a neutral fact, so it reads as one — mono, soft ink, with a
 * clock glyph to mark it as a time rather than a count.
 */
export function ReportedAge({
  ageMinutes,
  className,
}: {
  ageMinutes: number | null;
  className?: string;
}) {
  return (
    <span className={cn('num text-[13px] tabular-nums text-[var(--ink-soft)]', className)}>
      <span aria-hidden="true" className="mr-1 opacity-70">
        ◷
      </span>
      {formatReportedAge(ageMinutes)}
    </span>
  );
}
