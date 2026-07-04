import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/shared/utils/cn";

export interface TablePanelHeaderProps {
  title: ReactNode;
  countLabel?: string;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  className?: string;
}

export function TablePanelHeader({
  title,
  countLabel,
  expanded,
  onToggleExpanded,
  className,
}: TablePanelHeaderProps) {
  const collapsible = onToggleExpanded != null;

  return (
    <div className={cn("flex items-center justify-between border-b pb-2 gap-2", className)}>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none min-w-0"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <h3 className="text-sm font-semibold truncate">
            {title}
            {countLabel ? ` ${countLabel}` : null}
          </h3>
        </button>
      ) : (
        <h3 className="text-sm font-semibold min-w-0 truncate">
          {title}
          {countLabel ? ` ${countLabel}` : null}
        </h3>
      )}
    </div>
  );
}