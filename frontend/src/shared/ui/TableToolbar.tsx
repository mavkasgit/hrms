import React from "react";
import { Search } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/shared/utils/cn";

export interface TableToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Toolbar with search input and slot for custom filter controls. */
export function TableToolbar({
  searchQuery,
  onSearchChange,
  placeholder = "Поиск...",
  children,
  className,
}: TableToolbarProps) {
  return (
    <div className={cn("flex items-center gap-3 mb-3 flex-wrap", className)}>
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 h-9 text-sm"
        />
      </div>
      {children}
    </div>
  );
}