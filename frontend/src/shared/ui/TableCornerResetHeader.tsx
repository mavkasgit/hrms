import type { ElementType } from "react";

import { cn } from "@/shared/utils/cn";
import { TableHeaderResetCell } from "./TableHeaderResetCell";

/** Узкая колонка сброса в правом верхнем углу таблицы. */
export const TABLE_CORNER_RESET_TH_CLASS = "w-10 min-w-[2.5rem] p-1 text-right align-middle";
export const TABLE_CORNER_RESET_TD_CLASS = "w-10 min-w-[2.5rem] p-1";

export interface TableCornerResetHeaderProps {
  hasActiveFilters: boolean;
  onReset: () => void;
  className?: string;
  /** Для shadcn TableHead или div-grid шапок передайте компонент. */
  as?: ElementType;
}

export function TableCornerResetHeader({
  hasActiveFilters,
  onReset,
  className,
  as: Tag = "th",
}: TableCornerResetHeaderProps) {
  return (
    <Tag className={cn(TABLE_CORNER_RESET_TH_CLASS, className)}>
      <TableHeaderResetCell hasActiveFilters={hasActiveFilters} onReset={onReset} />
    </Tag>
  );
}

export function TableCornerResetCell({
  className,
  as: Tag = "td",
}: {
  className?: string;
  as?: ElementType;
}) {
  return <Tag className={cn(TABLE_CORNER_RESET_TD_CLASS, className)} />;
}