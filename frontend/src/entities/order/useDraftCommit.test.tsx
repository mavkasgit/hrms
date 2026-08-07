// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useDraftCommit } from "./useDraftCommit"
import type { DraftFormData } from "@/entities/draft"

const mockFetchDraftFormData = vi.fn()
vi.mock("@/entities/draft", () => ({
  fetchDraftFormData: (...args: unknown[]) => mockFetchDraftFormData(...args),
}))

const commitOrderDraft = vi.fn()
const commitGroupDraft = vi.fn()
vi.mock("@/entities/order/onlyofficeApi", () => ({
  commitOrderDraft: (...args: unknown[]) => commitOrderDraft(...args),
  commitGroupDraft: (...args: unknown[]) => commitGroupDraft(...args),
}))

function formDataMock(isGroup: boolean): Partial<DraftFormData> {
  return { is_group: isGroup, order_type_code: null, employees: null }
}

function Host({ draftId, onResult }: { draftId: string | null; onResult: (r: unknown) => void }) {
  const { commit } = useDraftCommit(draftId)
  return (
    <button
      type="button"
      onClick={() =>
        commit()
          .then(onResult)
          .catch(() => {})
      }
    >
      Сохранить приказ
    </button>
  )
}

afterEach(() => {
  mockFetchDraftFormData.mockReset()
  commitOrderDraft.mockReset()
  commitGroupDraft.mockReset()
})

describe("useDraftCommit", () => {
  it("выбирает commitGroupDraft для группового черновика", async () => {
    mockFetchDraftFormData.mockResolvedValue(formDataMock(true))
    const onResult = vi.fn()
    render(<Host draftId="grp-1" onResult={onResult} />)

    await userEvent.click(screen.getByRole("button", { name: "Сохранить приказ" }))

    expect(mockFetchDraftFormData).toHaveBeenCalledWith("grp-1")
    expect(commitGroupDraft).toHaveBeenCalledWith("grp-1")
    expect(commitOrderDraft).not.toHaveBeenCalled()
  })

  it("выбирает commitOrderDraft для одиночного черновика", async () => {
    mockFetchDraftFormData.mockResolvedValue(formDataMock(false))
    const onResult = vi.fn()
    render(<Host draftId="single-1" onResult={onResult} />)

    await userEvent.click(screen.getByRole("button", { name: "Сохранить приказ" }))

    expect(mockFetchDraftFormData).toHaveBeenCalledWith("single-1")
    expect(commitOrderDraft).toHaveBeenCalledWith("single-1")
    expect(commitGroupDraft).not.toHaveBeenCalled()
  })

  it("не вызывает commit без draftId", async () => {
    const onResult = vi.fn()
    render(<Host draftId={null} onResult={onResult} />)

    await userEvent.click(screen.getByRole("button", { name: "Сохранить приказ" }))

    expect(mockFetchDraftFormData).not.toHaveBeenCalled()
    expect(commitOrderDraft).not.toHaveBeenCalled()
    expect(commitGroupDraft).not.toHaveBeenCalled()
  })
})
