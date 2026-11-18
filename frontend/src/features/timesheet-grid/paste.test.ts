import { describe, expect, it } from "vitest"
import type { TimesheetEmployeeRow } from "@/entities/timesheet"
import {
  buildClipboardPayload,
  buildPastePlan,
  parseClipboardText,
  resolvePasteTarget,
  type ClipboardPayload,
} from "./paste"
import type { ShiftTypeMap } from "./types"

const shiftTypeMap: ShiftTypeMap = {
  day: {
    code: "day",
    name: "День",
    start_time: "08:00",
    end_time: "16:30",
    planned_hours: 8,
    is_working: true,
    is_night: false,
    sort_order: 10,
    color: "#10b981",
    letter: null,
  },
  night: {
    code: "night",
    name: "Ночь",
    start_time: "20:00",
    end_time: "08:00",
    planned_hours: 12,
    is_working: true,
    is_night: true,
    sort_order: 30,
    color: "#1e3a8a",
    letter: null,
  },
  vacation: {
    code: "vacation",
    name: "Отпуск",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 110,
    color: "#3b82f6",
    letter: "О",
  },
}

const dates = ["2026-11-02", "2026-11-03", "2026-11-04"]

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

const dayCell = (code: string) => ({
  auto: null,
  manual: { shift_type_code: code, planned_hours_override: null, note: null },
  result: code,
  conflict: false,
  order_changed: false,
})

describe("buildClipboardPayload", () => {
  it("копирует видимое значение: код смены и букву статуса", () => {
    const rows = [
      makeRow(1, "A", { [dates[0]]: dayCell("day"), [dates[1]]: dayCell("vacation") }),
      makeRow(2, "B"),
    ]
    const payload = buildClipboardPayload(rows, dates, { min: { row: 0, col: 0 }, max: { row: 1, col: 1 } }, shiftTypeMap)
    expect(payload.values).toEqual([
      ["day", "О"],
      ["", ""],
    ])
    expect(payload.text).toBe("day\tО\n\t")
  })

  it("ячейка из авто-слоя копируется не пустой", () => {
    const rows = [
      makeRow(1, "A", {
        [dates[0]]: {
          auto: { shift_type_code: "vacation", source: "vacation", order_id: null },
          manual: null,
          result: "vacation",
          conflict: false,
          order_changed: false,
        },
      }),
    ]
    const payload = buildClipboardPayload(rows, dates, { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } }, shiftTypeMap)
    expect(payload.values).toEqual([["О"]])
  })
})

describe("buildPastePlan", () => {
  const oneCell: ClipboardPayload = { values: [["day"]], text: "day" }

  it("заполняет все ячейки выделения одним значением и пишет ручной слой", () => {
    const rows = [makeRow(1, "A"), makeRow(2, "B")]
    const plan = buildPastePlan({
      rows,
      dayDates: dates,
      target: { min: { row: 0, col: 0 }, max: { row: 1, col: 2 } },
      clipboard: oneCell,
      shiftTypeMap,
    })

    expect(plan.changes).toHaveLength(6)
    expect(plan.restore).toHaveLength(6)
    expect(plan.rejected).toBe(0)
    for (const c of plan.changes) expect(c.shift_type_code).toBe("day")

    expect(plan.rows[0].cells[dates[0]]).toEqual({
      auto: null,
      manual: { shift_type_code: "day", planned_hours_override: null, note: null },
      result: "day",
      conflict: false,
      order_changed: false,
    })
    // Исходный массив не мутируется
    expect(rows[0].cells[dates[0]]).toBeUndefined()
  })

  it("сохраняет авто-слой и конфликт, снимает order_changed", () => {
    const rows = [
      makeRow(1, "A", {
        [dates[0]]: {
          auto: { shift_type_code: "vacation", source: "vacation", order_id: 7 },
          manual: { shift_type_code: "sick", planned_hours_override: 4, note: "x" },
          result: "sick",
          conflict: true,
          order_changed: true,
        },
      }),
    ]
    const plan = buildPastePlan({
      rows,
      dayDates: dates,
      target: { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } },
      clipboard: oneCell,
      shiftTypeMap,
    })

    expect(plan.rows[0].cells[dates[0]]).toMatchObject({
      auto: { shift_type_code: "vacation", source: "vacation", order_id: 7 },
      manual: { shift_type_code: "day", planned_hours_override: null, note: null },
      result: "day",
      conflict: true,
      order_changed: false,
    })
    expect(plan.restore[0]).toEqual({
      employee_id: 1,
      work_date: dates[0],
      shift_type_code: "sick",
      planned_hours_override: 4,
    })
  })

  it("не трогает read-only ячейки и не считает их отказом", () => {
    const rows = [makeRow(1, "A", { [dates[1]]: dayCell("night") })]
    const plan = buildPastePlan({
      rows,
      dayDates: dates,
      target: { min: { row: 0, col: 0 }, max: { row: 0, col: 2 } },
      clipboard: oneCell,
      shiftTypeMap,
      isReadOnly: (_rowIndex, colIndex) => colIndex === 1,
    })

    expect(plan.changes.map((c) => c.work_date)).toEqual([dates[0], dates[2]])
    expect(plan.rejected).toBe(0)
    expect(plan.rows[0].cells[dates[1]]).toEqual(dayCell("night"))
  })

  it("нераспознанные значения не пишутся и считаются", () => {
    const rows = [makeRow(1, "A")]
    const plan = buildPastePlan({
      rows,
      dayDates: dates,
      target: { min: { row: 0, col: 0 }, max: { row: 0, col: 2 } },
      clipboard: { values: [["day", "qqq", ""]], text: "day\tqqq\t" },
      shiftTypeMap,
    })

    expect(plan.changes.map((c) => c.work_date)).toEqual([dates[0]])
    expect(plan.rejected).toBe(1)
    expect(plan.rows[0].cells[dates[1]]).toBeUndefined()
  })

  it("повторяет буфер циклически внутри выделения", () => {
    const rows = [makeRow(1, "A")]
    const plan = buildPastePlan({
      rows,
      dayDates: dates,
      target: { min: { row: 0, col: 0 }, max: { row: 0, col: 2 } },
      clipboard: { values: [["day", "night"]], text: "day\tnight" },
      shiftTypeMap,
    })

    expect(plan.changes.map((c) => c.shift_type_code)).toEqual(["day", "night", "day"])
  })

  it("не пишет и не отменяет, если ручное значение уже совпадает", () => {
    const rows = [makeRow(1, "A", { [dates[0]]: dayCell("day") })]
    const plan = buildPastePlan({
      rows,
      dayDates: dates,
      target: { min: { row: 0, col: 0 }, max: { row: 0, col: 0 } },
      clipboard: oneCell,
      shiftTypeMap,
    })
    expect(plan.changes).toHaveLength(0)
    expect(plan.restore).toHaveLength(0)
  })

  it("не переполняет границы сетки", () => {
    const rows = [makeRow(1, "A")]
    const plan = buildPastePlan({
      rows,
      dayDates: dates,
      target: { min: { row: 0, col: 1 }, max: { row: 4, col: 9 } },
      clipboard: oneCell,
      shiftTypeMap,
    })
    expect(plan.changes.map((c) => c.work_date)).toEqual([dates[1], dates[2]])
  })
})

describe("resolvePasteTarget", () => {
  it("для выделения нескольких ячеек вставляет внутрь него", () => {
    const target = resolvePasteTarget({
      activeCell: { row: 0, col: 0 },
      selection: { min: { row: 0, col: 1 }, max: { row: 1, col: 3 } },
      buffer: { values: [["day", "night"]], text: "" },
      rowCount: 2,
      colCount: 5,
    })
    expect(target).toEqual({ min: { row: 0, col: 1 }, max: { row: 1, col: 3 } })
  })

  it("для одной активной ячейки растекается по размеру буфера, как Excel", () => {
    const target = resolvePasteTarget({
      activeCell: { row: 0, col: 3 },
      selection: { min: { row: 0, col: 3 }, max: { row: 0, col: 3 } },
      buffer: { values: [["day", "night"]], text: "" },
      rowCount: 3,
      colCount: 5,
    })
    expect(target).toEqual({ min: { row: 0, col: 3 }, max: { row: 0, col: 4 } })
  })

  it("обрезает растекание по правой границе периода", () => {
    const target = resolvePasteTarget({
      activeCell: { row: 0, col: 4 },
      selection: null,
      buffer: { values: [["day", "night"]], text: "" },
      rowCount: 3,
      colCount: 5,
    })
    expect(target).toEqual({ min: { row: 0, col: 4 }, max: { row: 0, col: 4 } })
  })
})

describe("parseClipboardText", () => {
  it("понимает \\r\\n и хвостовой перевод строки из Excel", () => {
    expect(parseClipboardText("day\tnight\r\n8\t\r\n")?.values).toEqual([
      ["day", "night"],
      ["8", ""],
    ])
  })

  it("пустой текст → null", () => {
    expect(parseClipboardText("")).toBeNull()
    expect(parseClipboardText("\n")).toBeNull()
  })
})
