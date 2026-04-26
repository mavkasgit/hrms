import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import { tagApi } from "@/entities/tag/api"
import type { EmployeeCreate, EmployeeUpdate, EmployeeStatus } from "./types"

export function useEmployees(params: {
  q?: string
  department?: string
  gender?: string
  status?: EmployeeStatus
  page: number
  per_page: number
  sort_by?: string
  sort_order?: string
}) {
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () => api.fetchEmployees(params),
  })
}

export function useEmployee(employeeId: number) {
  return useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => api.fetchEmployee(employeeId),
    enabled: !!employeeId,
  })
}

export function useSearchEmployees(q: string) {
  return useQuery({
    queryKey: ["employees-search", q],
    queryFn: () => api.searchEmployees(q),
    enabled: q.length >= 1,
  })
}

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: EmployeeCreate) => api.createEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, data }: { employeeId: number; data: EmployeeUpdate }) =>
      api.updateEmployee(employeeId, data),
    onSuccess: (_updated, { employeeId: _empId }) => {
      queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
      queryClient.invalidateQueries({
        queryKey: ["vacation-employees-summary"],
        refetchType: "all",
      })
      queryClient.invalidateQueries({
        queryKey: ["vacation-periods"],
        refetchType: "all",
      })
    },
  })
}

export function useArchiveEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, reason }: { employeeId: number; reason?: string }) =>
      api.archiveEmployee(employeeId, reason),
    onSuccess: (_, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["audit-log", employeeId] })
    },
  })
}

export function useRestoreEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (employeeId: number) => api.restoreEmployee(employeeId),
    onSuccess: (_, employeeId) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] })
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["audit-log", employeeId] })
    },
  })
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, hard, confirm }: { employeeId: number; hard?: boolean; confirm?: boolean }) =>
      api.deleteEmployee(employeeId, hard, confirm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
  })
}

export function useResetEmployeePeriods() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (employeeId: number) => api.resetEmployeePeriods(employeeId),
    onSuccess: (_, employeeId) => {
      queryClient.invalidateQueries({ queryKey: ["employees"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"], refetchType: "all" })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"], refetchType: "all" })
    },
  })
}

export function useEmployeeAuditLog(employeeId: number) {
  return useQuery({
    queryKey: ["audit-log", employeeId],
    queryFn: () => api.fetchEmployeeAuditLog(employeeId),
    enabled: !!employeeId,
  })
}

export function useEmployeePeriodsStatus(employeeId: number) {
  return useQuery({
    queryKey: ["employee-periods-status", employeeId],
    queryFn: () => api.fetchEmployeePeriodsStatus(employeeId),
    enabled: !!employeeId,
  })
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: api.fetchDepartments,
  })
}

/* Теги сотрудников */
export function useAssignTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, tagId }: { employeeId: number; tagId: number }) =>
      tagApi.assignTag(employeeId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"], exact: false })
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
      qc.invalidateQueries({ queryKey: ["dashboard-birthdays"] })
      qc.invalidateQueries({ queryKey: ["dashboard-contracts"] })
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}

export function useUnassignTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, tagId }: { employeeId: number; tagId: number }) =>
      tagApi.unassignTag(employeeId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"], exact: false })
      qc.invalidateQueries({ queryKey: ["departments-graph"] })
      qc.invalidateQueries({ queryKey: ["dashboard-birthdays"] })
      qc.invalidateQueries({ queryKey: ["dashboard-contracts"] })
      qc.invalidateQueries({ queryKey: ["tags"] })
    },
  })
}
