import api from "@/shared/api/client"
import type { AllDraftItem, AllDraftKind } from "./types"
import type { FormDataField } from "@/shared/api/onlyoffice-types"

export async function fetchAllDrafts(): Promise<AllDraftItem[]> {
  const { data } = await api.get<AllDraftItem[]>("/drafts")
  return data
}

/**
 * Данные черновика для кнопки «Заполнить поля» (пересоздание документа).
 * Скалярные поля приходят массивом `data` (FormDataField) — тот же формат,
 * что у document.data в конфиге OnlyOffice.
 */
export interface DraftFormData {
  kind: string
  is_group: boolean
  order_type_code: string | null
  data: FormDataField[]
  /** Сотрудники группового приказа. */
  employees: { employee_id: number; vacation_days: number }[] | null
}

/** Значение поля из data-массива черновика (или null). */
export function getFormDataValue(data: DraftFormData["data"], key: string): string | null {
  const item = data.find((d) => d.key === key)
  return item ? item.value : null
}

/** Числовое значение поля из data-массива (или null). */
export function getFormDataInt(data: DraftFormData["data"], key: string): number | null {
  const raw = getFormDataValue(data, key)
  if (!raw) return null
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

/** Поля, не входящие в базовые ключи вида, считаются extra-полями формы. */
export function getFormDataExtraFields(
  data: DraftFormData["data"],
  knownKeys: string[]
): Record<string, string> {
  const known = new Set(knownKeys)
  return Object.fromEntries(data.filter((d) => !known.has(d.key)).map((d) => [d.key, d.value]))
}

export async function fetchDraftFormData(draftId: string): Promise<DraftFormData> {
  const { data } = await api.get<DraftFormData>(`/drafts/${draftId}/form-data`)
  return data
}

/**
 * Разобрать единый draft_id (`order:<uuid>` | `notification:N` | `statement:N`).
 * Ид для приказа — сам uuid, для БД-видов — числовой id.
 */
export function splitDraftId(draftId: string): {
  kind: AllDraftKind
  id: string | number
} {
  if (draftId.startsWith("notification:")) {
    return { kind: "notification", id: Number(draftId.slice("notification:".length)) }
  }
  if (draftId.startsWith("statement:")) {
    return { kind: "statement", id: Number(draftId.slice("statement:".length)) }
  }
  return { kind: "order", id: draftId }
}

/**
 * Диспетчер удаления по виду черновика (#60).
 * Приказ → /orders/drafts/{id}; уведомление → /notifications/{id}; заявление → /statements/{id}.
 */
export async function deleteAllDraft(draftId: string): Promise<{ message: string }> {
  const { kind, id } = splitDraftId(draftId)
  const url =
    kind === "order"
      ? `/orders/drafts/${id}`
      : kind === "notification"
        ? `/notifications/${id}`
        : `/statements/${id}`
  const { data } = await api.delete<{ message: string }>(url)
  return data
}
