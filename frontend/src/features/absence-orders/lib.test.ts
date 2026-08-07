import { describe, expect, it } from "vitest"
import type { Order } from "@/entities/order/types"
import {
  buildSummaryRows,
  calcDays,
  calculateVacationEnd,
  callPeriodLabel,
  overlapDays,
  totalDaysOf,
  toUnpaidLeaveEntries,
  toWeekendCallEntries,
} from "./lib"

function singleOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    order_number: "1",
    order_type_id: 1,
    order_type_name: "t",
    order_type_code: "vacation_unpaid",
    employee_id: 1,
    employee_name: "Иван Иванов",
    order_date: "2026-04-01",
    created_date: null,
    file_path: null,
    display_name: null,
    notes: null,
    extra_fields: {},
    is_group: false,
    ...overrides,
  }
}

describe("toUnpaidLeaveEntries", () => {
  it("одиночный приказ с диапазоном и днями", () => {
    const order = singleOrder({
      extra_fields: {
        vacation_start: "2026-04-10T00:00:00",
        vacation_end: "2026-04-12",
        vacation_days: 3,
      },
    })
    expect(toUnpaidLeaveEntries(order)).toEqual([
      { orderId: 1, employeeName: "Иван Иванов", range: { start: "2026-04-10", end: "2026-04-12" }, explicitDays: 3 },
    ])
  })

  it("перевёрнутый диапазон нормализуется", () => {
    const order = singleOrder({
      extra_fields: { vacation_start: "2026-04-12", vacation_end: "2026-04-10" },
    })
    const [entry] = toUnpaidLeaveEntries(order)
    expect(entry.range).toEqual({ start: "2026-04-10", end: "2026-04-12" })
  })

  it("групповой приказ разворачивается по сотрудникам", () => {
    const order = singleOrder({
      is_group: true,
      employee_name: null,
      group_employee_count: 2,
      group_employees: [
        {
          employee_id: 1,
          employee_full_name: "А",
          position: null,
          department: null,
          vacation_start: "2026-04-10",
          vacation_end: "2026-04-11",
          vacation_days: 2,
        },
        {
          employee_id: 2,
          employee_full_name: "Б",
          position: null,
          department: null,
          vacation_start: "2026-05-01",
          vacation_end: "2026-05-02",
          vacation_days: 2,
        },
      ],
    })
    expect(toUnpaidLeaveEntries(order)).toHaveLength(2)
    expect(toUnpaidLeaveEntries(order)[1]).toMatchObject({ employeeName: "Б", explicitDays: 2 })
  })

  it("пустые поля — без записей", () => {
    expect(toUnpaidLeaveEntries(singleOrder())).toEqual([])
  })
})

describe("toWeekendCallEntries", () => {
  it("одиночный вызов по call_date", () => {
    const order = singleOrder({ order_type_code: "weekend_call", extra_fields: { call_date: "2026-04-04" } })
    expect(toWeekendCallEntries(order)).toEqual([
      { orderId: 1, employeeName: "Иван Иванов", range: { start: "2026-04-04", end: "2026-04-04" }, explicitDays: null },
    ])
  })

  it("вызов диапазоном по call_date_start/end", () => {
    const order = singleOrder({
      order_type_code: "weekend_call",
      extra_fields: { call_date_start: "2026-04-10", call_date_end: "2026-04-12" },
    })
    const [entry] = toWeekendCallEntries(order)
    expect(entry.range).toEqual({ start: "2026-04-10", end: "2026-04-12" })
    expect(entry.explicitDays).toBeNull()
  })
})

describe("сводка", () => {
  const entries = [
    { orderId: 1, employeeName: "А", range: { start: "2026-04-05", end: "2026-04-07" }, explicitDays: 3 },
    { orderId: 2, employeeName: "Б", range: { start: "2026-04-10", end: "2026-04-12" }, explicitDays: 3 },
  ]

  it("дни за период без фильтра", () => {
    const rows = buildSummaryRows(entries, "", "")
    expect(rows).toEqual([
      { name: "А", count: 1, days: 3 },
      { name: "Б", count: 1, days: 3 },
    ])
    expect(totalDaysOf(entries, "", "")).toBe(6)
  })

  it("частичное пересечение с периодом", () => {
    const rows = buildSummaryRows(entries, "2026-04-01", "2026-04-07")
    expect(rows[0]).toEqual({ name: "А", count: 1, days: 3 })
    expect(totalDaysOf(entries, "2026-04-01", "2026-04-07")).toBe(3)
  })

  it("без явных дней считает по диапазону (weekend)", () => {
    const weekend = [
      { orderId: 1, employeeName: "А", range: { start: "2026-04-10", end: "2026-04-12" }, explicitDays: null },
    ]
    expect(totalDaysOf(weekend, "", "")).toBe(3)
  })
})

describe("даты", () => {
  it("calcDays считает дни включительно", () => {
    expect(calcDays("2026-04-10", "2026-04-12")).toBe("3")
    expect(calcDays("2026-04-12", "2026-04-10")).toBe("")
  })

  it("calculateVacationEnd = начало + дни - 1", () => {
    expect(calculateVacationEnd("2026-04-10", 3)).toBe("2026-04-12")
    expect(calculateVacationEnd("", 3)).toBe("")
  })

  it("overlapDays с периодом", () => {
    expect(overlapDays({ start: "2026-04-05", end: "2026-04-07" }, "2026-04-01", "2026-04-07")).toBe(3)
    expect(overlapDays({ start: "2026-04-05", end: "2026-04-07" }, "2026-04-01", "2026-04-04")).toBe(0)
  })
})

describe("callPeriodLabel", () => {
  it("одиночный день", () => {
    expect(callPeriodLabel({ call_date: "2026-04-04" })).toBe("04.04.2026")
  })
  it("диапазон", () => {
    expect(callPeriodLabel({ call_date_start: "2026-04-10", call_date_end: "2026-04-12" })).toBe("10.04.2026 — 12.04.2026")
  })
  it("пусто", () => {
    expect(callPeriodLabel({})).toBe("—")
  })
})
