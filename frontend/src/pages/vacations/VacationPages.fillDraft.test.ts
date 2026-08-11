import { describe, expect, it } from "vitest"
import type { DraftFormData } from "@/entities/draft"
import { mapRecallFillDraft } from "./VacationRecallPage"
import { mapPostponeFillDraft } from "./VacationPostponePage"
import { mapExtensionFillDraft } from "./VacationExtensionPage"

function formData(orderTypeCode: string, extra: [string, string][]): DraftFormData {
  return {
    kind: "order",
    is_group: false,
    order_type_code: orderTypeCode,
    data: [
      { key: "employee_id", value: "42" },
      { key: "number", value: "В-12" },
      { key: "date", value: "2026-08-01" },
      ...extra.map(([key, value]) => ({ key, value })),
    ],
    employees: null,
  }
}

describe("mapRecallFillDraft", () => {
  it("маппит данные черновика отзыва в черновик формы (отпуск выбирается заново)", () => {
    const draft = mapRecallFillDraft(
      formData("vacation_recall", [
        ["recall_date", "2026-08-15"],
        ["old_vacation_start", "2026-08-10"],
        ["old_vacation_end", "2026-08-24"],
        ["old_vacation_days", "15"],
      ])
    )
    expect(draft).toEqual({
      vacation: null,
      recall_date: "2026-08-15",
      order_date: "2026-08-01",
      order_number: "В-12",
      saved_at: expect.any(String),
    })
  })

  it("возвращает null для черновика не-отзыва", () => {
    expect(mapRecallFillDraft(formData("hire", []))).toBeNull()
  })
})

describe("mapPostponeFillDraft", () => {
  it("маппит данные черновика переноса в черновик формы (отпуск выбирается заново)", () => {
    const draft = mapPostponeFillDraft(
      formData("vacation_postpone", [
        ["postpone_range_start", "2026-09-01"],
        ["postpone_range_end", "2026-09-14"],
        ["old_vacation_start", "2026-08-10"],
        ["old_vacation_end", "2026-08-24"],
        ["old_vacation_days", "15"],
        ["postponed_days", "14"],
        ["used_days", "1"],
      ])
    )
    expect(draft).toEqual({
      vacation: null,
      postpone_start_date: "2026-09-01",
      postpone_end_date: "2026-09-14",
      order_date: "2026-08-01",
      order_number: "В-12",
      saved_at: expect.any(String),
    })
  })

  it("возвращает null для черновика не-переноса", () => {
    expect(mapPostponeFillDraft(formData("hire", []))).toBeNull()
  })
})

describe("mapExtensionFillDraft", () => {
  it("маппит данные черновика продления в черновик формы (отпуск выбирается заново)", () => {
    const draft = mapExtensionFillDraft(
      formData("vacation_extension", [
        ["vacation_start", "2026-08-10"],
        ["vacation_end", "2026-08-24"],
        ["vacation_days", "15"],
        ["period_start", "2026-08-25"],
        ["period_end", "2026-08-29"],
      ])
    )
    expect(draft).toEqual({
      vacation: null,
      period_start: "2026-08-25",
      period_end: "2026-08-29",
      order_date: "2026-08-01",
      order_number: "В-12",
      saved_at: expect.any(String),
    })
  })

  it("возвращает null для черновика не-продления", () => {
    expect(mapExtensionFillDraft(formData("hire", []))).toBeNull()
  })
})
