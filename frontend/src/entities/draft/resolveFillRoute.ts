import type { DraftFormData } from "./api"

/**
 * Базовый маршрут страницы создания документа для черновика (кнопка
 * «Заполнить поля»). Документы с выделенной страницей создания (отпуска,
 * отсутствия) ведут на неё, остальные приказы — на /orders (#100).
 */
export function resolveFillRoute(data: DraftFormData): string {
  if (data.kind === "notification") return "/orders/notifications"
  if (data.kind === "statement") return "/orders/statements"
  if (data.is_group) {
    return data.order_type_code === "vacation_unpaid_group" ? "/unpaid-leaves" : "/weekend-calls"
  }
  switch (data.order_type_code) {
    case "vacation_paid":
      return "/vacations"
    case "vacation_recall":
      return "/vacations/recall"
    case "vacation_postpone":
      return "/vacations/postpone"
    case "vacation_extension":
      return "/vacations/extension"
    case "vacation_unpaid":
      return "/unpaid-leaves"
    case "weekend_call":
      return "/weekend-calls"
    default:
      return "/orders"
  }
}
