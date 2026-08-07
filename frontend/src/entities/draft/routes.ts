/**
 * Маршруты черновиков. Черновики собираются со всех разделов (приказы, отпуска,
 * вызовы, больничные…), поэтому живут на отдельном роуте /drafts, а не под /orders.
 */
export const DRAFTS_ROUTE = "/drafts"

/** Режим открытия редактора OnlyOffice. */
export type DraftEditorMode = "edit" | "view"

/** URL страницы редактора черновика. */
export function draftEditorUrl(draftId: string, mode: DraftEditorMode = "edit"): string {
  return `${DRAFTS_ROUTE}/${draftId}/${mode}-docx`
}

/** Является ли pathname страницей/разделом черновиков. */
export function isDraftsRoute(pathname: string): boolean {
  return pathname === DRAFTS_ROUTE || pathname.startsWith(`${DRAFTS_ROUTE}/`)
}
