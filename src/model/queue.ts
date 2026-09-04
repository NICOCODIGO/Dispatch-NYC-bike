/**
 * Queue filtering and sorting.
 *
 * Kept out of the components so the ordering a dispatcher sees is testable, and
 * so the detail panel's prev/next walks exactly the list on screen.
 *
 * The table is scoped to the vehicle lane by construction: mechanic and
 * unverified stations live in their own sections and can never be filtered into
 * the ranked queue, because the queue answers one question and they are not an
 * answer to it.
 */

import type { StationCategory } from './score';
import type { Filters, SortKey } from '../store/useDispatch';
import { compareByUrgency, type ScoredStation } from './summary';
import type { Triaged } from './triage';

const NULLS_LAST = Number.NEGATIVE_INFINITY;

/** Severity rank, so sorting the failure column groups by how bad the failure
 *  is rather than alphabetically — "Empty" before "Flooded" would be useless. */
const CATEGORY_RANK: Record<StationCategory, number> = {
  unusable: 7,
  outage: 6,
  empty: 5,
  full: 4,
  starving: 3,
  flooded: 2,
  healthy: 1,
  not_installed: 0,
};

function valueFor(s: ScoredStation, key: SortKey): number | string {
  switch (key) {
    case 'score':
      return s.breakdown.score;
    case 'name':
      return s.station.name.toLowerCase();
    case 'borough':
      return s.station.borough.toLowerCase();
    case 'fill':
      return s.breakdown.fill.ratio ?? NULLS_LAST;
    case 'reported':
      return s.breakdown.staleness.ageMinutes ?? Number.POSITIVE_INFINITY;
    case 'category':
      return CATEGORY_RANK[s.breakdown.category];
  }
}

export function applyFilters(lanes: Triaged, filters: Filters): ScoredStation[] {
  const { search, borough, categories, sortKey, sortDir } = filters;
  const needle = search.trim().toLowerCase();

  // With no category filter the queue is the vehicle lane. Selecting Healthy or
  // Not installed in the rail is an explicit request to inspect those, so they
  // join the pool — but mechanic and unverified never do.
  const pool =
    categories.length === 0
      ? lanes.vehicle
      : [...lanes.vehicle, ...lanes.quiet].filter((s) =>
          categories.includes(s.breakdown.category),
        );

  const filtered = pool.filter(({ station }) => {
    if (borough !== 'all' && station.borough !== borough) return false;
    if (needle) {
      const haystack = `${station.name} ${station.shortName ?? ''} ${station.borough}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    const av = valueFor(a, sortKey);
    const bv = valueFor(b, sortKey);

    if (typeof av === 'string' || typeof bv === 'string') {
      const cmp = String(av).localeCompare(String(bv));
      return cmp === 0 ? compareByUrgency(a, b) : cmp * dir;
    }
    if (av === bv) return compareByUrgency(a, b);
    return (av - bv) * dir;
  });
}

/** Human-readable description of the active filters, for the status line. */
export function describeFilters(
  filters: Filters,
  categoryLabel: (c: StationCategory) => string,
): string[] {
  const out: string[] = [];
  if (filters.categories.length > 0) out.push(...filters.categories.map(categoryLabel));
  if (filters.borough !== 'all') out.push(filters.borough);
  if (filters.search.trim()) out.push(`"${filters.search.trim()}"`);
  return out;
}

export function hasActiveFilters(filters: Filters): boolean {
  return (
    filters.categories.length > 0 || filters.borough !== 'all' || filters.search.trim() !== ''
  );
}
