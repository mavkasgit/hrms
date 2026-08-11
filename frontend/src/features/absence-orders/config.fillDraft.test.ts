import { describe, expect, it } from "vitest"
import type { DraftFormData } from "@/entities/draft"
import { mapUnpaidSingleFillDraft, mapWeekendCallSingleFillDraft } from "./config"

function formData(partial: Partial<DraftFormData>): DraftFormData {
  return {
    kind: "order",
    is_group: false,
    order_type_code: "vacation_unpaid",
    data: [],
    employees: null,
    ...partial,
  }
}

describe("mapUnpaidSingleFillDraft", () => {
  it("маппит данные одиночного отпуска за свой счёт в черновик формы", () => {
    const draft = mapUnpaidSingleFillDraft(
      formData({
        data: [
          { key: "employee_id", value: "7" },
          { key: "number", value: "Б-3" },
          { key: "date", value: "2026-08-01" },
          { key: "vacation_start", value: "2026-08-05" },
          { key: "vacation_end", value: "2026-08-07" },
          { key: "vacation_days", value: "3" },
        ],
      })
    )
    expect(draft).toEqual({
      employee_id: 7,
      order_date: "2026-08-01",
      order_number: "Б-3",
      mode: "single",
      vacation_start: "2026-08-05",
      vacation_end: "2026-08-07",
      vacation_days: "3",
      call_date: "",
      call_date_start: "",
      call_date_end: "",
      saved_at: expect.any(String),
    })
  })

  it("возвращает null для группового черновика", () => {
    expect(mapUnpaidSingleFillDraft(formData({ is_group: true }))).toBeNull()
  })

  it("возвращает null для черновика другого типа", () => {
    expect(mapUnpaidSingleFillDraft(formData({ order_type_code: "hire" }))).toBeNull()
  })
})

describe("mapWeekendCallSingleFillDraft", () => {
  it("маппит данные одиночного вызова в выходной (режим single)", () => {
    const draft = mapWeekendCallSingleFillDraft(
      formData({
        order_type_code: "weekend_call",
        data: [
          { key: "employee_id", value: "7" },
          { key: "number", value: "В-3" },
          { key: "date", value: "2026-08-01" },
          { key: "call_date", value: "2026-08-08" },
        ],
      })
    )
    expect(draft).toEqual({
      employee_id: 7,
      order_date: "2026-08-01",
      order_number: "В-3",
      mode: "single",
      vacation_start: "",
      vacation_end: "",
      vacation_days: "",
      call_date: "2026-08-08",
      call_date_start: "",
      call_date_end: "",
      saved_at: expect.any(String),
    })
  })

  it("маппит данные одиночного вызова (режим range) по наличию call_date_start/end", () => {
    const draft = mapWeekendCallSingleFillDraft(
      formData({
        order_type_code: "weekend_call",
        data: [
          { key: "employee_id", value: "7" },
          { key: "number", value: "В-3" },
          { key: "date", value: "2026-08-01" },
          { key: "call_date_start", value: "2026-08-08" },
          { key: "call_date_end", value: "2026-08-09" },
        ],
      })
    )
    expect(draft).toEqual({
      employee_id: 7,
      order_date: "2026-08-01",
      order_number: "В-3",
      mode: "range",
      vacation_start: "",
      vacation_end: "",
      vacation_days: "",
      call_date: "",
      call_date_start: "2026-08-08",
      call_date_end: "2026-08-09",
      saved_at: expect.any(String),
    })
  })

  it("возвращает null для группового черновика", () => {
    expect(mapWeekendCallSingleFillDraft(formData({ order_type_code: "weekend_call", is_group: true }))).toBeNull()
  })
})
