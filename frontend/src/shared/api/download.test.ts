// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest"

const mockGet = vi.fn()
vi.mock("@/shared/api/client", () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))

import { downloadFile, extractFilenameFromContentDisposition } from "./download"

describe("extractFilenameFromContentDisposition", () => {
  it("парсит RFC 5987 filename*=UTF-8'' (кириллица)", () => {
    const header = "attachment; filename*=UTF-8''%D0%9F%D1%80%D0%B8%D0%BA%D0%B0%D0%B7.docx"
    expect(extractFilenameFromContentDisposition(header, "fallback.docx")).toBe("Приказ.docx")
  })

  it("парсит простой filename=\"...\"", () => {
    const header = 'attachment; filename="report.docx"'
    expect(extractFilenameFromContentDisposition(header, "fallback.docx")).toBe("report.docx")
  })

  it("парсит filename без кавычек", () => {
    const header = "attachment; filename=report.xlsx"
    expect(extractFilenameFromContentDisposition(header, "fallback.xlsx")).toBe("report.xlsx")
  })

  it("возвращает fallback при отсутствии header", () => {
    expect(extractFilenameFromContentDisposition(undefined, "fallback.docx")).toBe("fallback.docx")
  })

  it("возвращает fallback при повреждённой percent-кодировке", () => {
    const header = "attachment; filename*=UTF-8''%D0%9F%D1%80%D0%B8%D0%BA%D0%B0%D0%B7%"
    expect(extractFilenameFromContentDisposition(header, "fallback.docx")).toBe("fallback.docx")
  })
})

describe("downloadFile", () => {
  let createObjectUrl: MockInstance
  let revokeObjectUrl: MockInstance
  let clickSpy: MockInstance
  let appendChildSpy: MockInstance
  let removeSpy: MockInstance

  beforeEach(() => {
    createObjectUrl = vi.fn(() => "blob:mock-url")
    revokeObjectUrl = vi.fn()
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    })
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    appendChildSpy = vi.spyOn(document.body, "appendChild")
    removeSpy = vi.spyOn(HTMLAnchorElement.prototype, "remove").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clickSpy.mockRestore()
    appendChildSpy.mockRestore()
    removeSpy.mockRestore()
    mockGet.mockReset()
  })

  it("делает GET через общий axios (токен в заголовке), responseType blob", async () => {
    const blob = new Blob(["content"])
    mockGet.mockResolvedValueOnce({
      data: blob,
      headers: { "content-disposition": 'attachment; filename="Приказ.docx"' },
    })

    await downloadFile("/orders/5/download", "fallback.docx")

    expect(mockGet).toHaveBeenCalledWith("/orders/5/download", { responseType: "blob" })
    expect(createObjectUrl).toHaveBeenCalledWith(blob)
  })

  it("триггерит клик по временной ссылке с filename из Content-Disposition", async () => {
    mockGet.mockResolvedValueOnce({
      data: new Blob(["content"]),
      headers: { "content-disposition": 'attachment; filename="Приказ.docx"' },
    })

    await downloadFile("/orders/5/download", "fallback.docx")

    const link = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(link.download).toBe("Приказ.docx")
    expect(link.href).toContain("blob:mock-url")
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(removeSpy).toHaveBeenCalledTimes(1)
  })

  it("использует fallback filename, когда Content-Disposition отсутствует", async () => {
    mockGet.mockResolvedValueOnce({
      data: new Blob(["content"]),
      headers: {},
    })

    await downloadFile("/orders/5/download", "fallback_5.docx")

    const link = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(link.download).toBe("fallback_5.docx")
  })

  it("отменяет создание ссылки и revoke при ошибке загрузки", async () => {
    mockGet.mockRejectedValueOnce(new Error("401 Unauthorized"))

    await expect(downloadFile("/orders/5/download", "fallback.docx")).rejects.toThrow("401 Unauthorized")
    expect(createObjectUrl).not.toHaveBeenCalled()
  })
})
