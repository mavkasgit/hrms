import { useQuery } from "@tanstack/react-query"
import api from "@/shared/api/axios"
import type { ContractHistoryListResponse } from "./types"

const CONTRACT_HISTORY_KEYS = {
  all: ["contractHistory"] as const,
  byEmployee: (employeeId: number) => [...CONTRACT_HISTORY_KEYS.all, "employee", employeeId] as const,
  registry: (params?: Record<string, unknown>) => [...CONTRACT_HISTORY_KEYS.all, "registry", params] as const,
}

export function useContractHistory(employeeId: number) {
  return useQuery({
    queryKey: CONTRACT_HISTORY_KEYS.byEmployee(employeeId),
    queryFn: async () => {
      const { data } = await api.get<ContractHistoryListResponse>(`/employees/${employeeId}/contracts`)
      return data.items
    },
    enabled: employeeId > 0,
  })
}

interface UseContractRegistryParams {
  page?: number
  per_page?: number
  employee_id?: number | null
  order_type_code?: string
  year?: number | null
}

export function useContractYears() {
  return useQuery({
    queryKey: [...CONTRACT_HISTORY_KEYS.all, "years"],
    queryFn: async () => {
      const { data } = await api.get<{ years: number[] }>("/contracts/years")
      return data.years
    },
  })
}

export function useContractRegistry(params: UseContractRegistryParams = {}) {
  return useQuery({
    queryKey: CONTRACT_HISTORY_KEYS.registry(params),
    queryFn: async () => {
      const queryParams: Record<string, string | number> = {}
      if (params.page !== undefined) queryParams.page = params.page
      if (params.per_page !== undefined) queryParams.per_page = params.per_page
      if (params.employee_id) queryParams.employee_id = params.employee_id
      if (params.order_type_code) queryParams.order_type_code = params.order_type_code
      if (params.year) queryParams.year = params.year

      const { data } = await api.get<ContractHistoryListResponse>("/contracts/registry", { params: queryParams })
      return data
    },
  })
}
