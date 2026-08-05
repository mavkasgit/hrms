import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { showGlobalToast } from "@/shared/ui/use-toast"
import * as api from "./onlyofficeApi"
import type { GroupOrderCreate, OrderCreate } from "./types"

export function useOrderOnlyOfficeConfig(orderId: number, mode: "edit" | "view" = "edit") {
  return useQuery({
    queryKey: ["onlyoffice-config", "order", orderId, mode],
    queryFn: () => api.fetchOrderOnlyOfficeConfig(orderId, mode),
    enabled: orderId > 0,
  })
}

export function useCreateOrderDraft() {
  return useMutation({
    mutationFn: (order: OrderCreate) => api.createOrderDraft(order),
  })
}

export function useDraftOnlyOfficeConfig(draftId: string | null) {
  return useQuery({
    queryKey: ["onlyoffice-config", "draft", draftId],
    queryFn: () => api.fetchDraftOnlyOfficeConfig(draftId!),
    enabled: !!draftId,
  })
}

export function useCommitOrderDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draftId: string) => api.commitOrderDraft(draftId),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacations"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["next-order-number"] })
      queryClient.invalidateQueries({ queryKey: ["order-drafts"] })
      showGlobalToast({
        title: "Приказ создан",
        description: order?.order_number
          ? `№ ${order.order_number}`
          : order?.id
            ? `ID: ${order.id}`
            : undefined,
        variant: "success",
      })
    },
  })
}

export function useOrderDrafts() {
  return useQuery({
    queryKey: ["order-drafts"],
    queryFn: () => api.fetchOrderDrafts(),
    // Счётчик черновиков в сайдбаре должен оставаться свежим (#55).
    refetchInterval: 30_000,
  })
}

export function useDeleteOrderDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draftId: string) => api.deleteOrderDraft(draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-drafts"] })
    },
  })
}

export function useTemplateOnlyOfficeConfig(orderTypeId: number, mode: "edit" | "view" = "edit") {
  return useQuery({
    queryKey: ["onlyoffice-config", "template", orderTypeId, mode],
    queryFn: () => api.fetchTemplateOnlyOfficeConfig(orderTypeId, mode),
    enabled: orderTypeId > 0,
  })
}

export function useCreateGroupDraft() {
  return useMutation({
    mutationFn: (payload: GroupOrderCreate) => api.createGroupDraft(payload),
  })
}

export function useCommitGroupDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draftId: string) => api.commitGroupDraft(draftId),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacations"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["order-drafts"] })
      showGlobalToast({
        title: "Приказ создан",
        description: order?.order_number
          ? `№ ${order.order_number}`
          : order?.id
            ? `ID: ${order.id}`
            : undefined,
        variant: "success",
      })
    },
  })
}
