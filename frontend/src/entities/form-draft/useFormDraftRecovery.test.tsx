// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useFormDraftRecovery, type UseFormDraftRecoveryOptions } from "./useFormDraftRecovery"

const STORAGE_KEY = "hrms_test_form_draft"
const DEBOUNCE_MS = 800

interface TestDraft {
  employee_id: number | null
  type_id: number | null
  date: string
  number: string
  extra_fields: Record<string, string | number>
  saved_at: string
}

function makeDraft(over: Partial<TestDraft> = {}): TestDraft {
  return {
    employee_id: 1,
    type_id: 2,
    date: "2026-01-10",
    number: "П-1",
    extra_fields: { contract_number: "ABC-1" },
    saved_at: "2026-01-10T00:00:00.000Z",
    ...over,
  }
}

function formState(over: Partial<TestDraft> = {}) {
  return {
    employee_id: 1,
    type_id: 2,
    date: "2026-01-10",
    number: "П-1",
    extra_fields: { contract_number: "ABC-1" },
    ...over,
  }
}

function hasContent(state: Omit<TestDraft, "saved_at">): boolean {
  return (
    state.employee_id !== null ||
    state.type_id !== null ||
    state.number.trim() !== "" ||
    Object.values(state.extra_fields).some((v) => v !== "" && v !== null && v !== undefined)
  )
}

function readDraft(): TestDraft | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

function setup(over: Partial<UseFormDraftRecoveryOptions<TestDraft>> = {}) {
  return useFormDraftRecovery<TestDraft>({
    storageKey: STORAGE_KEY,
    formState: formState(),
    hasContent,
    onRestore: vi.fn(),
    ...over,
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

describe("useFormDraftRecovery", () => {
  it("автосейв после debounce пишет черновик со всеми полями в localStorage", () => {
    renderHook(() => setup())

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    const saved = readDraft()
    expect(saved).not.toBeNull()
    expect(saved!.employee_id).toBe(1)
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-1" })
  })

  it("автосейв молча перезаписывает пред-сессионное заполнение — никакого промпта (#87)", () => {
    // Черновик, существовавший ДО загрузки страницы (с прошлой сессии)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result, rerender } = renderHook(
      ({ state }) => setup({ formState: state }),
      { initialProps: { state: formState() } }
    )

    // Пред-сессионный черновик найден, но диалога перезаписи больше нет
    expect(result.current.pendingDraft).not.toBeNull()

    // Пользователь начинает новое заполнение — оно тихо заменяет старое
    rerender({ state: formState({ extra_fields: { contract_number: "NEW" } }) })
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    const saved = readDraft()
    expect(saved!.extra_fields).toEqual({ contract_number: "NEW" })
  })

  it("заполнение с прошлой сессии заменяется при новом вводе после закрытия попапа (#87)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result, rerender } = renderHook(
      ({ state }) => setup({ formState: state }),
      { initialProps: { state: formState() } }
    )

    // Попап закрыли (промпт не нужен) — черновик остался на месте
    expect(result.current.pendingDraft).not.toBeNull()

    // Начинаем новое заполнение
    rerender({ state: formState({ number: "П-2" }) })
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    const saved = readDraft()
    expect(saved!.number).toBe("П-2")
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-1" })
  })

  it("restore вызывает onRestore и чистит черновик", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const onRestore = vi.fn()
    const { result } = renderHook(() => setup({ onRestore }))

    act(() => {
      result.current.restore()
    })

    expect(onRestore).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.pendingDraft).toBeNull()
  })

  it("pagehide не пересоздаёт черновик сразу после restore", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result } = renderHook(() => setup())

    act(() => {
      result.current.restore()
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("pagehide пишет черновик синхронно, не дожидаясь debounce", () => {
    renderHook(() => setup())

    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    const saved = readDraft()
    expect(saved).not.toBeNull()
    expect(saved!.extra_fields).toEqual({ contract_number: "ABC-1" })
  })

  it("pagehide не пишет, когда в форме нет контента", () => {
    renderHook(() =>
      setup({
        formState: formState({ employee_id: null, type_id: null, number: "", extra_fields: {} }),
      })
    )

    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("clear стирает черновик; новое заполнение после него пишется без подтверждения (#87)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result, rerender } = renderHook(
      ({ state }) => setup({ formState: state }),
      { initialProps: { state: formState() } }
    )

    act(() => {
      result.current.clear()
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    // Новое заполнение после clear не блокируется диалогом перезаписи
    rerender({ state: formState({ extra_fields: { contract_number: "NEW" } }) })
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
    const saved = readDraft()
    expect(saved).not.toBeNull()
    expect(saved!.extra_fields).toEqual({ contract_number: "NEW" })
  })

  it("разные storageKey не пересекаются (уведомление не видит черновик приказа)", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result } = renderHook(() =>
      useFormDraftRecovery<TestDraft>({
        storageKey: "hrms_notification_form_draft",
        formState: formState(),
        hasContent,
        onRestore: vi.fn(),
      })
    )

    expect(result.current.pendingDraft).toBeNull()
  })
})
