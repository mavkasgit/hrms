// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useDebouncedValue } from "./useDebouncedValue"

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it("возвращает начальное значение сразу", () => {
    const { result } = renderHook(() => useDebouncedValue("initial", 300))
    expect(result.current).toBe("initial")
  })

  it("обновляет значение после истечения задержки", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    )

    rerender({ value: "b" })
    expect(result.current).toBe("a")

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe("b")
  })

  it("сбрасывает таймер при быстром изменении значения", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    )

    rerender({ value: "b" })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: "c" })

    expect(result.current).toBe("a")

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe("c")
  })
})
