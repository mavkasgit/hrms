import { fetchDraftFormData } from "./api"

/**
 * «Заполнить» форму данными черновика из попапа/страницы черновиков: переводит
 * на страницу создания соответствующего документа и заполняет форму.
 * Все виды (включая одиночный приказ) идут через единый ?fillDraftId —
 * страница сама тянет form-data и заполняет форму.
 */
export async function fillFormFromDraft(
  draftId: string,
  navigate: (to: string) => void
): Promise<void> {
  const data = await fetchDraftFormData(draftId)

  if (data.kind === "notification") {
    navigate(`/orders/notifications?fillDraftId=${encodeURIComponent(draftId)}`)
    return
  }
  if (data.kind === "statement") {
    navigate(`/orders/statements?fillDraftId=${encodeURIComponent(draftId)}`)
    return
  }
  if (data.kind === "order" && data.is_group) {
    const route = data.order_type_code === "vacation_unpaid_group" ? "/unpaid-leaves" : "/weekend-calls"
    navigate(`${route}?fillDraftId=${encodeURIComponent(draftId)}`)
    return
  }
  // Одиночный приказ: та же страница приказов, тот же ?fillDraftId (#28).
  navigate(`/orders?fillDraftId=${encodeURIComponent(draftId)}`)
}
