import { describe, expect, it } from "vitest"
import { computeCellDisplay } from "./TimesheetDayCell"
import type { ShiftTypeMap } from "./types"
import type { TimesheetCellDay, TimesheetFactCell } from "@/entities/timesheet"

const shiftTypeMap: ShiftTypeMap = {
  day: {
    code: "day",
    name: "День (08:00-16:30)",
    start_time: "08:00",
    end_time: "16:30",
    planned_hours: 8,
    is_working: true,
    is_night: false,
    sort_order: 10,
    color: "#10b981",
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
  sick: {
    code: "sick",
    name: "Больничный",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 120,
    color: "#ef4444",
    letter: "Б",
  },
  A: {
    code: "A",
    name: "За свой счет",
    start_time: null,
    end_time: null,
    planned_hours: 0,
    is_working: false,
    is_night: false,
    sort_order: 125,
    color: "#a855f7",
    letter: "А",
  },
}

const vacation = [
  { type: "vacation" as const, start_date: "2026-04-01", end_date: "2026-04-05", vacation_type: "Трудовой" },
]

const vacationPlusSick = [
  { type: "vacation" as const, start_date: "2026-04-01", end_date: "2026-04-05", vacation_type: "Трудовой" },
  { type: "sick_leave" as const, start_date: "2026-04-03", end_date: "2026-04-07" },
]

describe("computeCellDisplay (трёхслойная ячейка)", () => {
  it("день отпуска без правок показывает авто-значение", () => {
    const cell: TimesheetCellDay = {
      auto: { shift_type_code: "vacation", source: "vacation", order_id: null },
      manual: null,
      result: "vacation",
      conflict: false,
      order_changed: false,
    }
    const d = computeCellDisplay(undefined, undefined, vacation, shiftTypeMap, "2026-04-01", cell)
    expect(d.label).toBe("О")
    expect(d.tooltip).toContain("Отпуск")
  })

  it("конфликт отпуск+больничный показывает итог (больничный), а не отпуск", () => {
    const cell: TimesheetCellDay = {
      auto: { shift_type_code: "sick", source: "sick_leave", order_id: null },
      manual: null,
      result: "sick",
      conflict: true,
      order_changed: false,
    }
    const d = computeCellDisplay(undefined, undefined, vacationPlusSick, shiftTypeMap, "2026-04-04", cell)
    expect(d.label).toBe("Б")
    expect(d.tooltip).toContain("конфликт")
  })

  it("ручная смена поверх отпуска отображается как часы и не прячет авто", () => {
    const cell: TimesheetCellDay = {
      auto: { shift_type_code: "vacation", source: "vacation", order_id: null },
      manual: { shift_type_code: "day", planned_hours_override: null, note: null },
      result: "day",
      conflict: false,
      order_changed: false,
    }
    const d = computeCellDisplay(undefined, undefined, vacation, shiftTypeMap, "2026-04-02", cell)
    expect(d.label).toBe("8")
    expect(d.tooltip).toContain("вручную")
  })

  it("отпуск за свой счет показывает букву А", () => {
    const unpaid = [
      { type: "vacation" as const, start_date: "2026-04-01", end_date: "2026-04-01", vacation_type: "Отпуск за свой счет" },
    ]
    const cell: TimesheetCellDay = {
      auto: { shift_type_code: "A", source: "vacation", order_id: null },
      manual: null,
      result: "A",
      conflict: false,
      order_changed: false,
    }
    const d = computeCellDisplay(undefined, undefined, unpaid, shiftTypeMap, "2026-04-01", cell)
    expect(d.label).toBe("А")
  })

  it("ручная смена поверх отпуска с фактом подсвечивает расхождение плана и факта", () => {
    const cell: TimesheetCellDay = {
      auto: { shift_type_code: "vacation", source: "vacation", order_id: null },
      manual: { shift_type_code: "day", planned_hours_override: null, note: null },
      result: "day",
      conflict: false,
      order_changed: false,
    }
    const fact: TimesheetFactCell = {
      presence_hours: 8,
      work_hours: 8,
      absence_hours: 0,
      debt_hours: 0,
      night_hours: 0,
      overtime_hours: 0,
      schedule_name: null,
    }
    const d = computeCellDisplay(undefined, fact, vacation, shiftTypeMap, "2026-04-02", cell)
    expect(d.label).toBe("8")
    expect(d.color).toContain("amber")
  })
})
