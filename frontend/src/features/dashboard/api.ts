import api from "@/shared/api/axios"
import type { DashboardStats, Birthday, ContractExpiring, DepartmentCount, DepartmentPosition } from "./types"

export async function fetchDashboardStats(department?: string): Promise<DashboardStats> {
  const params = department ? { department } : {}
  const { data } = await api.get<DashboardStats>("/analytics/dashboard", { params })
  return data
}

export async function fetchBirthdays(days = 30): Promise<Birthday[]> {
  const { data } = await api.get<Birthday[]>("/analytics/birthdays", { params: { days } })
  return data
}

export async function fetchContracts(department?: string): Promise<ContractExpiring[]> {
  const params: Record<string, string> = {}
  if (department) params.department = department
  const { data } = await api.get<ContractExpiring[]>("/analytics/contracts", { params })
  return data
}

export async function fetchDepartmentDistribution(department?: string): Promise<DepartmentCount[] | DepartmentPosition[]> {
  const params = department ? { department } : {}
  const { data } = await api.get<DepartmentCount[] | DepartmentPosition[]>("/analytics/departments", { params })
  return data
}
