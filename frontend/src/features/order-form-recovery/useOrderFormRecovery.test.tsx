// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useOrderFormRecovery, type OrderFormDraft } from "./useOrderFormRecovery"

const STORAGE_KEY = "hrms_order_form_draft"
const DEBOUNCE_MS = 800

function makeDraft(over: Partial<OrderFormDraft> = {}): OrderFormDraft {
  return {
    employee_id: 1,
    order_type_id: 2,
    order_date: "2026-01-10",
    order_number: "П-1",
    extra_fields: { contract_number: "ABC-1" },
    saved_at: "2026-01-10T00:00:00.000Z",
    ...over,
  }
}

function formState(over: Partial<OrderFormDraft> = {}) {
  return {
    employee_id: 1,
    order_type_id: 2,
    order_date: "2026-01-10",
    order_number: "П-1",
    extra_fields: { contract_number: "ABC-1" },
    ...over,
  }
}

function readDraft(): OrderFormDraft | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe("useOrderFormRecovery", () => {
  it("автосейв после debounce пишет черновик со всеми полями в localStorage", () => {
    renderHook(() => useOrderFormRecovery({ formState: formState(), onRestore: vi.fn() }))

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    const saved = readDraft()
    expect(saved).not.toBeNull()
    expect(saved!.employee_id).toBe(1)
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-1" })
  })

  it("автосейв текущей сессии не поднимает диалог перезаписи и обновляет черновик", () => {
    const { result, rerender } = renderHook(
      ({ state }) => useOrderFormRecovery({ formState: state, onRestore: vi.fn() }),
      { initialProps: { state: formState() } }
    )

    // Первый автосейв (mount) — без предсуществующего черновика
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
    expect(result.current.overwritePrompt).toBe(false)

    // Продолжаем заполнять: меняется номер контракта
    rerender({ state: formState({ extra_fields: { contract_number: "ABC-2" } }) })
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(result.current.overwritePrompt).toBe(false)
    const saved = readDraft()
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-2" })
  })

  it("черновик, существовавший на mount, → первое заполнение поднимает диалог перезаписи", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result } = renderHook(() =>
      useOrderFormRecovery({ formState: formState(), onRestore: vi.fn() })
    )

    expect(result.current.pendingDraft).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(result.current.overwritePrompt).toBe(true)
  })

  it("confirmOverwrite пишет новый черновик поверх старого", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result } = renderHook(() =>
      useOrderFormRecovery({
        formState: formState({ extra_fields: { contract_number: "NEW" } }),
        onRestore: vi.fn(),
      })
    )

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
    expect(result.current.overwritePrompt).toBe(true)

    act(() => {
      result.current.confirmOverwrite()
    })

    const saved = readDraft()
    expect(saved!.extra_fields).toEqual({ contract_number: "NEW" })
  })

  it("cancelOverwrite латчит: дальнейшие изменения не пишутся", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result, rerender } = renderHook(
      ({ state }) => useOrderFormRecovery({ formState: state, onRestore: vi.fn() }),
      { initialProps: { state: formState() } }
    )

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
    expect(result.current.overwritePrompt).toBe(true)

    act(() => {
      result.current.cancelOverwrite()
    })

    rerender({ state: formState({ extra_fields: { contract_number: "LATER" } }) })
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    const saved = readDraft()
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-1" })
  })

  it("restore вызывает onRestore и чистит черновик", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const onRestore = vi.fn()
    const { result } = renderHook(() =>
      useOrderFormRecovery({ formState: formState(), onRestore })
    )

    act(() => {
      result.current.restore()
    })

    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.pendingDraft).toBeNull()
  })

  it("pagehide пишет черновик синхронно, не дожидаясь debounce", () => {
    renderHook(() => useOrderFormRecovery({ formState: formState(), onRestore: vi.fn() }))

    // Дебаунс ещё не отработал — черновик должен появиться только из-за flush
    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    const saved = readDraft()
    expect(saved).not.toBeNull()
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-1" })
  })

  it("pagehide не пишет, если перезапись отменена", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result } = renderHook(() =>
      useOrderFormRecovery({ formState: formState(), onRestore: vi.fn() })
    )

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
    expect(result.current.overwritePrompt).toBe(true)

    act(() => {
      result.current.cancelOverwrite()
    })

    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    const saved = readDraft()
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-1" })
  })

  it("pagehide не пишет, когда в форме нет контента", () => {
    renderHook(() =>
      useOrderFormRecovery({
        formState: formState({ employee_id: null, order_type_id: null, order_number: "", extra_fields: {} }),
        onRestore: vi.fn(),
      })
    )

    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
