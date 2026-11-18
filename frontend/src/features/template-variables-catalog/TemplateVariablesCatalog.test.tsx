// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TemplateVariable } from "@/entities/order"
import { TemplateVariablesCatalog } from "./TemplateVariablesCatalog"

const VARIABLES: TemplateVariable[] = [
  {
    key: "doc_number",
    name: "{doc_number}",
    displayName: "Номер документа",
    description: "Номер документа",
    category: "Документ",
  },
  {
    key: "doc_date",
    name: "{doc_date}",
    displayName: "Дата документа",
    description: "Дата документа",
    category: "Документ",
  },
]

const CLIPBOARD_RESET_MS = 1200

function renderCatalog() {
  return render(<TemplateVariablesCatalog variables={VARIABLES} />)
}

/** Галочка-подтверждение в строке переменной рисуется иконкой lucide-check. */
function hasCheckIcon(button: HTMLElement) {
  return button.querySelector("svg.lucide-check") !== null
}

describe("TemplateVariablesCatalog — копирование переменной", () => {
  const writeText = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
    // @ts-expect-error — в jsdom clipboard нет, убираем подмену
    delete navigator.clipboard
  })

  it("кладёт имя переменной в буфер обмена", async () => {
    renderCatalog()
    const copyButtons = screen.getAllByTitle("Копировать")

    fireEvent.click(copyButtons[0])
    await act(async () => {
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith("{doc_number}")
  })

  it("показывает галочку сразу после копирования и снимает её через 1200 мс", async () => {
    renderCatalog()
    const copyButtons = screen.getAllByTitle("Копировать")

    fireEvent.click(copyButtons[0])
    await act(async () => {
      await Promise.resolve()
    })
    expect(hasCheckIcon(copyButtons[0])).toBe(true)
    expect(hasCheckIcon(copyButtons[1])).toBe(false)

    act(() => {
      vi.advanceTimersByTime(CLIPBOARD_RESET_MS)
    })
    expect(hasCheckIcon(copyButtons[0])).toBe(false)
  })
})
