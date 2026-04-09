import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import type { VacationCreate, VacationUpdate } from "./types"

export function useVacations(params: {
  employee_id?: number
  year?: number
  vacation_type?: string
  page?: number
  per_page?: number
}) {
  return useQuery({
    queryKey: ["vacations", params],
    queryFn: () => api.getVacations(params),
  })
}

export function useVacationEmployeesSummary(q?: string, filter: string = "active") {
  return useQuery({
    queryKey: ["vacation-employees-summary", q, filter],
    queryFn: () => api.getVacationEmployeesSummary(q, filter),
    staleTime: 1000 * 60, // 1 минута
  })
}

export function useEmployeeVacationHistory(employeeId: number | null) {
  return useQuery({
    queryKey: ["vacation-history", employeeId],
    queryFn: () => api.getEmployeeVacationHistory(employeeId!),
    enabled: !!employeeId,
  })
}

export function useUpdateCorrection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, correction }: { employeeId: number; correction: number }) =>
      api.updateEmployeeCorrection(employeeId, correction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}

export function useVacationBalance(employeeId: number, year?: number) {
  return useQuery({
    queryKey: ["vacation-balance", employeeId, year],
    queryFn: () => api.getVacationBalance(employeeId, year),
    enabled: !!employeeId,
  })
}

export function useCreateVacation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: VacationCreate) => {
      console.log("[useCreateVacation] mutationFn received:", JSON.stringify(data, null, 2))
      return api.createVacation(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacations"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-balance"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
    },
    onError: (error) => {
      console.error("[useCreateVacation] error:", error)
    },
  })
}

export function useUpdateVacation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: VacationUpdate }) => api.updateVacation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacations"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-balance"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}

export function useDeleteVacation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteVacation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacations"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-balance"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}

export function useCancelVacation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.cancelVacation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacations"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-balance"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}

export function usePositionVacationConfig() {
  return useQuery({
    queryKey: ["position-vacation-config"],
    queryFn: () => api.getPositionVacationConfig(),
  })
}

export function useHolidays(year?: number) {
  return useQuery({
    queryKey: ["holidays", year],
    queryFn: () => api.getHolidays(year),
  })
}
