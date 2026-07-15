// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useSortableColumnFilters } from "./useSortableColumnFilters";

type Field = "name" | "status";

interface HarnessResult {
  bindColumn: ReturnType<typeof useSortableColumnFilters<Field>>["bindColumn"];
  buildFilterPredicate: ReturnType<typeof useSortableColumnFilters<Field>>["buildFilterPredicate"];
  onColumnSearchChange: ReturnType<typeof useSortableColumnFilters<Field>>["onColumnSearchChange"];
  onColumnFilterChange: ReturnType<typeof useSortableColumnFilters<Field>>["onColumnFilterChange"];
}

function mountHarness() {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  const state: { current: HarnessResult | null } = { current: null };

  function Harness() {
    const hook = useSortableColumnFilters<Field>();
    state.current = {
      bindColumn: hook.bindColumn,
      buildFilterPredicate: hook.buildFilterPredicate,
      onColumnSearchChange: hook.onColumnSearchChange,
      onColumnFilterChange: hook.onColumnFilterChange,
    };
    return null;
  }

  act(() => {
    root.render(<Harness />);
  });

  const getResult = () => {
    if (!state.current) {
      throw new Error("Hook result was not captured");
    }
    return state.current;
  };

  return {
    getResult,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useSortableColumnFilters", () => {
  it("bindColumn returns empty defaults for an unbound field", () => {
    const harness = mountHarness();
    const { bindColumn } = harness.getResult();
    const bound = bindColumn("name");

    expect(bound.searchQuery).toBe("");
    expect(bound.selectedValues).toEqual(new Set());
    expect(typeof bound.onSearchChange).toBe("function");
    expect(typeof bound.onFilterChange).toBe("function");

    harness.unmount();
  });

  it("bindColumn reflects search and filter state for the field", () => {
    const harness = mountHarness();

    act(() => {
      const { onColumnSearchChange, onColumnFilterChange } = harness.getResult();
      onColumnSearchChange("name", "abc");
      onColumnFilterChange("name", new Set(["x"]));
    });

    const bound = harness.getResult().bindColumn("name");

    expect(bound.searchQuery).toBe("abc");
    expect(bound.selectedValues).toEqual(new Set(["x"]));

    harness.unmount();
  });

  it("buildFilterPredicate can omit fields from predicate", () => {
    const harness = mountHarness();

    act(() => {
      const { onColumnSearchChange, onColumnFilterChange } = harness.getResult();
      onColumnSearchChange("name", "abc");
      onColumnFilterChange("status", new Set(["open"]));
    });

    type Row = { name: string; status: string };
    const predicate = harness.getResult().buildFilterPredicate<Row>(
      (row, field) => (field === "name" ? row.name : row.status),
      ["status"],
    );

    expect(predicate).not.toBeNull();
    expect(predicate!({ name: "abc", status: "closed" })).toBe(true);
    expect(predicate!({ name: "xyz", status: "closed" })).toBe(false);

    harness.unmount();
  });
});