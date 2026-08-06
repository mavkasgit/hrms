import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"

export const ALL_DRAFTS_QUERY_KEY = ["all-drafts"] as const

/** Единый источник всех черновиков (приказы + уведомления + заявления) для попапа и страницы. */
export function useAllDrafts() {
  return useQuery({
    queryKey: ALL_DRAFTS_QUERY_KEY,
    queryFn: () => api.fetchAllDrafts(),
    // Счётчик черновиков в сайдбаре должен оставаться свежим (#55).
    refetchInterval: 30_000,
  })
}

/** Удаление по виду черновика с инвалидацией единого списка (#60). */
export function useDeleteAllDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draftId: string) => api.deleteAllDraft(draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALL_DRAFTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ["order-drafts"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"], exact: false })
      queryClient.invalidateQueries({ queryKey: ["statements"], exact: false })
    },
  })
}
