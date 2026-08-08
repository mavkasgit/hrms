import { describe, expect, it } from "vitest"
import { orderFormHasContent, type OrderFormDraft } from "./formDraft"

function state(over: Partial<Omit<OrderFormDraft, "saved_at">> = {}): Omit<OrderFormDraft, "saved_at"> {
  return {
    employee_id: null,
    order_type_id: null,
    order_date: "2026-01-10",
    order_number: "",
    extra_fields: {},
    ...over,
  }
}

describe("orderFormHasContent (#87)", () => {
  it("только автоподставленный номер приказа не считается контентом", () => {
    expect(orderFormHasContent(state({ order_number: "5" }))).toBe(false)
  })

  it("выбор сотрудника/типа или заполненные контрактные поля считаются контентом", () => {
    expect(orderFormHasContent(state({ employee_id: 1 }))).toBe(true)
    expect(orderFormHasContent(state({ order_type_id: 2 }))).toBe(true)
    expect(orderFormHasContent(state({ extra_fields: { contract_number: "ABC" } }))).toBe(true)
  })

  it("пустая форма контентом не считается (дата по умолчанию игнорируется)", () => {
    expect(orderFormHasContent(state())).toBe(false)
  })
})
