import { fetchDraftFormData } from "./api"
import { resolveFillRoute } from "./resolveFillRoute"

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
  navigate(`${resolveFillRoute(data)}?fillDraftId=${encodeURIComponent(draftId)}`)
}
