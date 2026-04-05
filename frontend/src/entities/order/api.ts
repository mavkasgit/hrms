import api from "@/shared/api/axios"
import type {
  Order,
  OrderListResponse,
  OrderCreate,
  TemplateListResponse,
  OrderSettings,
  OrderSyncResponse,
} from "./types"

export async function fetchOrders(params: {
  page: number
  per_page: number
  sort_by?: string
  sort_order?: string
  year?: number
}) {
  const { data } = await api.get<OrderListResponse>("/orders/all", { params })
  return data
}

export async function fetchRecentOrders(limit = 10, year?: number) {
  const { data } = await api.get<Order[]>("/orders/recent", { params: { limit, year } })
  return data
}

export async function fetchOrderYears() {
  const { data } = await api.get<{ years: number[] }>("/orders/years")
  return data.years
}

export async function fetchOrderTypes() {
  const { data } = await api.get<{ types: string[] }>("/orders/types")
  return data.types
}

export async function fetchNextOrderNumber(year?: number) {
  const { data } = await api.get<{ order_number: string }>("/orders/next-number", {
    params: { year },
  })
  return data.order_number
}

export async function createOrder(order: OrderCreate) {
  const { data } = await api.post<Order>("/orders", order)
  return data
}

export async function downloadOrder(orderId: number) {
  const response = await api.get(`/orders/${orderId}/download`, {
    responseType: "blob",
  })
  return response
}

export async function fetchTemplates() {
  const { data } = await api.get<TemplateListResponse>("/templates")
  return data.templates
}

export async function downloadTemplate(orderType: string) {
  const response = await api.get(`/templates/${orderType}`, {
    responseType: "blob",
  })
  return response
}

export async function uploadTemplate(orderType: string, file: File) {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await api.post(`/templates/${orderType}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function deleteTemplate(orderType: string) {
  const { data } = await api.delete(`/templates/${orderType}`)
  return data
}

export async function fetchOrderSettings() {
  const { data } = await api.get<OrderSettings>("/orders/settings")
  return data
}

export async function updateOrderSettings(settings: Partial<OrderSettings>) {
  const { data } = await api.put<OrderSettings>("/orders/settings", settings)
  return data
}

export async function syncOrders(year?: number) {
  const { data } = await api.post<OrderSyncResponse>("/orders/sync", null, {
    params: { year },
  })
  return data
}

export async function cancelOrder(orderId: number): Promise<{ message: string }> {
  const { data } = await api.put(`/orders/${orderId}/cancel`)
  return data
}

export async function deleteOrder(orderId: number): Promise<{ message: string }> {
  const { data } = await api.delete(`/orders/${orderId}`)
  return data
}
