import api from "@/shared/api/axios"
import type { DashboardStats, Birthday, ContractExpiring, DepartmentCount, DepartmentPosition } from "./types"

interface FetchParams {
  department_id?: number
  gender?: string
}

export async function fetchDashboardStats(params?: FetchParams): Promise<DashboardStats> {
  const queryParams: Record<string, string | number> = {}
  if (params?.department_id) queryParams.department_id = params.department_id
  if (params?.gender) queryParams.gender = params.gender
  const { data } = await api.get<DashboardStats>("/analytics/dashboard", { params: queryParams })
  return data
}

export async function fetchBirthdays(days = 30, gender?: string): Promise<Birthday[]> {
  const params: Record<string, string | number> = { days }
  if (gender) params.gender = gender
  const { data } = await api.get<Birthday[]>("/analytics/birthdays", { params })
  return data
}

export async function fetchContracts(department_id?: number, gender?: string): Promise<ContractExpiring[]> {
  const params: Record<string, string | number> = {}
  if (department_id) params.department_id = department_id
  if (gender) params.gender = gender
  const { data } = await api.get<ContractExpiring[]>("/analytics/contracts", { params })
  return data
}

export async function fetchDepartmentDistribution(department_id?: number, gender?: string): Promise<DepartmentCount[] | DepartmentPosition[]> {
  const params: Record<string, string | number> = {}
  if (department_id) params.department_id = department_id
  if (gender) params.gender = gender
  const { data } = await api.get<DepartmentCount[] | DepartmentPosition[]>("/analytics/departments", { params })
  return data
}
