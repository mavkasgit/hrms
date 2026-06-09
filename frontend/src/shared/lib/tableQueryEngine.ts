export type SortOrder = "asc" | "desc";

export interface SortConfig<Field extends string> {
  field: Field;
  order: "asc" | "desc";
}

export interface ColumnSortDef<T, Field extends string> {
  field: Field;
  getSortValue: (row: T) => string | number;
  compare?: (a: T, b: T, order: "asc" | "desc") => number;
}

export interface TableQueryEngineResult<T> {
  rows: T[];
  totalCount: number;
  filteredCount: number;
}

const DIACRITICS_REGEX = /\p{Diacritic}/gu;
const STRING_COLLATOR = new Intl.Collator(["ru-RU", "en-US"], {
  sensitivity: "base",
  numeric: true,
});

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS_REGEX, "")
    .replace(/ё/g, "е");
}

/**
 * Flatten a value to a searchable string. Handles nested objects recursively.
 */
function flattenValue(value: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => flattenValue(v, depth + 1)).join(" ");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries
      .map(([, v]) => flattenValue(v, depth + 1))
      .join(" ");
  }
  return "";
}

/**
 * Build a searchable string from all fields of a row.
 * Optionally restrict to specific keys.
 */
export function buildSearchIndex<T>(row: T, keys?: string[]): string {
  if (keys && keys.length > 0) {
    return normalizeText(
      keys
      .map((key) => {
        const value = (row as Record<string, unknown>)[key];
        return flattenValue(value);
      })
      .join(" "),
    );
  }

  return normalizeText(flattenValue(row));
}

/**
 * Natural compare of two values. Handles strings and numbers.
 */
function naturalCompare(a: string | number, b: string | number, order: "asc" | "desc"): number {
  const multiplier = order === "asc" ? 1 : -1;

  if (typeof a === "number" && typeof b === "number") {
    return (a - b) * multiplier;
  }

  const aStr = normalizeText(String(a));
  const bStr = normalizeText(String(b));

  // Push empty/null values to the end regardless of sort order
  if (aStr === "" && bStr === "") return 0;
  if (aStr === "") return multiplier;
  if (bStr === "") return -multiplier;

  return STRING_COLLATOR.compare(aStr, bStr) * multiplier;
}

/**
 * Full pipeline: search -> filter -> sort.
 */
export function processTableRows<T, Field extends string>(opts: {
  rows: T[];
  searchQuery: string;
  searchIndex: Map<string, string>;
  filterPredicate: ((row: T) => boolean) | null;
  sortConfigs: SortConfig<Field>[];
  sortDefs: Map<string, ColumnSortDef<T, Field>>;
  getId?: (row: T) => string | number;
}): TableQueryEngineResult<T> {
  const { rows, searchQuery, searchIndex, filterPredicate, sortConfigs, sortDefs, getId } = opts;
  const totalCount = rows.length;

  // Step 1: Search
  let result = rows;
  if (searchQuery.trim()) {
    const query = normalizeText(searchQuery.trim());
    result = rows.filter((row) => {
      const id = getId ? String(getId(row)) : (String((row as Record<string, unknown>).id ?? (row as Record<string, unknown>).rowId));
      const index = searchIndex.get(id);
      return index ? index.includes(query) : false;
    });
  }

  // Step 2: Filter
  const filteredCount = result.length;
  if (filterPredicate) {
    result = result.filter(filterPredicate);
  }

  // Step 3: Sort (stable, multi-key by priority order)
  if (sortConfigs.length > 0) {
    result = [...result].sort((a, b) => {
      for (const config of sortConfigs) {
        const def = sortDefs.get(config.field);
        if (!def) continue;

        const cmp = def.compare
          ? def.compare(a, b, config.order)
          : naturalCompare(def.getSortValue(a), def.getSortValue(b), config.order);

        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }

  return { rows: result, totalCount, filteredCount };
}
