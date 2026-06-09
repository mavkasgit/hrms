import type { SortConfig } from "../hooks/useTableQueryEngine";

/**
 * Click cycle for multi-sort: none → desc → asc → removed.
 */
export function nextMultiSortConfigs<Field extends string>(
  prev: SortConfig<Field>[],
  field: Field,
  defaultOrder: "asc" | "desc" = "asc",
): SortConfig<Field>[] {
  const existing = prev.findIndex((s) => s.field === field);
  if (existing === -1) {
    // Первый клик — дефолтное направление сортировки
    return [...prev, { field, order: defaultOrder }];
  }

  const next = [...prev];
  const currentOrder = next[existing].order;

  if (currentOrder === defaultOrder) {
    // Второй клик — противоположное направление
    next[existing] = { field, order: defaultOrder === "asc" ? "desc" : "asc" };
  } else {
    // Третий клик — сброс
    next.splice(existing, 1);
  }
  return next;
}
