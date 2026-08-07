// @vitest-environment jsdom
import { MemoryRouter, useLocation } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useFillDraftIdRestore } from "./useFillDraftIdRestore"
import type { DraftFormData } from "@/entities/draft"

const mockUseDraftFormData = vi.fn()
vi.mock("@/entities/draft", () => ({
  useDraftFormData: (...args: unknown[]) => mockUseDraftFormData(...args),
}))

interface TestDraft {
  number: string
  saved_at: string
}

const FILL_DATA: DraftFormData = {
  kind: "notification",
  is_group: false,
  order_type_code: null,
  data: [{ key: "number", value: "У-1" }],
  employees: null,
}

function Host({
  onRestore,
  mapToDraft,
  cleanUrl,
}: {
  onRestore: (draft: TestDraft) => void
  mapToDraft: (data: DraftFormData) => TestDraft | null
  cleanUrl: string
}) {
  useFillDraftIdRestore(onRestore, mapToDraft, cleanUrl)
  return null
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderHost(initialEntries: string[], props: Parameters<typeof Host>[0]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Host {...props} />
      <LocationProbe />
    </MemoryRouter>
  )
}

function dataMock(draftId: string | null, data: DraftFormData | undefined) {
  return draftId ? { data } : { data: undefined }
}

afterEach(() => {
  mockUseDraftFormData.mockReset()
})

describe("useFillDraftIdRestore", () => {
  it("восстанавливает форму по ?fillDraftId и убирает параметр из URL", async () => {
    mockUseDraftFormData.mockImplementation((draftId: string | null) => dataMock(draftId, FILL_DATA))
    const onRestore = vi.fn()
    const mapToDraft = vi.fn(() => ({ number: "У-1", saved_at: "2026-01-01T00:00:00.000Z" }))

    renderHost(["/orders/notifications?fillDraftId=abc"], {
      onRestore,
      mapToDraft,
      cleanUrl: "/orders/notifications",
    })

    await waitFor(() =>
      expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ number: "У-1" }))
    )
    expect(mapToDraft).toHaveBeenCalledWith(FILL_DATA)
    // Параметр убран, чтобы повторный вход не перезаполнял форму.
    expect(screen.getByTestId("location").textContent).toBe("/orders/notifications")
  })

  it("не восстанавливает и не трогает URL, если маппер вернул null (чужой вид)", async () => {
    mockUseDraftFormData.mockImplementation((draftId: string | null) => dataMock(draftId, FILL_DATA))
    const onRestore = vi.fn()
    const mapToDraft = vi.fn(() => null)

    renderHost(["/orders/notifications?fillDraftId=abc"], {
      onRestore,
      mapToDraft,
      cleanUrl: "/orders/notifications",
    })

    await waitFor(() => expect(mapToDraft).toHaveBeenCalled())
    expect(onRestore).not.toHaveBeenCalled()
    expect(screen.getByTestId("location").textContent).toBe("/orders/notifications?fillDraftId=abc")
  })

  it("ничего не делает без ?fillDraftId", () => {
    mockUseDraftFormData.mockImplementation((draftId: string | null) => dataMock(draftId, undefined))
    const onRestore = vi.fn()
    const mapToDraft = vi.fn(() => ({ number: "У-1", saved_at: "2026-01-01T00:00:00.000Z" }))

    renderHost(["/orders/notifications"], {
      onRestore,
      mapToDraft,
      cleanUrl: "/orders/notifications",
    })

    expect(onRestore).not.toHaveBeenCalled()
    expect(mapToDraft).not.toHaveBeenCalled()
    expect(screen.getByTestId("location").textContent).toBe("/orders/notifications")
  })
})
