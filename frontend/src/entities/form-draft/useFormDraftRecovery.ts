import { useCallback, useEffect, useRef, useState } from "react"
import { FORM_DRAFT_CHANGED_EVENT } from "./slots"

/**
 * Восстановление несохранённого заполнения форм создания документов (#28).
 *
 * Единая логика для всех форм (приказ, уведомление, заявление): один слот на
 * сущность — ключ localStorage передаёт хост. Заполнение сохраняется debounced
 * в localStorage и переживает перезагрузку/закрытие вкладки. При следующем
 * открытии страницы показывается попап «Черновики» с действиями
 * «Заполнить» / «Удалить».
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
}

export function useFormDraftRecovery<T extends { saved_at: string }>({
  storageKey,
  formState,
  hasContent,
  onRestore,
}: UseFormDraftRecoveryOptions<T>): UseFormDraftRecoveryResult<T> {
  const [pendingDraft, setPendingDraft] = useState<T | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formStateRef = useRef(formState)
  formStateRef.current = formState
  const hasContentRef = useRef(hasContent)
  hasContentRef.current = hasContent
  // Есть ли неперсистённые изменения формы с момента последней записи/восстановления.
  // pagehide-flush пишет только если что-то изменилось.
  const dirtyRef = useRef(false)

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
      // Попап «Черновики» в той же вкладке обновляется мгновенно (#87).
      window.dispatchEvent(new Event(FORM_DRAFT_CHANGED_EVENT))
    },
    [storageKey],
  )

  const clearDraft = useCallback((): void => {
    localStorage.removeItem(storageKey)
    window.dispatchEvent(new Event(FORM_DRAFT_CHANGED_EVENT))
  }, [storageKey])

  // При монтировании: проверяем наличие сохранённого черновика
  useEffect(() => {
    const draft = readDraft()
    if (draft) {
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

    if (!hasContentRef.current(formState)) return
    dirtyRef.current = true

    debounceRef.current = setTimeout(() => {
      // clear()/restore() мог очистить черновик, пока таймер ещё висел — не возрождаем
      if (!dirtyRef.current) return
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
      // Пишем только при неперсистённых изменениях — иначе pagehide
      // переписывал бы черновик без реального ввода пользователя
      if (!dirtyRef.current) return
      if (!hasContentRef.current(formStateRef.current)) return
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
      onRestore(draft)
      // Черновик НЕ чистим: он остаётся пометкой «незавершённое заполнение»
      // до создания документа. clear() вызывают формы после коммита/сброса —
      // тогда строка в попапе «Черновики» исчезнет сама (#87).
      dirtyRef.current = false
    }
    setPendingDraft(null)
  }, [pendingDraft, readDraft, onRestore])

  const clear = useCallback(() => {
    clearDraft()
    dirtyRef.current = false
    setPendingDraft(null)
  }, [clearDraft])

  return {
    pendingDraft,
    restore,
    clear,
  }
}
