import { useCallback } from "react"
import { fetchDraftFormData } from "@/entities/draft"
import { selectDraftCommit, type CommitDraftResult } from "./draftCommit"

/**
 * Commit черновика приказа из редактора (#86).
 *
 * Перед commit запрашивает данные черновика и по флагу `is_group` выбирает
 * групповой (`commitGroupDraft`) или одиночный (`commitOrderDraft`) эндпоинт.
 */
export function useDraftCommit(draftId: string | null) {
  const commit = useCallback(
    async (): Promise<CommitDraftResult> => {
      if (!draftId) throw new Error("Черновик не найден для сохранения")
      const data = await fetchDraftFormData(draftId)
      return selectDraftCommit(data.is_group)(draftId)
    },
    [draftId]
  )

  return { commit }
}
