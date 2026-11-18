// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DatePicker } from "./date-picker"

/**
 * Enter в поле подтверждает ввод через blur. Во время IME-композиции (ввод
 * иероглифа) Enter принадлежит IME и не должен подтверждать дату.
 */
describe("DatePicker — Enter и IME-композиция", () => {
  it("Enter во время композиции не подтверждает ввод — фокус остаётся в поле", () => {
    const onChange = vi.fn()
    render(<DatePicker value="" onChange={onChange} label="Дата приказа" />)
    const input = screen.getByLabelText("Дата приказа")
    input.focus()

    fireEvent.keyDown(input, { key: "Enter", isComposing: true })

    expect(input).toHaveFocus()
  })

  it("Enter с keyCode 229 (подтверждение композиции IME) не подтверждает ввод", () => {
    const onChange = vi.fn()
    render(<DatePicker value="" onChange={onChange} label="Дата приказа" />)
    const input = screen.getByLabelText("Дата приказа")
    input.focus()

    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })

    expect(input).toHaveFocus()
  })

  it("обычный Enter подтверждает ввод — поле теряет фокус", () => {
    const onChange = vi.fn()
    render(<DatePicker value="" onChange={onChange} label="Дата приказа" />)
    const input = screen.getByLabelText("Дата приказа")
    input.focus()

    fireEvent.keyDown(input, { key: "Enter" })

    expect(input).not.toHaveFocus()
  })
})
