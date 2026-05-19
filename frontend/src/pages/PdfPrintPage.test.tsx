// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PdfPrintPage } from "@/pages/PdfPrintPage"

describe("PdfPrintPage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("shows iframe for valid PDF URL", () => {
    render(<PdfPrintPage pdfUrl="http://localhost/test.pdf" title="Документ 1" invalidIdMessage="bad id" />)

    expect(screen.getByTitle("Печать: Документ 1")).toBeTruthy()
    expect(screen.getByText("Подготавливаем PDF...")).toBeTruthy()
  })

  it("shows invalid id error when url is missing", () => {
    render(<PdfPrintPage pdfUrl={null} title="Документ 1" invalidIdMessage="Некорректный ID" />)

    expect(screen.getByText("Некорректный ID")).toBeTruthy()
  })

  it("shows load error when iframe fails", () => {
    render(<PdfPrintPage pdfUrl="http://localhost/test.pdf" title="Документ 1" invalidIdMessage="bad id" />)

    const frame = screen.getByTitle("Печать: Документ 1") as HTMLIFrameElement
    if (typeof frame.onerror === "function") {
      frame.onerror(new Event("error"))
    } else {
      fireEvent.error(frame)
    }

    expect(screen.getByText("Не удалось загрузить PDF")).toBeTruthy()
  })

  it("triggers iframe print only once after first load", () => {
    const windowPrintSpy = vi.spyOn(window, "print").mockImplementation(() => {})
    render(<PdfPrintPage pdfUrl="http://localhost/test.pdf" title="Документ 1" invalidIdMessage="bad id" />)

    const frame = screen.getByTitle("Печать: Документ 1") as HTMLIFrameElement
    const focus = vi.fn()
    const print = vi.fn()

    Object.defineProperty(frame, "contentWindow", {
      value: { focus, print },
      configurable: true,
    })

    fireEvent.load(frame)
    vi.advanceTimersByTime(160)
    fireEvent.load(frame)
    vi.advanceTimersByTime(160)

    expect(focus).toHaveBeenCalledTimes(1)
    expect(print).toHaveBeenCalledTimes(1)
    expect(windowPrintSpy).not.toHaveBeenCalled()
  })
})
