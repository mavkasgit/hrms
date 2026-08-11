import { describe, expect, it, vi } from "vitest"
import type { QueryClient } from "@tanstack/react-query"
import { invalidateOrderQueries } from "./invalidateOrderQueries"

describe("invalidateOrderQueries (#102)", () => {
  it("инвалидирует полный набор order-кэшей", () => {
    const invalidateQueries = vi.fn()
    const queryClient = { invalidateQueries } as unknown as QueryClient

    invalidateOrderQueries(queryClient)

    const allKeys = invalidateQueries.mock.calls
      .map((call) => call[0]?.queryKey)
      .filter(Boolean)
      .flat()
      .filter((k): k is string => typeof k === "string")

    expect(allKeys).toContain("orders")
    expect(allKeys).toContain("orders-recent")
    expect(allKeys).toContain("next-order-number")
    expect(allKeys).toContain("order-drafts")
    expect(allKeys).toContain("order-years")
    expect(allKeys).toContain("vacation-periods")
    expect(allKeys).toContain("vacation-history")
    expect(allKeys).toContain("vacation-employees-summary")
    expect(allKeys).toContain("employees")
    expect(allKeys).toContain("vacations")
  })

  it("вызывает invalidateQueries один раз на ключ", () => {
    const invalidateQueries = vi.fn()
    const queryClient = { invalidateQueries } as unknown as QueryClient

    invalidateOrderQueries(queryClient)

    const keys = invalidateQueries.mock.calls.map((call) => call[0]?.queryKey)
    expect(new Set(keys.map((k) => k?.[0])).size).toBe(keys.length)
  })
})
