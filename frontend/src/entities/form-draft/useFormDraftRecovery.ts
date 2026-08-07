import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Восстановление несохранённого заполнения форм создания документов (#28).
 *
 * Единая логика для всех форм (приказ, уведомление, заявление): один слот на
 * сущность — ключ localStorage передаёт хост. Заполнение сохраняется debounced
 * в localStorage и переживает перезагрузку/закрытие вкладки. При следующем
 * открытии страницы показывается уведомление с действиями
 * «Восстановить» / «Не сейчас» / «Удалить».
 */

const DEBOUNCE_MS = 800

export interface UseFormDraftRecoveryOptions<T extends { saved_at: string }> {
  /** Ключ localStorage, под которым хранится черновик формы. */
  storageKey: string
  /** Текущие значения формы (для автосохранения). */
  formState: Omit<T, "saved_at">
  /** Есть ли в форме хоть что-то заполненное (чтобы не сохранять пустоту). */
  hasContent: (state: Omit<T, "saved_at">) => boolean
  /** Вызывается при восстановлении — хост заполняет форму. */
  onRestore: (draft: T) => void
}

export interface UseFormDraftRecoveryResult<T extends { saved_at: string }> {
  /** Найденный черновик. */
  pendingDraft: T | null
  /** Восстановить форму из черновика. */
  restore: () => void
  /** Очистить черновик после успешного создания документа / сброса формы. */
  clear: () => void
  /** Подтвердить перезапись существующего черновика при новом заполнении. */
  confirmOverwrite: () => void
  /** Нужно ли показать диалог подтверждения перезаписи. */
  overwritePrompt: boolean
  /** Отменить перезапись (продолжить без сохранения). */
  cancelOverwrite: () => void
}

export function useFormDraftRecovery<T extends { saved_at: string }>({
  storageKey,
  formState,
  hasContent,
  onRestore,
}: UseFormDraftRecoveryOptions<T>): UseFormDraftRecoveryResult<T> {
  const [pendingDraft, setPendingDraft] = useState<T | null>(null)
  const [overwritePrompt, setOverwritePrompt] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const existingDraftRef = useRef<T | null>(null)
  const overwriteConfirmedRef = useRef(false)
  const overwriteCancelledRef = useRef(false)
  const formStateRef = useRef(formState)
  formStateRef.current = formState
  const hasContentRef = useRef(hasContent)
  hasContentRef.current = hasContent
  // Есть ли неперсистённые изменения формы с момента последней записи/восстановления.
  // pagehide-flush пишет только если что-то изменилось — после «Восстановить»
  // черновик не должен возрождаться без правок.
  const dirtyRef = useRef(false)
  // Подавление: на время, когда restore сам заполняет форму, не помечаем dirty.
  const suppressDirtyRef = useRef(false)

  const readDraft = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }, [storageKey])

  const writeDraft = useCallback(
    (state: Omit<T, "saved_at">): void => {
      const draft = { ...state, saved_at: new Date().toISOString() } as T
      localStorage.setItem(storageKey, JSON.stringify(draft))
    },
    [storageKey],
  )

  const clearDraft = useCallback((): void => {
    localStorage.removeItem(storageKey)
  }, [storageKey])

  // Заблокирована ли запись гейтом перезаписи (общий для автосейва и flush).
  const blockedByOverwriteGate = useCallback((): boolean => {
    // Диалог перезаписи — только для черновика, существовавшего ДО текущего заполнения
    if (existingDraftRef.current && !overwriteConfirmedRef.current && !overwriteCancelledRef.current) return true
    // После отмены перезаписи не сохраняем (пользователь осознанно отказался)
    if (overwriteCancelledRef.current && !overwriteConfirmedRef.current) return true
    return false
  }, [])

  // При монтировании: проверяем наличие сохранённого черновика
  useEffect(() => {
    const draft = readDraft()
    if (draft) {
      existingDraftRef.current = draft
      setPendingDraft(draft)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounced автосохранение при изменении формы. Сравниваем сериализованное
  // значение формы — не зависим от идентичности объекта formState у хоста.
  const serialized = JSON.stringify(formState)
  const prevSerializedRef = useRef<string | null>(null)

  useEffect(() => {
    if (prevSerializedRef.current === serialized) return
    prevSerializedRef.current = serialized

    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Изменения, внесённые самим restore, не считаем пользовательским вводом
    if (suppressDirtyRef.current) {
      suppressDirtyRef.current = false
      return
    }

    if (!hasContentRef.current(formState)) return
    dirtyRef.current = true

    debounceRef.current = setTimeout(() => {
      // clear()/restore() мог очистить черновик, пока таймер ещё висел — не возрождаем
      if (!dirtyRef.current) return
      if (blockedByOverwriteGate()) {
        // Показываем диалог перезаписи только для черновика с прошлой сессии (#49)
        if (existingDraftRef.current && !overwriteConfirmedRef.current && !overwriteCancelledRef.current) {
          setOverwritePrompt(true)
        }
        return
      }
      writeDraft(formStateRef.current)
      dirtyRef.current = false
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized])

  // Flush на закрытие/скрытие вкладки (#51): пишем черновик синхронно, чтобы
  // последний ввод не терялся, если debounce ещё не отработал.
  useEffect(() => {
    const handlePageHide = () => {
      // Пишем только при неперсистённых изменениях — иначе после «Восстановить»
      // очищенный черновик тут же возродился бы
      if (!dirtyRef.current) return
      if (!hasContentRef.current(formStateRef.current)) return
      // Те же гейты, что и в debounced автосейве
      if (blockedByOverwriteGate()) return
      writeDraft(formStateRef.current)
      dirtyRef.current = false
    }
    window.addEventListener("pagehide", handlePageHide)
    return () => window.removeEventListener("pagehide", handlePageHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const restore = useCallback(() => {
    const draft = pendingDraft ?? readDraft()
    if (draft) {
      // Изменения, которые restore внесёт в форму, не должны помечаться как
      // пользовательский ввод (иначе pagehide возродит очищенный черновик)
      suppressDirtyRef.current = true
      onRestore(draft)
      // После восстановления очищаем черновик — он больше не нужен
      clearDraft()
      existingDraftRef.current = null
      overwriteConfirmedRef.current = true
      dirtyRef.current = false
    }
    setPendingDraft(null)
  }, [pendingDraft, readDraft, onRestore, clearDraft])

  const clear = useCallback(() => {
    clearDraft()
    existingDraftRef.current = null
    overwriteConfirmedRef.current = true
    dirtyRef.current = false
    setPendingDraft(null)
  }, [clearDraft])

  const confirmOverwrite = useCallback(() => {
    overwriteConfirmedRef.current = true
    setOverwritePrompt(false)
    writeDraft(formStateRef.current)
    dirtyRef.current = false
  }, [writeDraft])

  const cancelOverwrite = useCallback(() => {
    overwriteCancelledRef.current = true
    setOverwritePrompt(false)
  }, [])

  return {
    pendingDraft,
    restore,
    clear,
    confirmOverwrite,
    overwritePrompt,
    cancelOverwrite,
  }
}
