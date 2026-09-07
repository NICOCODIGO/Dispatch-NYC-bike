import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { ProvenancePill } from '../ui/ProvenancePill';
import { Td, Th } from '../ui/primitives';
import { CONSTANT_GROUPS, SCORING_CONSTANTS, type ScoringConstant } from '../content/constants';
import { cn } from '../lib/cn';

/**
 * Every constant the score is built from, as a table.
 *
 * This was fifteen essays. Each constant got a heading, a badge, a paragraph
 * and a code name, and fifteen of those in a column is a wall a reader gives up
 * on before reaching the interesting part — with nothing marked as mattering
 * more than anything else, because the format gave them all identical weight.
 *
 * Almost everybody arriving here wants to *scan*: what are the numbers, and
 * which of them did somebody invent. That is three columns. The paragraph is
 * for the one constant a reader has stopped on, so it is behind a click, and
 * the code name goes with it — an identifier like `STALENESS_MAX_MINUTES` is
 * for somebody about to go and read the source, which is not a scanning task.
 *
 * The provenance badge stays in the scannable row rather than the expansion.
 * Labelling your own constants by how much you trust them is the whole claim
 * this page makes, and it costs one word.
 */
export function ConstantsTable() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">
          Every constant in the scoring model, its value, and whether it was measured, reasoned
          about, or guessed. Select a row for the full explanation.
        </caption>
        <thead>
          <tr>
            <Th width={210}>Constant</Th>
            <Th width={130}>Value</Th>
            <Th width={110}>Status</Th>
            <Th>Why</Th>
          </tr>
        </thead>

        {/* One tbody per group, so the grouping survives without spending a
            full-width heading row on it — a `th` inside the body would break
            the column rhythm the scan depends on. */}
        {CONSTANT_GROUPS.map((group) => {
          const rows = SCORING_CONSTANTS.filter((c) => c.group === group.key);
          if (rows.length === 0) return null;

          return (
            <tbody key={group.key}>
              <tr>
                <td colSpan={4} className="px-3 pt-4 pb-1">
                  <span className="eyebrow text-[10px]">{group.label}</span>
                  <span className="ml-2 text-[10px] text-[var(--color-ink-3)]">{group.note}</span>
                </td>
              </tr>

              {rows.map((c) => (
                <ConstantRow
                  key={c.key}
                  constant={c}
                  open={open === c.key}
                  onToggle={() => setOpen(open === c.key ? null : c.key)}
                />
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function ConstantRow({
  constant: c,
  open,
  onToggle,
}: {
  constant: ScoringConstant;
  open: boolean;
  onToggle: () => void;
}) {
  /*
   * The one-line "why" is the first sentence of the full one, not a second
   * string written by hand. Two summaries of one fact drift apart, and the
   * short one is the copy nobody remembers to update.
   */
  const firstSentence = c.why.split(/(?<=\.)\s/)[0] ?? c.why;
  const hasMore = firstSentence.length < c.why.length;

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'group cursor-pointer border-t border-[var(--color-line-soft)] transition-colors hover:bg-[var(--color-sunken)]',
          open && 'bg-[var(--color-sunken)]',
        )}
      >
        <Td>
          <span className="flex items-center gap-1.5">
            <Icon
              name="chevron-down"
              size={11}
              className={cn(
                'shrink-0 text-[var(--color-ink-3)] transition-transform duration-200',
                !open && '-rotate-90',
              )}
            />
            <span className="text-[11.5px] font-medium text-[var(--color-ink)]">{c.label}</span>
          </span>
        </Td>
        <Td>
          <span className="num text-[11.5px] font-semibold text-[var(--color-ink)]">{c.value}</span>
          {c.unit && (
            <span className="ml-1 text-[10px] text-[var(--color-ink-3)]">{c.unit}</span>
          )}
        </Td>
        <Td>
          <ProvenancePill provenance={c.provenance} />
        </Td>
        <Td>
          <span className="block text-[11px] leading-snug text-[var(--color-ink-2)]">
            {firstSentence}
          </span>
        </Td>
      </tr>

      {open && (
        <tr className="bg-[var(--color-sunken)]">
          <td colSpan={4} className="px-3 pt-0 pb-3">
            <div className="pl-[18px]">
              {hasMore && (
                <p className="max-w-[70ch] text-[11px] leading-relaxed text-[var(--color-ink-2)]">
                  {c.why}
                </p>
              )}
              {/* The identifier, for a reader on their way to the source. Last,
                  because wanting it is the rarest reason to open a row. */}
              <p className="mt-2 text-[10px] text-[var(--color-ink-3)]">
                In the code as{' '}
                <code className="num rounded bg-[var(--color-surface)] px-1 py-px text-[10px]">
                  {c.key}
                </code>
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
