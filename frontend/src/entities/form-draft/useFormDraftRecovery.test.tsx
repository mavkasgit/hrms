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

  it("автосейв текущей сессии не поднимает диалог перезаписи и обновляет черновик", () => {
    const { result, rerender } = renderHook(
      ({ state }) => setup({ formState: state }),
      { initialProps: { state: formState() } }
    )

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })
    expect(result.current.overwritePrompt).toBe(false)

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
    const { result } = renderHook(() => setup())

    expect(result.current.pendingDraft).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS)
    })

    expect(result.current.overwritePrompt).toBe(true)
  })

  it("confirmOverwrite пишет новый черновик поверх старого", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result } = renderHook(() =>
      setup({ formState: formState({ extra_fields: { contract_number: "NEW" } }) })
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
      ({ state }) => setup({ formState: state }),
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

  it("pagehide не пишет, если перезапись отменена", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(makeDraft()))
    const { result } = renderHook(() => setup())

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
      setup({
        formState: formState({ employee_id: null, type_id: null, number: "", extra_fields: {} }),
      })
    )

    act(() => {
      window.dispatchEvent(new Event("pagehide"))
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("clear стирает черновик и сбрасывает гейт перезаписи", () => {
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
    expect(result.current.overwritePrompt).toBe(false)
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
