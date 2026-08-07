// @vitest-environment jsdom
import { type ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useDraftRecoveryFor } from "./useDraftRecoveryFor"

const ORDER_DRAFT_KEY = "hrms_order_form_draft"

interface TestDraft {
  number: string
  saved_at: string
}

function wrapper(initialEntries: string[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  }
}

function hasContent(state: Omit<TestDraft, "saved_at">): boolean {
  return state.number !== ""
}

afterEach(() => {
  localStorage.clear()
})

describe("useDraftRecoveryFor", () => {
  it("авто-восстанавливает форму по ?recover=1, если черновик найден", () => {
    localStorage.setItem(
      ORDER_DRAFT_KEY,
      JSON.stringify({ number: "П-1", saved_at: "2026-01-10T00:00:00.000Z" }),
    )
    const onRestore = vi.fn()

    renderHook(
      () =>
        useDraftRecoveryFor<TestDraft>({
          slot: "orders",
          formState: { number: "" },
          hasContent,
          onRestore,
        }),
      { wrapper: wrapper(["/?recover=1"]) },
    )

    expect(onRestore).toHaveBeenCalledWith(
      expect.objectContaining({ number: "П-1" }),
    )
  })

  it("не восстанавливает без ?recover=1", () => {
    localStorage.setItem(
      ORDER_DRAFT_KEY,
      JSON.stringify({ number: "П-1", saved_at: "2026-01-10T00:00:00.000Z" }),
    )
    const onRestore = vi.fn()

    renderHook(
      () =>
        useDraftRecoveryFor<TestDraft>({
          slot: "orders",
          formState: { number: "" },
          hasContent,
          onRestore,
        }),
      { wrapper: wrapper(["/"]) },
    )

    expect(onRestore).not.toHaveBeenCalled()
  })

  it("не восстанавливает по ?recover=1 при autoRestoreOnRecover: false", () => {
    localStorage.setItem(
      ORDER_DRAFT_KEY,
      JSON.stringify({ number: "П-1", saved_at: "2026-01-10T00:00:00.000Z" }),
    )
    const onRestore = vi.fn()

    renderHook(
      () =>
        useDraftRecoveryFor<TestDraft>({
          slot: "orders",
          formState: { number: "" },
          hasContent,
          onRestore,
          autoRestoreOnRecover: false,
        }),
      { wrapper: wrapper(["/?recover=1"]) },
    )

    expect(onRestore).not.toHaveBeenCalled()
  })

  it("групповой слот восстанавливается по ?recoverGroup=1, а не по ?recover=1", () => {
    localStorage.setItem(
      "hrms_unpaid_leave_group_form_draft",
      JSON.stringify({ number: "Г-1", saved_at: "2026-01-10T00:00:00.000Z" }),
    )
    const onRestore = vi.fn()

    renderHook(
      () =>
        useDraftRecoveryFor<TestDraft>({
          slot: "unpaid-leaves:group",
          formState: { number: "" },
          hasContent,
          onRestore,
        }),
      { wrapper: wrapper(["/?recover=1"]) },
    )

    expect(onRestore).not.toHaveBeenCalled()
  })

  it("групповой слот восстанавливается по ?recoverGroup=1", () => {
    localStorage.setItem(
      "hrms_unpaid_leave_group_form_draft",
      JSON.stringify({ number: "Г-1", saved_at: "2026-01-10T00:00:00.000Z" }),
    )
    const onRestore = vi.fn()

    renderHook(
      () =>
        useDraftRecoveryFor<TestDraft>({
          slot: "unpaid-leaves:group",
          formState: { number: "" },
          hasContent,
          onRestore,
        }),
      { wrapper: wrapper(["/?recoverGroup=1"]) },
    )

    expect(onRestore).toHaveBeenCalledWith(
      expect.objectContaining({ number: "Г-1" }),
    )
  })

  it("восстановление с изменением сброс-поля поднимает restoreGuardRef", () => {
    localStorage.setItem(
      ORDER_DRAFT_KEY,
      JSON.stringify({ number: "П-1", saved_at: "2026-01-10T00:00:00.000Z" }),
    )
    const onRestore = vi.fn(() => true)

    const { result } = renderHook(
      () =>
        useDraftRecoveryFor<TestDraft>({
          slot: "orders",
          formState: { number: "" },
          hasContent,
          onRestore,
        }),
      { wrapper: wrapper(["/?recover=1"]) },
    )

    expect(result.current.restoreGuardRef.current).toBe(true)
  })

  it("восстановление без изменения сброс-поля не поднимает restoreGuardRef", () => {
    localStorage.setItem(
      ORDER_DRAFT_KEY,
      JSON.stringify({ number: "П-1", saved_at: "2026-01-10T00:00:00.000Z" }),
    )
    const onRestore = vi.fn(() => false)

    const { result } = renderHook(
      () =>
        useDraftRecoveryFor<TestDraft>({
          slot: "orders",
          formState: { number: "" },
          hasContent,
          onRestore,
        }),
      { wrapper: wrapper(["/?recover=1"]) },
    )

    expect(result.current.restoreGuardRef.current).toBe(false)
  })
})
