import { describe, expect, it } from "vitest";
import {
  buildColumnFilterPredicate,
  matchesPartialSearch,
  rankPartialSearchMatch,
  sortByPartialSearchMatch,
} from "./columnFilterSearch";

describe("columnFilterSearch", () => {
  it("matchesPartialSearch is case-insensitive and normalizes ё/е", () => {
    expect(matchesPartialSearch("ЮП-460", "юп")).toBe(true);
    expect(matchesPartialSearch("Ёжик", "еж")).toBe(true);
    expect(matchesPartialSearch("ABC-100", "юп")).toBe(false);
  });

  it("rankPartialSearchMatch prefers startsWith over contains", () => {
    expect(rankPartialSearchMatch("ЮП-460", "юп")).toBe(0);
    expect(rankPartialSearchMatch("Деталь ЮП-12", "юп")).toBeGreaterThan(0);
    expect(rankPartialSearchMatch("ABC", "юп")).toBe(Number.POSITIVE_INFINITY);
  });

  it("sortByPartialSearchMatch orders by relevance", () => {
    const sorted = sortByPartialSearchMatch(
      ["Деталь ЮП-12", "ЮП-460", "ABC-100"],
      "юп",
      (v) => v,
    );
    expect(sorted).toEqual(["ЮП-460", "Деталь ЮП-12"]);
  });

  it("buildColumnFilterPredicate uses partial search when query is set", () => {
    type Row = { sku: string };
    const predicate = buildColumnFilterPredicate<Row, "sku">({
      columnFilters: {},
      columnSearchQueries: { sku: "юп" },
      getCellValue: (row, field) => (field === "sku" ? row.sku : ""),
    });

    expect(predicate).not.toBeNull();
    expect(predicate!({ sku: "ЮП-460" })).toBe(true);
    expect(predicate!({ sku: "ABC-100" })).toBe(false);
  });

  it("buildColumnFilterPredicate falls back to Set when search is empty", () => {
    type Row = { sku: string };
    const predicate = buildColumnFilterPredicate<Row, "sku">({
      columnFilters: { sku: new Set(["ЮП-460"]) },
      columnSearchQueries: {},
      getCellValue: (row, field) => (field === "sku" ? row.sku : ""),
    });

    expect(predicate!({ sku: "ЮП-460" })).toBe(true);
    expect(predicate!({ sku: "ABC-100" })).toBe(false);
  });
});