import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { tagApi } from "./api"
import type { TagCreate, TagUpdate } from "./types"

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: tagApi.fetchAll,
  })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TagCreate) => tagApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TagUpdate }) =>
      tagApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => tagApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}
