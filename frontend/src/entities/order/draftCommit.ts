import { commitGroupDraft, commitOrderDraft } from "./onlyofficeApi"
import type { Order } from "./types"

/** Результат commit черновика: приказ или сигнал о уже созданном (duplicate). */
export type CommitDraftResult = Order | { message: string; duplicate: true }

/**
 * Выбор commit-эндпоинта черновика приказа по флагу группового черновика (#86).
 * Одиночный черновик → `/orders/drafts/{id}/commit`, групповой → `/orders/group-drafts/{id}/commit`.
 */
export function selectDraftCommit(isGroup: boolean): (draftId: string) => Promise<CommitDraftResult> {
  return isGroup ? commitGroupDraft : commitOrderDraft
}
