import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useDraftFormData } from "@/entities/draft"
import type { DraftFormData } from "@/entities/draft"

/**
 * Единая обвязка «Заполнить поля» из попапа черновиков: /orders?fillDraftId=… .
 * Читает параметр, грузит данные серверного черновика, маппит их в черновик формы
 * и восстанавливает форму через общий onRestore. Параметр убирается из URL, чтобы
 * повторный вход не перезаполнял форму. Если маппер вернул null (черновик другого
 * вида) — ничего не восстанавливается и URL не трогается.
 *
 * @param onRestore   Общий обработчик восстановления формы (например, restoreWith
 *                    из useDraftRecoveryFor).
 * @param mapToDraft  Маппинг form-data серверного черновика в черновик формы;
 *                    null — черновик не подходит (no-op).
 * @param cleanUrl    Куда убрать ?fillDraftId после восстановления.
 */
export function useFillDraftIdRestore<T extends { saved_at: string }>(
  onRestore: (draft: T) => void,
  mapToDraft: (data: DraftFormData) => T | null,
  cleanUrl: string,
): void {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const fillDraftId = searchParams.get("fillDraftId")
  const { data: fillFormData } = useDraftFormData(fillDraftId)

  useEffect(() => {
    if (!fillFormData) return
    const draft = mapToDraft(fillFormData)
    if (!draft) return
    onRestore(draft)
    // Убираем параметр, чтобы повторный вход не перезаполнял форму.
    navigate(cleanUrl, { replace: true })
  }, [fillFormData, mapToDraft, onRestore, cleanUrl, navigate])
}
