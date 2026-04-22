import api from "@/shared/api/axios"
import type {
  Order,
  OrderCreate,
  OrderListResponse,
  OrdersQueryParams,
  OrderSettings,
  OrderSyncResponse,
  OrderType,
  OrderTypeCreate,
  OrderTypeListResponse,
  OrderTypeUpdate,
  TemplateVariablesResponse,
} from "./types"

export async function fetchOrders(params: OrdersQueryParams) {
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

export async function fetchOrderTypes(activeOnly = true) {
  const { data } = await api.get<OrderTypeListResponse>("/orders/types", {
    params: { active_only: activeOnly },
  })
  return data.items
}

export async function fetchAllOrderTypes() {
  const { data } = await api.get<OrderTypeListResponse>("/order-types")
  return data.items
}

export async function createOrderType(payload: OrderTypeCreate) {
  const { data } = await api.post<OrderType>("/order-types", payload)
  return data
}

export async function updateOrderType(orderTypeId: number, payload: OrderTypeUpdate) {
  const { data } = await api.put<OrderType>(`/order-types/${orderTypeId}`, payload)
  return data
}

export async function deleteOrderType(orderTypeId: number) {
  const { data } = await api.delete(`/order-types/${orderTypeId}`)
  return data
}

export async function fetchTemplateVariables() {
  const { data } = await api.get<TemplateVariablesResponse>("/order-types/variables")
  return data.variables
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

export async function downloadTemplate(orderTypeId: number) {
  const response = await api.get(`/order-types/${orderTypeId}/template`, {
    responseType: "blob",
  })
  return response
}

export async function uploadTemplate(orderTypeId: number, file: File) {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await api.post(`/order-types/${orderTypeId}/template`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function deleteTemplate(orderTypeId: number) {
  const { data } = await api.delete(`/order-types/${orderTypeId}/template`)
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
