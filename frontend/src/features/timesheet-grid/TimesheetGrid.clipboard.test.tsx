// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { TimesheetEmployeeRow, TimesheetGrid as TimesheetGridData } from "@/entities/timesheet"
import { TimesheetGrid } from "./TimesheetGrid"

const { partialBulkMutate, addToast } = vi.hoisted(() => ({
  partialBulkMutate: vi.fn(),
  addToast: vi.fn(),
}))

vi.mock("@/entities/work-schedule", () => ({
  usePartialBulkSet: () => ({ mutateAsync: partialBulkMutate }),
}))

vi.mock("@/shared/ui/use-toast", () => ({
  useToast: () => ({ addToast }),
}))

/**
 * react-datasheet-grid заменён минимальной сеткой: тест проверяет clipboard-
 * логику TimesheetGrid, а не вёрстку библиотеки. Клик выставляет активную
 * ячейку, Shift+клик — прямоугольное выделение (те же колбэки, что у lib).
 */
vi.mock("react-datasheet-grid", async () => {
  const React = await import("react")

  const MockGrid = React.forwardRef(function MockGrid(props: any, ref: any) {
    const [anchor, setAnchor] = React.useState<{ row: number; col: number } | null>(null)
    React.useImperativeHandle(ref, () => ({
      setActiveCell: () => {},
      setSelection: () => {},
    }))

    const columns = (props.columns ?? []) as any[]
    const rows = (props.value ?? []) as any[]

    return React.createElement(
      "div",
      { "data-testid": "mock-grid" },
      rows.map((row: any, rowIndex: number) =>
        React.createElement(
          "div",
          { key: rowIndex },
          columns.map((column: any, colIndex: number) =>
            React.createElement(
              "div",
              {
                key: colIndex,
                "data-testid": `cell-${rowIndex}-${colIndex}`,
                onClick: (event: React.MouseEvent) => {
                  const cell = { row: rowIndex, col: colIndex, colId: column.id }
                  props.onActiveCellChange?.({ cell })
                  if (event.shiftKey && anchor) {
                    props.onSelectionChange?.({
                      selection: { min: anchor, max: { row: rowIndex, col: colIndex } },
                    })
                  } else {
                    setAnchor({ row: rowIndex, col: colIndex })
                    props.onSelectionChange?.({
                      selection: { min: cell, max: cell },
                    })
                  }
                },
              },
              column.copyValue
                ? column.copyValue({ rowData: row, rowIndex })
                : ""
            )
          )
        )
      )
    )
  })

  return { DataSheetGrid: MockGrid }
})

const shift_types = [
  {
    code: "day",
    name: "День",
    start_time: "08:00",
    end_time: "16:30",
    planned_hours: 8,
    is_working: true,
    is_night: false,
    sort_order: 10,
  },
  {
    code: "night",
    name: "Ночь",
    start_time: "20:00",
    end_time: "08:00",
    planned_hours: 12,
    is_working: true,
    is_night: true,
    sort_order: 30,
  },
  {
    code: "vacation",
    name: "Отпуск",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 110,
  },
]

const dates = ["2026-11-02", "2026-11-03", "2026-11-04"]
const otherDates = Array.from({ length: 27 }, (_, i) => `2026-11-${String(i + 5).padStart(2, "0")}`)
const dayDates = [...dates, ...otherDates]

const gridData: TimesheetGridData = {
  period_start: "2026-11-02",
  period_end: "2026-11-30",
  employees: [],
  shift_types,
  holidays: [],
}

function makeRow(id: number, name: string, cells: TimesheetEmployeeRow["cells"] = {}): TimesheetEmployeeRow {
  return {
    id,
    name,
    tab_number: id,
    department_id: null,
    department_name: null,
    position_id: null,
    position_name: null,
    tags: [],
    plan: {},
    fact: {},
    absences: [],
    cells,
    result_hours: 0,
  }
}

const sourceCell = {
  auto: null,
  manual: { shift_type_code: "day", planned_hours_override: null, note: null },
  result: "day",
  conflict: false,
  order_changed: false,
}

function renderGrid(props: Partial<ComponentProps<typeof TimesheetGrid>> = {}) {
  return render(
    <TimesheetGrid
      employees={[makeRow(1, "A"), makeRow(2, "B"), makeRow(3, "Источник", { [dayDates[0]]: sourceCell })]}
      gridData={gridData}
      periodStart="2026-11-02"
      periodEnd="2026-11-30"
      viewMode="merged"
      year={2026}
      month={11}
      {...props}
    />
  )
}

const cell = (row: number, col: number) => document.querySelector<HTMLElement>(`[data-testid="cell-${row}-${col}"]`)!

function clickCell(row: number, col: number, options: { shiftKey?: boolean } = {}) {
  fireEvent.click(cell(row, col), options)
}

function selectRange(fromRow: number, fromCol: number, toRow: number, toCol: number) {
  clickCell(fromRow, fromCol)
  clickCell(toRow, toCol, { shiftKey: true })
}

function copyFromGrid() {
  fireEvent.copy(document)
}

function pasteIntoGrid() {
  fireEvent.paste(document)
}

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  partialBulkMutate.mockReset()
  partialBulkMutate.mockResolvedValue({ error_count: 0, results: [] })
  addToast.mockReset()
})

afterAll(() => {
  vi.restoreAllMocks()
})

describe("TimesheetGrid — Ctrl+C / Ctrl+V (#106)", () => {
  it("копирует одну ячейку и заполняет ею все ячейки выделения", async () => {
    renderGrid()

    // Источник — третья строка, первый день
    clickCell(2, 0)
    copyFromGrid()

    // Выделяем 2 сотрудника × 3 дня
    selectRange(0, 0, 1, 2)
    pasteIntoGrid()

    await waitFor(() => expect(partialBulkMutate).toHaveBeenCalledTimes(1))
    const entries = partialBulkMutate.mock.calls[0][0].entries
    expect(entries).toHaveLength(6)
    for (const entry of entries) {
      expect(entry.shift_type_code).toBe("day")
      expect(entry.planned_hours_override).toBeNull()
    }

    // Все шесть ячеек показывают скопированное значение
    for (const row of [0, 1]) {
      for (const col of [0, 1, 2]) {
        expect(cell(row, col)).toHaveTextContent("day")
      }
    }
  })

  it("не пишет в read-only ячейки и не считает их отказом", async () => {
    renderGrid({ isCellReadOnly: (_employeeId, date) => date === dates[1] })

    clickCell(2, 0)
    copyFromGrid()
    selectRange(0, 0, 1, 2)
    pasteIntoGrid()

    await waitFor(() => expect(partialBulkMutate).toHaveBeenCalledTimes(1))
    const entries = partialBulkMutate.mock.calls[0][0].entries
    expect(entries.map((e: { work_date: string }) => e.work_date).sort()).toEqual(
      [dates[0], dates[0], dates[2], dates[2]].sort()
    )
    expect(cell(0, 1)).toHaveTextContent("")
    expect(cell(1, 1)).toHaveTextContent("")
    expect(addToast).not.toHaveBeenCalled()
  })

  it("отменяет вставку в несколько ячеек одним Ctrl+Z", async () => {
    renderGrid()

    clickCell(2, 0)
    copyFromGrid()
    selectRange(0, 0, 1, 2)
    pasteIntoGrid()

    await waitFor(() => expect(partialBulkMutate).toHaveBeenCalledTimes(1))
    expect(cell(0, 0)).toHaveTextContent("day")

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true })

    await waitFor(() => expect(partialBulkMutate).toHaveBeenCalledTimes(2))
    const restore = partialBulkMutate.mock.calls[1][0].entries
    expect(restore).toHaveLength(6)
    for (const entry of restore) {
      expect(entry.shift_type_code).toBeNull()
      expect(entry.planned_hours_override).toBeNull()
    }
    expect(cell(0, 0)).toHaveTextContent("")
    expect(cell(1, 2)).toHaveTextContent("")
  })

  it("не перехватывает копирование в поле ввода", () => {
    renderGrid()

    clickCell(2, 0)
    copyFromGrid()

    // Копирование из input не должно затирать внутренний буфер сетки
    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()
    fireEvent.copy(input)

    selectRange(0, 0, 0, 0)
    pasteIntoGrid()

    return waitFor(() => expect(cell(0, 0)).toHaveTextContent("day")).finally(() => input.remove())
  })

  it("вставляет значение из системного буфера, если своего буфера ещё нет", async () => {
    renderGrid()
    selectRange(0, 0, 0, 2)

    fireEvent.paste(document, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "night" : ""),
      },
    })

    await waitFor(() => expect(partialBulkMutate).toHaveBeenCalledTimes(1))
    const entries = partialBulkMutate.mock.calls[0][0].entries
    expect(entries).toHaveLength(3)
    for (const entry of entries) expect(entry.shift_type_code).toBe("night")
  })

  it("показывает количество нераспознанных ячеек и не пишет их", async () => {
    renderGrid()
    selectRange(0, 0, 0, 2)

    fireEvent.paste(document, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "day\tqqq" : ""),
      },
    })

    await waitFor(() => expect(addToast).toHaveBeenCalledTimes(1))
    expect(addToast.mock.calls[0][0].title).toBe("Не распознано ячеек: 1")
    // day + qqq + day (буфер 1×2 повторяется на выделении 1×3)
    expect(partialBulkMutate.mock.calls[0][0].entries).toHaveLength(2)
    expect(cell(0, 1)).toHaveTextContent("")
    expect(cell(0, 2)).toHaveTextContent("day")
  })
})
