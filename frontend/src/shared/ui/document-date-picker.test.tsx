// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { DocumentDatePicker } from "./document-date-picker"

/** ISO-дата со сдвигом дней от сегодня. */
function shiftedIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function todayIso(): string {
  return shiftedIso(0)
}

describe("DocumentDatePicker", () => {
  it("показывает предупреждение при будущей дате если warnIfFuture", () => {
    render(<DocumentDatePicker value={shiftedIso(30)} onChange={() => {}} label="Дата приказа" warnIfFuture />)
    expect(screen.getByText("Дата указана в будущем")).toBeInTheDocument()
  })

  it("не показывает предупреждение при будущей дате по умолчанию", () => {
    render(<DocumentDatePicker value={shiftedIso(30)} onChange={() => {}} label="Дата приказа" />)
    expect(screen.queryByText("Дата указана в будущем")).not.toBeInTheDocument()
  })

  it("не показывает предупреждение при прошедшей дате", () => {
    render(<DocumentDatePicker value={shiftedIso(-30)} onChange={() => {}} label="Дата приказа" warnIfFuture />)
    expect(screen.queryByText("Дата указана в будущем")).not.toBeInTheDocument()
  })

  it("не показывает предупреждение при сегодняшней дате", () => {
    render(<DocumentDatePicker value={todayIso()} onChange={() => {}} label="Дата приказа" warnIfFuture />)
    expect(screen.queryByText("Дата указана в будущем")).not.toBeInTheDocument()
  })

  it("не показывает предупреждение при пустом значении", () => {
    render(<DocumentDatePicker value="" onChange={() => {}} label="Дата приказа" warnIfFuture />)
    expect(screen.queryByText("Дата указана в будущем")).not.toBeInTheDocument()
  })

  it("передаёт введённую дату через onChange", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DocumentDatePicker value="" onChange={onChange} label="Дата приказа" />)

    const input = screen.getByLabelText("Дата приказа")
    await user.type(input, "15062026")

    expect(onChange).toHaveBeenCalledWith("2026-06-15")
  })
})
