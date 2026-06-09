import React, { useState, useMemo } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Input } from "./input";
import { Button } from "./button";
import type { SortConfig } from "../hooks/useTableQueryEngine";

export interface SortableFilterHeaderProps<Field extends string> {
  field: Field;
  label: React.ReactNode;
  currentSorts: SortConfig<Field>[];
  onSortChange: (field: Field) => void;
  values: string[];
  selectedValues: Set<string>;
  onFilterChange: (field: Field, selected: Set<string>) => void;
  valueLabel?: (value: string) => string;
}

/**
 * Unified column header with sort + filter:
 * - Click text → filter popover with clickable rows (filled when selected)
 * - Click sort icon → cycle sort (none → asc → desc)
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
}: SortableFilterHeaderProps<Field>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);

  const activeSort = currentSorts.find((s) => s.field === field);
  const sortPriority = activeSort ? currentSorts.indexOf(activeSort) + 1 : null;

  const hasFilter = selectedValues.size > 0;

  const displayLabel = (v: string) => (valueLabel ? valueLabel(v) : v);

  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) return values;
    const q = searchQuery.trim().toLowerCase();
    return values.filter((v) => displayLabel(v).toLowerCase().includes(q));
  }, [values, searchQuery, valueLabel, displayLabel]);

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
    onFilterChange(field, new Set(values));
  };

  const clearAll = () => {
    onFilterChange(field, new Set());
  };

  const sortIcon =
    activeSort?.order === "asc" ? (
      <ArrowUp size={14} className="shrink-0" />
    ) : activeSort?.order === "desc" ? (
      <ArrowDown size={14} className="shrink-0" />
    ) : (
      <ArrowUpDown size={14} className="shrink-0 opacity-45" />
    );

  return (
    <div className="inline-flex items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-left font-medium text-xs tracking-normal text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none",
              activeSort && "text-foreground",
            )}
          >
            <span className="truncate">{label}</span>
            <span className="shrink-0">
              {hasFilter && (
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                  {selectedValues.size}
                </span>
              )}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-2 bg-popover text-popover-foreground border shadow-md"
          align="start"
          side="bottom"
          onCloseAutoFocus={() => setSearchQuery("")}
        >
          <div className="space-y-2">
            <Input
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-xs"
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
            {hasFilter && (
              <div className="flex justify-end gap-1 pt-1 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={clearAll}
                >
                  <X className="h-3 w-3 mr-1" />
                  Сброс
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Sort button */}
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
