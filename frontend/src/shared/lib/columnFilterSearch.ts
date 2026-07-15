import { normalizeText } from "./textNormalize";

export function matchesPartialSearch(haystack: string, query: string): boolean {
  const q = normalizeText(query.trim());
  if (!q) return true;
  return normalizeText(haystack).includes(q);
}

/** Lower rank = better match. Infinity = no match. */
export function rankPartialSearchMatch(label: string, query: string): number {
  const q = normalizeText(query.trim());
  if (!q) return 0;
  const normalized = normalizeText(label);
  if (normalized.startsWith(q)) return 0;
  const idx = normalized.indexOf(q);
  if (idx === -1) return Number.POSITIVE_INFINITY;
  return 1 + idx;
}

export function sortByPartialSearchMatch<T>(
  values: T[],
  query: string,
  getLabel: (value: T) => string,
): T[] {
  const q = query.trim();
  if (!q) return values;
  return [...values]
    .filter((v) => matchesPartialSearch(getLabel(v), q))
    .sort((a, b) => {
      const rankDiff = rankPartialSearchMatch(getLabel(a), q) - rankPartialSearchMatch(getLabel(b), q);
      if (rankDiff !== 0) return rankDiff;
      return getLabel(a).localeCompare(getLabel(b), "ru");
    });
}

export function hasActiveColumnFilters<Field extends string>(
  columnFilters: Partial<Record<Field, Set<string>>>,
  columnSearchQueries: Partial<Record<Field, string>>,
): boolean {
  const hasSetFilters = Object.values(columnFilters).some(
    (s): s is Set<string> => s instanceof Set && s.size > 0,
  );
  const hasSearchFilters = Object.values(columnSearchQueries).some(
    (q): q is string => typeof q === "string" && q.trim().length > 0,
  );
  return hasSetFilters || hasSearchFilters;
}

export function buildColumnFilterPredicate<T, Field extends string>(opts: {
  columnFilters: Partial<Record<Field, Set<string>>>;
  columnSearchQueries: Partial<Record<Field, string>>;
  getCellValue: (row: T, field: Field) => string;
}): ((row: T) => boolean) | null {
  const { columnFilters, columnSearchQueries, getCellValue } = opts;
  if (!hasActiveColumnFilters(columnFilters, columnSearchQueries)) return null;

  return (row: T) => {
    const fields = new Set<Field>([
      ...(Object.keys(columnFilters) as Field[]),
      ...(Object.keys(columnSearchQueries) as Field[]),
    ]);

    for (const field of fields) {
      const search = columnSearchQueries[field]?.trim();
      const selected = columnFilters[field];
      const cellValue = getCellValue(row, field);

      if (search) {
        if (!matchesPartialSearch(cellValue, search)) return false;
        continue;
      }

      if (selected && selected.size > 0 && !selected.has(cellValue)) {
        return false;
      }
    }
    return true;
  };
}