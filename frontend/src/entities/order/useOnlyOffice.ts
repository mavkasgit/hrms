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
    mutationFn: ({ draftId, order }: { draftId: string; order: OrderCreate }) =>
      api.commitOrderDraft(draftId, order),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacations"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["orders-recent"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["next-order-number"] })
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

export function useDeleteOrderDraft() {
  return useMutation({
    mutationFn: (draftId: string) => api.deleteOrderDraft(draftId),
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
