import { describe, expect, it } from "vitest"
import { resolveFillRoute } from "./resolveFillRoute"
import type { DraftFormData } from "./api"

function formData(partial: Partial<DraftFormData>): DraftFormData {
  return {
    kind: "order",
    is_group: false,
    order_type_code: null,
    data: [],
    employees: null,
    ...partial,
  }
}

describe("resolveFillRoute", () => {
  it("ведёт на /orders для обычного одиночного приказа", () => {
    expect(resolveFillRoute(formData({ order_type_code: "hire" }))).toBe("/orders")
  })

  it("ведёт на /vacations для оплачиваемого отпуска", () => {
    expect(resolveFillRoute(formData({ order_type_code: "vacation_paid" }))).toBe("/vacations")
  })

  it("ведёт на /vacations/recall для отзыва из отпуска", () => {
    expect(resolveFillRoute(formData({ order_type_code: "vacation_recall" }))).toBe("/vacations/recall")
  })

  it("ведёт на /vacations/postpone для переноса отпуска", () => {
    expect(resolveFillRoute(formData({ order_type_code: "vacation_postpone" }))).toBe("/vacations/postpone")
  })

  it("ведёт на /vacations/extension для продления отпуска", () => {
    expect(resolveFillRoute(formData({ order_type_code: "vacation_extension" }))).toBe("/vacations/extension")
  })

  it("ведёт на /unpaid-leaves для отпуска за свой счёт", () => {
    expect(resolveFillRoute(formData({ order_type_code: "vacation_unpaid" }))).toBe("/unpaid-leaves")
  })

  it("ведёт на /weekend-calls для вызова в выходной", () => {
    expect(resolveFillRoute(formData({ order_type_code: "weekend_call" }))).toBe("/weekend-calls")
  })

  it("ведёт на /unpaid-leaves для группового отпуска за свой счёт", () => {
    expect(
      resolveFillRoute(formData({ is_group: true, order_type_code: "vacation_unpaid_group" }))
    ).toBe("/unpaid-leaves")
  })

  it("ведёт на /weekend-calls для группового вызова в выходной", () => {
    expect(
      resolveFillRoute(formData({ is_group: true, order_type_code: "weekend_call_group" }))
    ).toBe("/weekend-calls")
  })

  it("ведёт на /orders/notifications для уведомления", () => {
    expect(resolveFillRoute(formData({ kind: "notification" }))).toBe("/orders/notifications")
  })

  it("ведёт на /orders/statements для заявления", () => {
    expect(resolveFillRoute(formData({ kind: "statement" }))).toBe("/orders/statements")
  })
})
