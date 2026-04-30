import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as api from "./onlyofficeApi"
import type { OrderCreate } from "./types"

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

export function useTemplateOnlyOfficeConfig(orderTypeId: number, mode: "edit" | "view" = "edit") {
  return useQuery({
    queryKey: ["onlyoffice-config", "template", orderTypeId, mode],
    queryFn: () => api.fetchTemplateOnlyOfficeConfig(orderTypeId, mode),
    enabled: orderTypeId > 0,
  })
}
