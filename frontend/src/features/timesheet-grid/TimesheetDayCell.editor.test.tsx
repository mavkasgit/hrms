// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { TimesheetDayCell, type TimesheetDayCellProps } from "./TimesheetDayCell"
import type { DayColumnData } from "./types"
import type { TimesheetEmployeeRow } from "@/entities/timesheet"

/**
 * Radix Select требует браузерные API, которых нет в jsdom:
 * Pointer Capture, ResizeObserver и scrollIntoView.
 */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const rowData: TimesheetEmployeeRow = {
  id: 7,
  name: "Иванов Иван",
  tab_number: 1,
  department_id: null,
  department_name: null,
  position_id: null,
  position_name: null,
  tags: [],
  plan: {},
  fact: {},
  absences: [],
  cells: {},
  result_hours: 0,
}

const columnData: DayColumnData = {
  date: "2026-11-18",
  day: 18,
  dowShort: "Ср",
  isWeekend: false,
  isHoliday: false,
  holidayName: null,
  viewMode: "merged",
  shiftTypeMap: {},
}

function renderEditor(active = true, rowOverride: Partial<TimesheetEmployeeRow> = {}) {
  const setRowData = vi.fn()
  const stopEditing = vi.fn()
  const props: TimesheetDayCellProps = {
    rowData: { ...rowData, ...rowOverride },
    rowIndex: 0,
    columnIndex: 1,
    active,
    focus: active,
    disabled: false,
    columnData,
    setRowData,
    stopEditing,
    insertRowBelow: vi.fn(),
    duplicateRow: vi.fn(),
    deleteRow: vi.fn(),
    getContextMenuItems: vi.fn(() => []),
  }
  const view = render(<TimesheetDayCell {...props} />)
  return { ...view, setRowData, stopEditing, props }
}

const cell = () => document.querySelector<HTMLElement>('[data-date="2026-11-18"]')!

describe("TimesheetDayCell — inline-редактор смены", () => {
  it("открывает список смен и статусов при входе в редактирование", () => {
    renderEditor()

    expect(screen.getByRole("listbox")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /День \(08:00-16:30\)/ })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Отпуск/ })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /— авто —/ })).toBeInTheDocument()
  })

  it("выбор смены пишет ручное значение и закрывает редактор", async () => {
    const user = userEvent.setup()
    const { setRowData, stopEditing } = renderEditor()

    await user.click(screen.getByRole("option", { name: /Ночь 12ч \(20:00-08:00\)/ }))

    expect(setRowData).toHaveBeenCalledTimes(1)
    expect(setRowData.mock.calls[0][0].cells["2026-11-18"]).toEqual({
      auto: null,
      manual: { shift_type_code: "night", planned_hours_override: null, note: null },
      result: "night",
      conflict: false,
      order_changed: false,
    })
    expect(stopEditing).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("«— авто —» очищает ручное значение", async () => {
    const user = userEvent.setup()
    const { setRowData } = renderEditor(true, {
      cells: {
        "2026-11-18": {
          auto: null,
          manual: { shift_type_code: "day", planned_hours_override: null, note: null },
          result: "day",
          conflict: false,
          order_changed: false,
        },
      },
    })

    await user.click(screen.getByRole("option", { name: /— авто —/ }))

    expect(setRowData.mock.calls[0][0].cells["2026-11-18"]).toEqual({
      auto: null,
      manual: null,
      result: null,
      conflict: false,
      order_changed: false,
    })
  })

  it("Escape закрывает редактор без изменения ячейки и возвращает фокус", async () => {
    const user = userEvent.setup()
    const { setRowData, stopEditing } = renderEditor()

    await user.keyboard("{Escape}")

    expect(setRowData).not.toHaveBeenCalled()
    expect(stopEditing).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(cell()).toHaveFocus()
  })

  it("после выбора фокус возвращается в ячейку", async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByRole("option", { name: /Отпуск/ }))

    expect(cell()).toHaveFocus()
  })

  it("Tooltip и data-атрибуты ячейки сохраняются при открытом редакторе", () => {
    renderEditor()
    expect(cell()).toHaveAttribute("data-employee-id", "7")
  })
})

afterAll(() => {
  vi.restoreAllMocks()
})
