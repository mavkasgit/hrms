import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import type { SickLeaveCreate, SickLeaveUpdate } from "./types"

export function useSickLeaves(params: {
  employee_id?: number
  year?: number
  sick_leave_type?: string
  status?: string
  page?: number
  per_page?: number
}) {
  return useQuery({
    queryKey: ["sick-leaves", params],
    queryFn: () => api.getSickLeaves(params),
  })
}

export function useSickLeavesEmployeesSummary(q?: string, filter: string = "active") {
  return useQuery({
    queryKey: ["sick-leave-employees-summary", q, filter],
    queryFn: () => api.getSickLeavesEmployeesSummary(q, filter),
    staleTime: 1000 * 60, // 1 минута
  })
}

export function useCreateSickLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: SickLeaveCreate) => api.createSickLeave(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sick-leaves"] })
      queryClient.invalidateQueries({ queryKey: ["sick-leave-employees-summary"] })
    },
  })
}

export function useUpdateSickLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SickLeaveUpdate }) => api.updateSickLeave(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sick-leaves"] })
      queryClient.invalidateQueries({ queryKey: ["sick-leave-employees-summary"] })
    },
  })
}

export function useDeleteSickLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteSickLeave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sick-leaves"] })
      queryClient.invalidateQueries({ queryKey: ["sick-leave-employees-summary"] })
    },
  })
}

export function useCancelSickLeave() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.cancelSickLeave(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sick-leaves"] })
      queryClient.invalidateQueries({ queryKey: ["sick-leave-employees-summary"] })
    },
  })
}

export function useSickLeave(id: number | null) {
  return useQuery({
    queryKey: ["sick-leave", id],
    queryFn: () => api.getSickLeave(id!),
    enabled: !!id,
  })
}
