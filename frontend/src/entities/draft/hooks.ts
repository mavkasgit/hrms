import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import type { DraftFormData } from "./api"

export const ALL_DRAFTS_QUERY_KEY = ["all-drafts"] as const

/** Единый источник всех черновиков (приказы + уведомления + заявления) для попапа и страницы. */
export function useAllDrafts() {
  return useQuery({
    queryKey: ALL_DRAFTS_QUERY_KEY,
    queryFn: () => api.fetchAllDrafts(),
    // Список/счётчик черновиков должны обновляться после сохранения из редактора (#86):
    // при фокусе вкладки и по таймеру — без отдельных каналов.
    // staleTime: 0 — чтобы refetchOnWindowFocus реально перезапрашивал (глобальный staleTime=30s).
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })
}

/** Данные черновика для «Заполнить поля» — однократная загрузка по id из URL. */
export function useDraftFormData(draftId: string | null): { data: DraftFormData | undefined } {
  const query = useQuery({
    queryKey: ["draft-form-data", draftId],
    queryFn: () => api.fetchDraftFormData(draftId as string),
    enabled: Boolean(draftId),
  })
  return { data: query.data }
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
