import api from "@/shared/api/axios"
import type {
  Employee,
  EmployeeListResponse,
  EmployeeCreate,
  EmployeeUpdate,
  EmployeeAuditLog,
  EmployeeStatus,
} from "./types"

export async function fetchEmployees(params: {
  q?: string
  department?: string
  status?: EmployeeStatus
  page: number
  per_page: number
  sort_by?: string
  sort_order?: string
}) {
  const { data } = await api.get<EmployeeListResponse>("/employees", { params })
  return data
}

export async function searchEmployees(q: string) {
  const { data } = await api.get<{ items: Employee[]; total: number }>("/employees/search", {
    params: { q },
  })
  return data
}

export async function fetchEmployee(employeeId: number) {
  const { data } = await api.get<Employee>(`/employees/${employeeId}`)
  return data
}

export async function createEmployee(employee: EmployeeCreate) {
  const { data } = await api.post<Employee>("/employees", employee)
  return data
}

export async function updateEmployee(employeeId: number, employee: EmployeeUpdate) {
  const { data } = await api.put<Employee>(`/employees/${employeeId}`, employee)
  return data
}

export async function resetEmployeePeriods(employeeId: number) {
  const { data } = await api.post<Employee>(`/employees/${employeeId}/reset-periods`)
  return data
}

export async function fetchEmployeePeriodsStatus(employeeId: number) {
  const { data } = await api.get<{ mismatch: boolean }>(`/employees/${employeeId}/periods-status`)
  return data
}

export async function archiveEmployee(employeeId: number, reason?: string) {
  const { data } = await api.post<Employee & { warnings?: string[] }>(
    `/employees/${employeeId}/archive`,
    reason ? { termination_reason: reason } : {}
  )
  return data
}

export async function restoreEmployee(employeeId: number) {
  const { data } = await api.post<Employee>(`/employees/${employeeId}/restore`)
  return data
}

export async function deleteEmployee(employeeId: number, hard = false, confirm = false) {
  console.log(`[API] deleteEmployee: id=${employeeId}, hard=${hard}, confirm=${confirm}`)
  const params: Record<string, string> = {}
  if (hard === true) params.hard = "true"
  if (confirm === true) params.confirm = "true"
  console.log(`[API] deleteEmployee params:`, params)
  await api.delete(`/employees/${employeeId}`, { params })
}

export async function fetchEmployeeAuditLog(employeeId: number) {
  const { data } = await api.get<EmployeeAuditLog[]>(`/employees/${employeeId}/audit-log`)
  return data
}

export async function fetchArchiveWarnings(employeeId: number) {
  const { data } = await api.get<{ warnings: string[] }>(`/employees/${employeeId}/warnings`)
  return data
}

export async function fetchDepartments() {
  const { data } = await api.get<{ departments: string[] }>("/employees/departments")
  return data.departments
}
