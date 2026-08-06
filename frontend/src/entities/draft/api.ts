import api from "@/shared/api/axios"
import type { AllDraftItem, AllDraftKind } from "./types"

export async function fetchAllDrafts(): Promise<AllDraftItem[]> {
  const { data } = await api.get<AllDraftItem[]>("/drafts")
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
