import { useCallback, useMemo, useState } from "react";
import {
  buildColumnFilterPredicate,
  hasActiveColumnFilters,
} from "@/shared/lib/columnFilterSearch";

export function useSortableColumnFilters<Field extends string>() {
  const [columnFilters, setColumnFilters] = useState<Partial<Record<Field, Set<string>>>>({});
  const [columnSearchQueries, setColumnSearchQueries] = useState<Partial<Record<Field, string>>>({});

  const onColumnFilterChange = useCallback((field: Field, selected: Set<string>) => {
    setColumnFilters((prev) => ({ ...prev, [field]: selected }));
  }, []);

  const onColumnSearchChange = useCallback((field: Field, query: string) => {
    setColumnSearchQueries((prev) => ({ ...prev, [field]: query }));
  }, []);

  const resetColumnFilters = useCallback(() => {
    setColumnFilters({});
    setColumnSearchQueries({});
  }, []);

  const hasActiveColumnFiltersState = useMemo(
    () => hasActiveColumnFilters(columnFilters, columnSearchQueries),
    [columnFilters, columnSearchQueries],
  );

  const buildFilterPredicate = useCallback(
    <T>(getCellValue: (row: T, field: Field) => string, omit: Field[] = []) => {
      const omitted = new Set(omit);
      const filters = Object.fromEntries(
        Object.entries(columnFilters).filter(([key]) => !omitted.has(key as Field)),
      ) as Partial<Record<Field, Set<string>>>;
      const searches = Object.fromEntries(
        Object.entries(columnSearchQueries).filter(([key]) => !omitted.has(key as Field)),
      ) as Partial<Record<Field, string>>;
      return buildColumnFilterPredicate({ columnFilters: filters, columnSearchQueries: searches, getCellValue });
    },
    [columnFilters, columnSearchQueries],
  );

  const bindColumn = useCallback(
    (field: Field) => ({
      searchQuery: columnSearchQueries[field] ?? "",
      selectedValues: columnFilters[field] ?? new Set<string>(),
      onSearchChange: onColumnSearchChange,
      onFilterChange: onColumnFilterChange,
    }),
    [columnFilters, columnSearchQueries, onColumnSearchChange, onColumnFilterChange],
  );

  return {
    columnFilters,
    columnSearchQueries,
    onColumnFilterChange,
    onColumnSearchChange,
    bindColumn,
    buildFilterPredicate,
    hasActiveColumnFilters: hasActiveColumnFiltersState,
    resetColumnFilters,
    setColumnFilters,
    setColumnSearchQueries,
  };
}