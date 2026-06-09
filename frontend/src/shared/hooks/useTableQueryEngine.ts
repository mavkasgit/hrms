import { useMemo } from "react";
import {
  buildSearchIndex,
  processTableRows,
  SortConfig,
  ColumnSortDef,
  TableQueryEngineResult,
} from "../lib/tableQueryEngine";

export interface UseTableQueryEngineOptions<T, Field extends string> {
  rows: T[];
  getId: (row: T) => string | number;
  searchQuery: string;
  searchKeys?: string[];
  searchIndexVersion?: string | number;
  filterPredicate: ((row: T) => boolean) | null;
  sortConfigs: SortConfig<Field>[];
  sortDefs: ColumnSortDef<T, Field>[];
}

/**
 * React hook wrapping the table query engine.
 * Memoizes search index and processes rows through search -> filter -> sort pipeline.
 */
export function useTableQueryEngine<T, Field extends string>(
  opts: UseTableQueryEngineOptions<T, Field>,
): TableQueryEngineResult<T> {
  const {
    rows,
    getId,
    searchQuery,
    searchKeys,
    searchIndexVersion,
    filterPredicate,
    sortConfigs,
    sortDefs,
  } = opts;

  // Build search index map: rowId -> searchable string
  // Rebuild only when rows reference changes
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const id = String(getId(row));
      map.set(id, buildSearchIndex(row, searchKeys));
    }
    return map;
  }, [rows, getId, searchKeys, searchIndexVersion]);

  // Build sortDefs map for O(1) lookup during sort
  const sortDefsMap = useMemo(() => {
    const map = new Map<string, ColumnSortDef<T, Field>>();
    for (const def of sortDefs) {
      map.set(def.field, def);
    }
    return map;
  }, [sortDefs]);

  // Run the pipeline
  return useMemo(
    () =>
      processTableRows<T, Field>({
        rows,
        searchQuery,
        searchIndex,
        filterPredicate,
        sortConfigs,
        sortDefs: sortDefsMap,
        getId,
      }),
    [rows, searchQuery, searchIndex, filterPredicate, sortConfigs, sortDefsMap, getId],
  );
}

export type { SortConfig, ColumnSortDef, TableQueryEngineResult };
export { buildSearchIndex, processTableRows } from "../lib/tableQueryEngine";
