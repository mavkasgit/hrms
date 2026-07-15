export interface ActiveFilterSummary {
  count: number;
  labels: string[];
}

const FILTER_SHORT_LABELS: Record<string, string> = {
  status: "Статус",
  validation_status: "Валидация",
  has_route: "Маршрут",
  has_errors: "Ошибки",
  has_warnings: "Предупр.",
  has_duplicates: "Дубликаты",
};

export interface BuildActiveFilterSummaryOptions {
  columnFilters?: Partial<Record<string, Set<string>>>;
  columnSearchQueries?: Partial<Record<string, string>>;
  columnLabels?: Record<string, string>;
}

export function buildActiveFilterSummary(
  filters: object,
  searchQuery: string,
  sortCount: number,
  options?: BuildActiveFilterSummaryOptions,
): ActiveFilterSummary {
  const labels: string[] = [];

  if (searchQuery.trim().length > 0) {
    labels.push("Поиск");
  }

  if (sortCount > 0) {
    labels.push(`Сортировка: ${sortCount}`);
  }

  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value !== "all") {
      const shortLabel = FILTER_SHORT_LABELS[key] ?? key;
      labels.push(shortLabel);
    }
  }

  const columnLabels = options?.columnLabels ?? {};
  const columnFilters = options?.columnFilters ?? {};
  const columnSearchQueries = options?.columnSearchQueries ?? {};

  for (const [field, selected] of Object.entries(columnFilters)) {
    if (selected && selected.size > 0) {
      const label = columnLabels[field] ?? field;
      labels.push(`Колонка: ${label}`);
    }
  }

  for (const [field, query] of Object.entries(columnSearchQueries)) {
    if (query && query.trim()) {
      const label = columnLabels[field] ?? field;
      labels.push(`Поиск: ${label}`);
    }
  }

  return { count: labels.length, labels };
}