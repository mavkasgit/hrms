import { useCallback, useEffect, useRef, type MutableRefObject, type ReactElement } from "react"
import { useSearchParams } from "react-router-dom"
import { getFormDraftSlot } from "./slots"
import { useFormDraftRecovery } from "./useFormDraftRecovery"
import { FormDraftOverwriteDialog } from "./FormDraftOverwriteDialog"

export interface UseDraftRecoveryForOptions<T extends { saved_at: string }> {
  /** Таргет слота черновика формы (orders, vacations:recall, …). */
  slot: string
  /** Текущие значения формы (для автосохранения). */
  formState: Omit<T, "saved_at">
  /** Есть ли в форме хоть что-то заполненное (чтобы не сохранять пустоту). */
  hasContent: (state: Omit<T, "saved_at">) => boolean
  /**
   * Вызывается при восстановлении — хост заполняет форму.
   * Верни true, если восстановление изменило поле, при смене которого хост
   * сбрасывает другие поля формы (тип приказа/уведомления, отпуск). Тогда
   * хост-сброс будет пропущен один раз (см. restoreGuardRef).
   */
  onRestore: (draft: T) => boolean | void
  /** Авто-восстановление по query-параметру слота (?recover=1 по умолчанию, true). */
  autoRestoreOnRecover?: boolean
}

export interface UseDraftRecoveryForResult<T extends { saved_at: string }> {
  /** Восстановить форму из сохранённого черновика. */
  restore: () => void
  /** Заполнить форму данными явного черновика (например, серверного — fillDraftId). */
  restoreWith: (draft: T) => void
  /** Очистить черновик после успешного создания документа / сброса формы. */
  clear: () => void
  /** Диалог подтверждения перезаписи черновика — рендерится хостом один раз. */
  overwriteDialog: ReactElement
  /**
   * Флаг «последнее восстановление изменило поле, при смене которого хост
   * сбрасывает форму». Хост читает его в своём эффекте сброса и сбрасывает
   * в false, чтобы пропустить сброс ровно один раз.
   */
  restoreGuardRef: MutableRefObject<boolean>
}

/**
 * Обёртка над useFormDraftRecovery для одной формы (#28): убирает из страниц
 * повторяющуюся обвязку — резолв storageKey по слоту реестра, автовосстановление
 * по query-параметру слота (?recover=1 / ?recoverGroup=1) и диалог перезаписи.
 * Функционал тот же, правки в одном месте.
 */
export function useDraftRecoveryFor<T extends { saved_at: string }>(
  options: UseDraftRecoveryForOptions<T>,
): UseDraftRecoveryForResult<T> {
  const slot = getFormDraftSlot(options.slot)
  // Хост-сброс формы (extra fields при смене типа, поля при смене отпуска)
  // пропускается один раз после восстановления (#50).
  const restoreGuardRef = useRef(false)

  const handleRestore = useCallback(
    (draft: T) => {
      const changedResetField = options.onRestore(draft)
      if (changedResetField) restoreGuardRef.current = true
    },
    [options.onRestore],
  )

  const recovery = useFormDraftRecovery<T>({
    storageKey: slot.storageKey,
    formState: options.formState,
    hasContent: options.hasContent,
    onRestore: handleRestore,
  })

  const restoreWith = useCallback((draft: T) => {
    // Не очищаем черновик и не помечаем dirty: хост сам управляет формой,
    // а черновик (например, серверный) после этого живёт дальше.
    handleRestore(draft)
  }, [handleRestore])

  const [searchParams] = useSearchParams()
  const autoRestore = options.autoRestoreOnRecover ?? true
  const { pendingDraft, restore } = recovery
  const recoverParam = slot.recoverParam ?? "recover"

  useEffect(() => {
    if (autoRestore && searchParams.get(recoverParam) === "1" && pendingDraft) {
      restore()
    }
  }, [autoRestore, searchParams, pendingDraft, restore, recoverParam])

  return {
    restore,
    restoreWith,
    clear: recovery.clear,
    overwriteDialog: (
      <FormDraftOverwriteDialog
        open={recovery.overwritePrompt}
        entityLabel={slot.label}
        onCancel={recovery.cancelOverwrite}
        onConfirm={recovery.confirmOverwrite}
      />
    ),
    restoreGuardRef,
  }
}
