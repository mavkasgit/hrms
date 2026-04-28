import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import type { OrderCreate, OrderUpdate, OrdersQueryParams, OrderTypeCreate, OrderTypeUpdate } from "./types"

export function useOrders(params: OrdersQueryParams) {
  return useQuery({
    queryKey: ["orders", params],
    queryFn: () => api.fetchOrders(params),
  })
}

export function useRecentOrders(limit = 10, year?: number) {
  return useQuery({
    queryKey: ["orders-recent", limit, year],
    queryFn: () => api.fetchRecentOrders(limit, year),
    staleTime: 0,
  })
}

export function useOrderYears() {
  return useQuery({
    queryKey: ["order-years"],
    queryFn: api.fetchOrderYears,
  })
}

export function useOrderTypes(activeOnly = true) {
  return useQuery({
    queryKey: ["order-types", activeOnly],
    queryFn: () => api.fetchOrderTypes(activeOnly),
  })
}

export function useAllOrderTypes() {
  return useQuery({
    queryKey: ["order-types-all"],
    queryFn: api.fetchAllOrderTypes,
  })
}

export function useTemplateVariables() {
  return useQuery({
    queryKey: ["order-type-variables"],
    queryFn: api.fetchTemplateVariables,
  })
}

export function useNextOrderNumber(orderTypeId?: number) {
  return useQuery({
    queryKey: ["next-order-number", orderTypeId],
    queryFn: () => api.fetchNextOrderNumber(orderTypeId!),
    enabled: !!orderTypeId,
  })
}

export function useUpdateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: number; payload: OrderUpdate }) =>
      api.updateOrder(orderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
    },
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: OrderCreate) => api.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacations"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["next-order-number"] })
    },
  })
}

export function useCreateOrderPreview() {
  return useMutation({
    mutationFn: (data: OrderCreate) => api.createOrderPreview(data),
  })
}

export function useCreateOrderType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: OrderTypeCreate) => api.createOrderType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-types-all"] })
      queryClient.invalidateQueries({ queryKey: ["order-types"] })
    },
  })
}

export function useUpdateOrderType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderTypeId, payload }: { orderTypeId: number; payload: OrderTypeUpdate }) =>
      api.updateOrderType(orderTypeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-types-all"] })
      queryClient.invalidateQueries({ queryKey: ["order-types"] })
    },
  })
}

export function useDeleteOrderType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderTypeId: number) => api.deleteOrderType(orderTypeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-types-all"] })
      queryClient.invalidateQueries({ queryKey: ["order-types"] })
    },
  })
}

export function useUploadTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderTypeId, file }: { orderTypeId: number; file: File }) =>
      api.uploadTemplate(orderTypeId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-types-all"] })
      queryClient.invalidateQueries({ queryKey: ["order-types"] })
    },
  })
}

export function useBulkUploadTemplates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) => api.bulkUploadTemplates(files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-types-all"] })
      queryClient.invalidateQueries({ queryKey: ["order-types"] })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderTypeId: number) => api.deleteTemplate(orderTypeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-types-all"] })
      queryClient.invalidateQueries({ queryKey: ["order-types"] })
    },
  })
}

export function useSyncOrders() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (year?: number) => api.syncOrders(year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
    },
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) => api.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacations"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
    },
  })
}

export function useDeleteOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) => api.deleteOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacations"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
    },
  })
}
