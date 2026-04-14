import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { positionApi } from "./api"
import type { PositionCreate, PositionUpdate } from "./types"

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: positionApi.fetchAll,
  })
}

export function useCreatePosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PositionCreate) => positionApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] })
    },
  })
}

export function useUpdatePosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PositionUpdate }) =>
      positionApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] })
    },
  })
}

export function useDeletePosition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => positionApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["positions"] })
    },
  })
}
