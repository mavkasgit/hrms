import { describe, expect, it } from "vitest";

import { buildActiveFilterSummary } from "./buildActiveFilterSummary";

describe("buildActiveFilterSummary", () => {
  it("counts panel filters, search and sort", () => {
    const summary = buildActiveFilterSummary(
      { status: "active", has_route: "all" },
      "abc",
      2,
    );

    expect(summary.count).toBe(3);
    expect(summary.labels).toEqual(["Поиск", "Сортировка: 2", "Статус"]);
  });

  it("includes column filters and column search queries", () => {
    const summary = buildActiveFilterSummary(
      {},
      "",
      0,
      {
        columnFilters: { sku: new Set(["A-1"]) },
        columnSearchQueries: { name: "bolt" },
        columnLabels: { sku: "SKU", name: "Наименование" },
      },
    );

    expect(summary.count).toBe(2);
    expect(summary.labels).toEqual(["Колонка: SKU", "Поиск: Наименование"]);
  });
});