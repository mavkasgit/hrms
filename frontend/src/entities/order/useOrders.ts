import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import type { OrderCreate } from "./types"

export function useOrders(params: {
  page: number
  per_page: number
  sort_by?: string
  sort_order?: string
  year?: number
}) {
  return useQuery({
    queryKey: ["orders", params],
    queryFn: () => api.fetchOrders(params),
  })
}

export function useRecentOrders(limit = 10, year?: number) {
  return useQuery({
    queryKey: ["orders-recent", limit, year],
    queryFn: () => api.fetchRecentOrders(limit, year),
  })
}

export function useOrderYears() {
  return useQuery({
    queryKey: ["order-years"],
    queryFn: api.fetchOrderYears,
  })
}

export function useOrderTypes() {
  return useQuery({
    queryKey: ["order-types"],
    queryFn: api.fetchOrderTypes,
  })
}

export function useNextOrderNumber(year?: number) {
  return useQuery({
    queryKey: ["next-order-number", year],
    queryFn: () => api.fetchNextOrderNumber(year),
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: OrderCreate) => api.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"] })
      queryClient.invalidateQueries({ queryKey: ["next-order-number"] })
    },
  })
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: api.fetchTemplates,
  })
}

export function useUploadTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderType, file }: { orderType: string; file: File }) =>
      api.uploadTemplate(orderType, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] })
    },
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderType: string) => api.deleteTemplate(orderType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] })
    },
  })
}

export function useSyncOrders() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (year?: number) => api.syncOrders(year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"] })
    },
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) => api.cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"] })
    },
  })
}

export function useDeleteOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) => api.deleteOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"] })
    },
  })
}
