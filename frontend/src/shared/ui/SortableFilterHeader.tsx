import React, { useState, useMemo, useCallback } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Search, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Input } from "./input";
import { Button } from "./button";
import type { SortConfig } from "../hooks/useTableQueryEngine";
import { sortByPartialSearchMatch } from "@/shared/lib/columnFilterSearch";

export interface SortableFilterHeaderProps<Field extends string> {
  field: Field;
  label: React.ReactNode;
  currentSorts: SortConfig<Field>[];
  onSortChange: (field: Field) => void;
  values: string[];
  selectedValues: Set<string>;
  onFilterChange: (field: Field, selected: Set<string>) => void;
  valueLabel?: (value: string) => string;
  /** Controlled search query for live table filtering */
  searchQuery?: string;
  onSearchChange?: (field: Field, query: string) => void;
}

/**
 * Unified column header with sort + filter:
 * - Click text → filter popover with clickable rows (filled when selected)
 * - Click sort icon → cycle sort (none → asc → desc)
 * - Search in popover: partial match + relevance sort; live table filter via onSearchChange
 */
export function SortableFilterHeader<Field extends string>({
  field,
  label,
  currentSorts,
  onSortChange,
  values,
  selectedValues,
  onFilterChange,
  valueLabel,
  searchQuery: controlledSearchQuery,
  onSearchChange,
}: SortableFilterHeaderProps<Field>) {
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [open, setOpen] = useState(false);

  const isSearchControlled = controlledSearchQuery !== undefined;
  const searchQuery = isSearchControlled ? controlledSearchQuery : internalSearchQuery;

  const setSearchQuery = useCallback(
    (query: string) => {
      if (isSearchControlled) {
        onSearchChange?.(field, query);
      } else {
        setInternalSearchQuery(query);
        onSearchChange?.(field, query);
      }
    },
    [field, isSearchControlled, onSearchChange],
  );

  const activeSort = currentSorts.find((s) => s.field === field);
  const sortPriority = activeSort ? currentSorts.indexOf(activeSort) + 1 : null;

  const hasSetFilter = selectedValues.size > 0;
  const hasSearchFilter = searchQuery.trim().length > 0;
  const hasFilter = hasSetFilter || hasSearchFilter;

  const displayLabel = useCallback(
    (v: string) => (valueLabel ? valueLabel(v) : v),
    [valueLabel],
  );

  const filteredValues = useMemo(
    () => sortByPartialSearchMatch(values, searchQuery, displayLabel),
    [values, searchQuery, displayLabel],
  );

  const toggleOne = (value: string) => {
    const newSelected = new Set(selectedValues);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    onFilterChange(field, newSelected);
  };

  const selectAll = () => {
    onFilterChange(field, new Set(filteredValues));
  };

  const clearAll = () => {
    onFilterChange(field, new Set());
    setSearchQuery("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const sortIcon =
    activeSort?.order === "asc" ? (
      <ArrowUp size={14} className="shrink-0" />
    ) : activeSort?.order === "desc" ? (
      <ArrowDown size={14} className="shrink-0" />
    ) : (
      <ArrowUpDown size={14} className="shrink-0 opacity-45" />
    );

  const filterBadge = hasSearchFilter ? (
    <Search className="h-2.5 w-2.5" aria-hidden />
  ) : hasSetFilter ? (
    String(selectedValues.size)
  ) : null;

  return (
    <div className="inline-flex items-center gap-1 max-w-full">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-left font-medium text-xs tracking-normal text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none min-w-0",
              activeSort && "text-foreground",
            )}
          >
            <span className="truncate">{label}</span>
            <span className="shrink-0">
              {hasFilter && filterBadge && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-3.5 min-w-[14px] px-0.5 rounded-full text-[8px] font-bold",
                    hasSearchFilter
                      ? "bg-primary/15 text-primary"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {filterBadge}
                </span>
              )}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-2 bg-popover text-popover-foreground border shadow-md"
          align="start"
          side="bottom"
        >
          <div className="space-y-2">
            <Input
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-primary hover:underline"
              >
                Выбрать все
              </button>
            </div>
            <div className="max-h-52 overflow-y-auto rounded border">
              {filteredValues.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-2">Нет значений</p>
              )}
              {filteredValues.map((value) => {
                const isSelected = selectedValues.has(value);
                return (
                  <div
                    key={value}
                    className={cn(
                      "px-2 py-1 text-xs cursor-pointer transition-colors truncate",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-foreground",
                    )}
                    onClick={() => toggleOne(value)}
                  >
                    {displayLabel(value)}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-1 pt-1 border-t">
              {hasFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={clearAll}
                >
                  <X className="h-3 w-3 mr-1" />
                  Сбросить колонку
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setOpen(false)}
              >
                Готово
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={() => onSortChange(field)}
        aria-pressed={activeSort ? "true" : "false"}
        aria-label={`Сортировка по ${String(field)}${activeSort ? ` (${activeSort.order})` : ""}`}
        data-sort-order={activeSort?.order ?? "none"}
        data-sort-priority={sortPriority ?? undefined}
        className={cn(
          "inline-flex items-center shrink-0 text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
          activeSort && "text-foreground",
        )}
      >
        {sortIcon}
        {sortPriority !== null && (
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-[10px] font-semibold text-primary ml-0.5">
            {sortPriority}
          </span>
        )}
      </button>
    </div>
  );
}