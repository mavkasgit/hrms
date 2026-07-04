import React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { SortConfig } from "../hooks/useTableQueryEngine";

export interface SortableHeaderProps<Field extends string> {
  field: Field;
  currentSorts: SortConfig<Field>[];
  onSortChange: (field: Field) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Clickable table header that supports multi-sort.
 * Click cycle: no sort -> asc (priority N) -> desc (priority N) -> removed.
 */
export function SortableHeader<Field extends string>({
  field,
  currentSorts,
  onSortChange,
  children,
  className,
}: SortableHeaderProps<Field>) {
  const activeSort = currentSorts.find((s) => s.field === field);
  const priority = activeSort ? currentSorts.indexOf(activeSort) + 1 : null;

  const icon = activeSort?.order === "asc" ? (
    <ArrowUp size={14} />
  ) : activeSort?.order === "desc" ? (
    <ArrowDown size={14} />
  ) : (
    <ArrowUpDown size={14} className="opacity-45" />
  );

  return (
    <button
      type="button"
      onClick={() => onSortChange(field)}
      aria-pressed={activeSort ? "true" : "false"}
      aria-label={`Сортировка по ${String(field)}${activeSort ? ` (${activeSort.order})` : ""}`}
      data-sort-order={activeSort?.order ?? "none"}
      data-sort-priority={priority ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 text-left font-medium text-xs tracking-normal text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none",
        activeSort && "text-foreground",
        className,
      )}
    >
      <span>{children}</span>
      <span className="inline-flex items-center gap-0.5 shrink-0">
        {icon}
        {priority !== null && (
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {priority}
          </span>
        )}
      </span>
    </button>
  );
}
