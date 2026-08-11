import { describe, expect, it } from "vitest"
import type { DraftFormData } from "@/entities/draft"
import { mapVacationFillDraft } from "./VacationsPage"

function formData(partial: Partial<DraftFormData>): DraftFormData {
  return {
    kind: "order",
    is_group: false,
    order_type_code: "vacation_paid",
    data: [],
    employees: null,
    ...partial,
  }
}

describe("mapVacationFillDraft", () => {
  it("маппит данные черновика оплачиваемого отпуска в черновик формы", () => {
    const draft = mapVacationFillDraft(
      formData({
        order_type_code: "vacation_paid",
        data: [
          { key: "employee_id", value: "42" },
          { key: "order_type_id", value: "7" },
          { key: "number", value: "В-12" },
          { key: "date", value: "2026-08-01" },
          { key: "vacation_start", value: "2026-08-10" },
          { key: "vacation_end", value: "2026-08-24" },
          { key: "vacation_days", value: "15" },
          { key: "vacation_type", value: "Трудовой" },
        ],
      })
    )
    expect(draft).toEqual({
      employee_id: 42,
      start_date: "2026-08-10",
      end_date: "2026-08-24",
      order_date: "2026-08-01",
      order_number: "В-12",
      saved_at: expect.any(String),
    })
  })

  it("возвращает null для черновика не-отпуска", () => {
    expect(mapVacationFillDraft(formData({ order_type_code: "hire" }))).toBeNull()
    expect(mapVacationFillDraft(formData({ kind: "notification" }))).toBeNull()
  })

  it("возвращает null для группового черновика", () => {
    expect(mapVacationFillDraft(formData({ is_group: true }))).toBeNull()
  })
})
