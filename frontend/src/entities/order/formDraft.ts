import { getFormDraftSlot } from "@/entities/form-draft"

export const ORDER_FORM_DRAFT_KEY = getFormDraftSlot("orders").storageKey

export interface OrderFormDraft {
  employee_id: number | null
  order_type_id: number | null
  order_date: string
  order_number: string
  extra_fields: Record<string, string | number>
  saved_at: string
}

/** Есть ли в форме приказа хоть что-то заполненное (кроме даты по умолчанию). */
export function orderFormHasContent(state: Omit<OrderFormDraft, "saved_at">): boolean {
  return (
    state.employee_id !== null ||
    state.order_type_id !== null ||
    state.order_number.trim() !== "" ||
    Object.values(state.extra_fields).some((v) => v !== "" && v !== null && v !== undefined)
  )
}
