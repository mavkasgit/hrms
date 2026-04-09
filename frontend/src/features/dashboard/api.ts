import api from "@/shared/api/axios"
import type { DashboardStats, Birthday, ContractExpiring, DepartmentCount, DepartmentPosition } from "./types"

interface FetchParams {
  department?: string
  gender?: string
}

export async function fetchDashboardStats(params?: FetchParams): Promise<DashboardStats> {
  const queryParams: Record<string, string> = {}
  if (params?.department) queryParams.department = params.department
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

export async function fetchContracts(department?: string, gender?: string): Promise<ContractExpiring[]> {
  const params: Record<string, string> = {}
  if (department) params.department = department
  if (gender) params.gender = gender
  const { data } = await api.get<ContractExpiring[]>("/analytics/contracts", { params })
  return data
}

export async function fetchDepartmentDistribution(department?: string, gender?: string): Promise<DepartmentCount[] | DepartmentPosition[]> {
  const params: Record<string, string> = {}
  if (department) params.department = department
  if (gender) params.gender = gender
  const { data } = await api.get<DepartmentCount[] | DepartmentPosition[]>("/analytics/departments", { params })
  return data
}
