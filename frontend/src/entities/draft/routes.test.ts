import { describe, expect, it } from "vitest"
import { DRAFTS_ROUTE, draftEditorUrl, isDraftsRoute } from "./routes"

describe("draft routes", () => {
  it("DRAFTS_ROUTE — отдельный маршрут, не подраздел приказов", () => {
    expect(DRAFTS_ROUTE).toBe("/drafts")
  })

  it("draftEditorUrl строит URL редактора", () => {
    expect(draftEditorUrl("abc-123")).toBe("/drafts/abc-123/edit-docx")
    expect(draftEditorUrl("abc-123", "view")).toBe("/drafts/abc-123/view-docx")
  })

  it("isDraftsRoute распознаёт страницу и вложенные пути", () => {
    expect(isDraftsRoute("/drafts")).toBe(true)
    expect(isDraftsRoute("/drafts/abc-123/edit-docx")).toBe(true)
    expect(isDraftsRoute("/drafts/abc-123/view-docx")).toBe(true)
  })

  it("isDraftsRoute не считает чужие разделы черновиками", () => {
    expect(isDraftsRoute("/orders")).toBe(false)
    expect(isDraftsRoute("/orders/drafts")).toBe(false)
    expect(isDraftsRoute("/orders/drafts/abc")).toBe(false)
    expect(isDraftsRoute("/vacations")).toBe(false)
    expect(isDraftsRoute("/draft")).toBe(false)
    expect(isDraftsRoute("/drafting")).toBe(false)
  })
})
