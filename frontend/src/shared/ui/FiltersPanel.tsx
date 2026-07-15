import { Search, X, Eye, EyeOff, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { cn } from "@/shared/utils/cn";

function renderToggleField(field: Extract<FiltersPanelField, { kind: "toggle" }>) {
  return (
    <Button
      variant={field.checked ? "default" : "outline"}
      size="sm"
      className="h-9 text-xs whitespace-nowrap"
      onClick={() => field.onChange(!field.checked)}
    >
      {field.checked ? (
        <Eye className="h-3.5 w-3.5 mr-1" />
      ) : (
        <EyeOff className="h-3.5 w-3.5 mr-1" />
      )}
      {field.label}
      {field.badgeCount != null && field.badgeCount > 0 && (
        <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold px-1 ${
          field.checked
            ? "bg-white/25 text-white"
            : "bg-primary/20 text-primary"
        }`}>
          {field.badgeCount}
        </span>
      )}
    </Button>
  );
}

function renderBulkField(field: Extract<FiltersPanelField, { kind: "bulk" }>) {
  return (
    <Button
      variant={field.enabled ? "default" : "outline"}
      size="sm"
      className="h-9 text-xs whitespace-nowrap"
      onClick={() => field.onChange(!field.enabled)}
    >
      <ListChecks className="h-3.5 w-3.5 mr-1" />
      {field.label ?? "Групповые операции"}
    </Button>
  );
}

function renderBulkWithSelectAll(
  field: Extract<FiltersPanelField, { kind: "bulk" }>,
  onSelectAll?: (activateBulk: boolean) => void,
  totalRowCount?: number,
) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant={field.enabled ? "default" : "outline"}
        size="sm"
        className="h-9 text-xs whitespace-nowrap"
        onClick={() => field.onChange(!field.enabled)}
      >
        <ListChecks className="h-3.5 w-3.5 mr-1" />
        {field.label ?? "Групповые операции"}
      </Button>
      {onSelectAll && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs whitespace-nowrap"
          onClick={() => onSelectAll(true)}
        >
          Выделить все{totalRowCount != null && totalRowCount > 0 ? ` (${totalRowCount})` : ""}
        </Button>
      )}
    </div>
  );
}

export interface FiltersPanelOption {
  value: string;
  label: string;
}

export type FiltersPanelField =
  | {
      kind: "search";
      key: string;
      placeholder?: string;
      value: string;
      onChange: (value: string) => void;
      layoutSpan?: string;
    }
  | {
      kind: "select";
      key: string;
      placeholder?: string;
      value: string;
      options: FiltersPanelOption[];
      onChange: (value: string) => void;
      layoutSpan?: string;
    }
  | {
      kind: "toggle";
      key: string;
      label: string;
      checked: boolean;
      onChange: (checked: boolean) => void;
      badgeCount?: number;
      layoutSpan?: string;
    }
  | {
      kind: "bulk";
      key: string;
      enabled: boolean;
      onChange: (enabled: boolean) => void;
      label?: string;
      layoutSpan?: string;
    };

export interface FiltersPanelProps {
  fields: FiltersPanelField[];
  onReset?: () => void;
  hasActiveFilters?: boolean;
  activeSummary?: {
    count: number;
    labels?: string[];
  };
  actions?: ReactNode;
  className?: string;
  /** When true, renders all fields, actions, and summary in a single flex row instead of a grid. */
  compact?: boolean;
  /** When provided, renders a "Выделить все" button next to bulk toggle. Callback receives true to activate bulk mode. */
  onSelectAll?: (activateBulk: boolean) => void;
  /** Total number of rows available for selection — shown in "Выделить все ({count})" button. */
  totalRowCount?: number;
}

export function FiltersPanel({
  fields,
  onReset,
  hasActiveFilters,
  activeSummary,
  actions,
  className,
  compact,
  onSelectAll,
  totalRowCount,
}: FiltersPanelProps) {
  const summaryCount = activeSummary?.count ?? 0;
  const summaryLabels = activeSummary?.labels ?? [];
  const showReset = onReset != null && hasActiveFilters != null;

  return (
    <div className={cn("rounded-lg border bg-card/60 p-3", className)}>
      {compact ? (
        <div className="flex items-center gap-2 flex-wrap">
          {fields.map((field) => (
            <div key={field.key} className={field.layoutSpan ?? "min-w-[160px] flex-shrink-0"}>
              {field.kind === "toggle" ? (
                renderToggleField(field)
              ) : field.kind === "bulk" ? (
                onSelectAll ? renderBulkWithSelectAll(field, onSelectAll, totalRowCount) : renderBulkField(field)
              ) : field.kind === "search" ? (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={field.placeholder ?? "Поиск..."}
                    className="h-9 pl-9 w-full"
                  />
                </div>
              ) : (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder={field.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((option) => (
                      <SelectItem key={`${field.key}:${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {actions}
          </div>

          {summaryCount > 0 && (
            <div className="flex items-center gap-1.5 flex-nowrap flex-shrink-0">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Активных фильтров: {summaryCount}</span>
              {summaryLabels.length > 0 &&
                summaryLabels.map((label, i) => (
                  <span key={i} className="px-2 py-0.5 bg-background border rounded text-xs whitespace-nowrap">
                    {label}
                  </span>
                ))}
            </div>
          )}

          {showReset && (
            <Button
              variant={hasActiveFilters ? "default" : "ghost"}
              size="sm"
              className="h-8 text-sm flex-shrink-0"
              onClick={onReset}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Сбросить
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            {fields.map((field) => (
              <div key={field.key} className={field.layoutSpan}>
                {field.kind === "toggle" ? (
                  renderToggleField(field)
                ) : field.kind === "bulk" ? (
                  onSelectAll ? renderBulkWithSelectAll(field, onSelectAll, totalRowCount) : renderBulkField(field)
                ) : field.kind === "search" ? (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder={field.placeholder ?? "Поиск..."}
                      className="h-9 pl-9"
                    />
                  </div>
                ) : (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((option) => (
                        <SelectItem key={`${field.key}:${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">{actions}</div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {summaryCount > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">Активных фильтров: {summaryCount}</span>
                  {summaryLabels.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {summaryLabels.map((label, i) => (
                        <span key={i} className="px-2 py-0.5 bg-background border rounded text-xs">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
              {showReset && (
                <Button
                  variant={hasActiveFilters ? "default" : "ghost"}
                  size="sm"
                  className="h-8 text-sm"
                  onClick={onReset}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Сбросить фильтры
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}