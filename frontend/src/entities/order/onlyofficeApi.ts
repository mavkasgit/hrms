import api from "@/shared/api/axios"
import type { OrderCreate } from "./types"
import type { CommitOrderDraftResponse, OnlyOfficeConfig, OrderDraftResponse } from "./onlyofficeTypes"

export async function fetchOrderOnlyOfficeConfig(orderId: number, mode: "edit" | "view" = "edit") {
  const { data } = await api.get<OnlyOfficeConfig>(`/orders/${orderId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}

export async function forceSaveOrder(orderId: number, documentKey: string) {
  const { data } = await api.post<{ message: string }>(`/orders/${orderId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}

export async function createOrderDraft(order: OrderCreate) {
  const { data } = await api.post<OrderDraftResponse>("/orders/drafts", order)
  return data
}

export async function fetchDraftOnlyOfficeConfig(draftId: string) {
  const { data } = await api.get<OnlyOfficeConfig>(`/orders/drafts/${draftId}/onlyoffice/config`)
  return data
}

export async function forceSaveDraft(draftId: string, documentKey: string) {
  const { data } = await api.post<{ message: string }>(`/orders/drafts/${draftId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}

export async function commitOrderDraft(draftId: string, order: OrderCreate) {
  const { data } = await api.post<CommitOrderDraftResponse>(`/orders/drafts/${draftId}/commit`, order)
  return data
}

export async function fetchTemplateOnlyOfficeConfig(orderTypeId: number, mode: "edit" | "view" = "edit") {
  const { data } = await api.get<OnlyOfficeConfig>(`/order-types/${orderTypeId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}

export async function forceSaveTemplate(orderTypeId: number, documentKey: string) {
  const { data } = await api.post<{ message: string }>(`/order-types/${orderTypeId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}
