import { useCallback, useMemo, useState } from "react";

import type { SortConfig } from "@/shared/hooks/useTableQueryEngine";
import { nextMultiSortConfigs } from "@/shared/lib/multiSort";

import { useSortableColumnFilters } from "./useSortableColumnFilters";

export interface UseFilterableTableOptions {
  extraHasActive?: boolean;
  onExtraReset?: () => void;
}

export function useFilterableTable<Field extends string, SortField extends string = Field>(
  options?: UseFilterableTableOptions,
) {
  const columnFilters = useSortableColumnFilters<Field>();
  const [sortConfigs, setSortConfigs] = useState<SortConfig<SortField>[]>([]);

  const handleSort = useCallback((field: SortField) => {
    setSortConfigs((prev) => nextMultiSortConfigs(prev, field));
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      columnFilters.hasActiveColumnFilters ||
      sortConfigs.length > 0 ||
      (options?.extraHasActive ?? false),
    [columnFilters.hasActiveColumnFilters, sortConfigs.length, options?.extraHasActive],
  );

  const resetAll = useCallback(() => {
    columnFilters.resetColumnFilters();
    setSortConfigs([]);
    options?.onExtraReset?.();
  }, [columnFilters.resetColumnFilters, options?.onExtraReset]);

  return {
    ...columnFilters,
    sortConfigs,
    setSortConfigs,
    handleSort,
    hasActiveFilters,
    resetAll,
  };
}