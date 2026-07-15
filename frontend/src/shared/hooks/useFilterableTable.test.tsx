// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useFilterableTable } from "./useFilterableTable";

type Field = "name" | "status";

interface HarnessResult {
  hasActiveFilters: boolean;
  sortConfigs: ReturnType<typeof useFilterableTable<Field>>["sortConfigs"];
  handleSort: ReturnType<typeof useFilterableTable<Field>>["handleSort"];
  onColumnSearchChange: ReturnType<typeof useFilterableTable<Field>>["onColumnSearchChange"];
  resetAll: ReturnType<typeof useFilterableTable<Field>>["resetAll"];
}

function mountHarness(options?: Parameters<typeof useFilterableTable<Field>>[0]) {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  const state: { current: HarnessResult | null } = { current: null };

  function Harness() {
    const hook = useFilterableTable<Field>(options);
    state.current = {
      hasActiveFilters: hook.hasActiveFilters,
      sortConfigs: hook.sortConfigs,
      handleSort: hook.handleSort,
      onColumnSearchChange: hook.onColumnSearchChange,
      resetAll: hook.resetAll,
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

describe("useFilterableTable", () => {
  it("starts with no active filters and empty sort configs", () => {
    const harness = mountHarness();
    const result = harness.getResult();

    expect(result.hasActiveFilters).toBe(false);
    expect(result.sortConfigs).toEqual([]);

    harness.unmount();
  });

  it("marks filters active when column search is set", () => {
    const harness = mountHarness();

    act(() => {
      harness.getResult().onColumnSearchChange("name", "query");
    });

    expect(harness.getResult().hasActiveFilters).toBe(true);

    harness.unmount();
  });

  it("handleSort cycles none -> asc -> desc -> none (HRMS multiSort default)", () => {
    const harness = mountHarness();

    act(() => {
      harness.getResult().handleSort("name");
    });
    expect(harness.getResult().sortConfigs).toEqual([{ field: "name", order: "asc" }]);
    expect(harness.getResult().hasActiveFilters).toBe(true);

    act(() => {
      harness.getResult().handleSort("name");
    });
    expect(harness.getResult().sortConfigs).toEqual([{ field: "name", order: "desc" }]);

    act(() => {
      harness.getResult().handleSort("name");
    });
    expect(harness.getResult().sortConfigs).toEqual([]);
    expect(harness.getResult().hasActiveFilters).toBe(false);

    harness.unmount();
  });

  it("resetAll clears column filters, sort configs, and calls onExtraReset", () => {
    const onExtraReset = vi.fn();
    const harness = mountHarness({ onExtraReset });

    act(() => {
      const result = harness.getResult();
      result.onColumnSearchChange("name", "query");
      result.handleSort("status");
    });

    expect(harness.getResult().hasActiveFilters).toBe(true);
    expect(harness.getResult().sortConfigs.length).toBeGreaterThan(0);

    act(() => {
      harness.getResult().resetAll();
    });

    expect(harness.getResult().hasActiveFilters).toBe(false);
    expect(harness.getResult().sortConfigs).toEqual([]);
    expect(onExtraReset).toHaveBeenCalledOnce();

    harness.unmount();
  });

  it("includes extraHasActive in hasActiveFilters", () => {
    const harness = mountHarness({ extraHasActive: true });

    expect(harness.getResult().hasActiveFilters).toBe(true);

    harness.unmount();
  });
});