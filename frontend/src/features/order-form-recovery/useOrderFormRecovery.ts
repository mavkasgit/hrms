import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Восстановление несохранённого заполнения формы создания приказа (#28).
 *
 * Один слот на пользователя/браузер. Заполнение сохраняется debounced
 * в localStorage и переживает перезагрузку/закрытие вкладки.
 * При следующем открытии страницы показывается уведомление с действиями
 * «Восстановить» / «Не сейчас» / «Удалить».
 */

const STORAGE_KEY = "hrms_order_form_draft"
const DEBOUNCE_MS = 800

export interface OrderFormDraft {
  employee_id: number | null
  order_type_id: number | null
  order_date: string
  order_number: string
  extra_fields: Record<string, string | number>
  saved_at: string
}

interface UseOrderFormRecoveryOptions {
  /** Текущие значения формы (для автосохранения) */
  formState: {
    employee_id: number | null
    order_type_id: number | null
    order_date: string
    order_number: string
    extra_fields: Record<string, string | number>
  }
  /** Вызывается при восстановлении — хост заполняет форму */
  onRestore: (draft: OrderFormDraft) => void
}

interface UseOrderFormRecoveryResult {
  /** Найденный черновик (для показа уведомления) */
  pendingDraft: OrderFormDraft | null
  /** Восстановить форму из черновика */
  restore: () => void
  /** Скрыть уведомление до следующего раза (черновик остаётся) */
  dismiss: () => void
  /** Удалить сохранённый черновик */
  remove: () => void
  /** Подтвердить перезапись существующего черновика при новом заполнении */
  confirmOverwrite: () => void
  /** Нужно ли показать диалог подтверждения перезаписи */
  overwritePrompt: boolean
  /** Отменить перезапись (продолжить без сохранения) */
  cancelOverwrite: () => void
}

function readDraft(): OrderFormDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as OrderFormDraft
  } catch {
    return null
  }
}

function writeDraft(state: UseOrderFormRecoveryOptions["formState"]): void {
  const draft: OrderFormDraft = {
    ...state,
    saved_at: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
}

function clearDraft(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Есть ли в форме хоть что-то заполненное (кроме даты по умолчанию) */
function hasContent(state: UseOrderFormRecoveryOptions["formState"]): boolean {
  return (
    state.employee_id !== null ||
    state.order_type_id !== null ||
    state.order_number.trim() !== "" ||
    Object.values(state.extra_fields).some((v) => v !== "" && v !== null && v !== undefined)
  )
}

export function useOrderFormRecovery({
  formState,
  onRestore,
}: UseOrderFormRecoveryOptions): UseOrderFormRecoveryResult {
  const [pendingDraft, setPendingDraft] = useState<OrderFormDraft | null>(null)
  const [overwritePrompt, setOverwritePrompt] = useState(false)
  const dismissedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const existingDraftRef = useRef<OrderFormDraft | null>(null)
  const overwriteConfirmedRef = useRef(false)
  const overwriteCancelledRef = useRef(false)
  const formStateRef = useRef(formState)
  formStateRef.current = formState

  // При монтировании: проверяем наличие сохранённого черновика
  useEffect(() => {
    const draft = readDraft()
    if (draft) {
      existingDraftRef.current = draft
      if (!dismissedRef.current) {
        setPendingDraft(draft)
      }
    }
  }, [])

  // Debounced автосохранение при изменении формы
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!hasContent(formState)) return

    debounceRef.current = setTimeout(() => {
      // Диалог перезаписи запрашиваем только для черновика, который существовал
      // ДО начала текущего заполнения (снапшот с mount). Черновик, сохранённый
      // автосейвом этой же сессии, перезаписывается тихо (#49).
      if (existingDraftRef.current && !overwriteConfirmedRef.current && !overwriteCancelledRef.current) {
        setOverwritePrompt(true)
        return
      }
      // После отмены перезаписи не сохраняем (пользователь осознанно отказался)
      if (overwriteCancelledRef.current && !overwriteConfirmedRef.current) return
      writeDraft(formStateRef.current)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [formState.employee_id, formState.order_type_id, formState.order_date, formState.order_number, formState.extra_fields])

  // Flush на закрытие/скрытие вкладки (#51): пишем черновик синхронно, чтобы
  // последний ввод не терялся, если debounce ещё не отработал.
  useEffect(() => {
    const handlePageHide = () => {
      if (!hasContent(formStateRef.current)) return
      // Те же гейты, что и в debounced автосейве
      if (existingDraftRef.current && !overwriteConfirmedRef.current && !overwriteCancelledRef.current) return
      if (overwriteCancelledRef.current && !overwriteConfirmedRef.current) return
      writeDraft(formStateRef.current)
    }
    window.addEventListener("pagehide", handlePageHide)
    return () => window.removeEventListener("pagehide", handlePageHide)
  }, [])

  const restore = useCallback(() => {
    const draft = pendingDraft ?? readDraft()
    if (draft) {
      onRestore(draft)
      // После восстановления очищаем черновик — он больше не нужен
      clearDraft()
      existingDraftRef.current = null
      overwriteConfirmedRef.current = true
    }
    setPendingDraft(null)
  }, [pendingDraft, onRestore])

  const dismiss = useCallback(() => {
    dismissedRef.current = true
    setPendingDraft(null)
  }, [])

  const remove = useCallback(() => {
    clearDraft()
    existingDraftRef.current = null
    overwriteConfirmedRef.current = true
    setPendingDraft(null)
  }, [])

  const confirmOverwrite = useCallback(() => {
    overwriteConfirmedRef.current = true
    setOverwritePrompt(false)
    writeDraft(formStateRef.current)
  }, [])

  const cancelOverwrite = useCallback(() => {
    overwriteCancelledRef.current = true
    setOverwritePrompt(false)
  }, [])

  return {
    pendingDraft,
    restore,
    dismiss,
    remove,
    confirmOverwrite,
    overwritePrompt,
    cancelOverwrite,
  }
}
