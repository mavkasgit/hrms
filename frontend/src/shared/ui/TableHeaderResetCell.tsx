import { X } from "lucide-react";

import { cn } from "@/shared/utils/cn";

export interface TableHeaderResetCellProps {
  hasActiveFilters: boolean;
  onReset: () => void;
  className?: string;
}

function ResetIconButton({
  onClick,
  hasActiveFilters,
  className,
}: {
  onClick: () => void;
  hasActiveFilters: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        hasActiveFilters
          ? "bg-black text-white hover:bg-black/90 hover:text-white dark:bg-foreground dark:text-background dark:hover:bg-foreground/90 dark:hover:text-background"
          : "text-muted-foreground/45 hover:bg-black/[0.04] hover:text-muted-foreground dark:hover:bg-white/[0.06]",
        className,
      )}
      onClick={onClick}
      title="Сбросить фильтры"
      aria-label="Сбросить фильтры"
    >
      <X className="h-3 w-3" strokeWidth={hasActiveFilters ? 2.5 : 1.75} />
    </button>
  );
}

/** Иконка сброса фильтров для узкой колонки в правом верхнем углу таблицы. */
export function TableHeaderResetCell({
  hasActiveFilters,
  onReset,
  className,
}: TableHeaderResetCellProps) {
  return (
    <div className={cn("flex justify-end", className)}>
      <ResetIconButton hasActiveFilters={hasActiveFilters} onClick={onReset} />
    </div>
  );
}