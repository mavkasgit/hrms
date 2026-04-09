import api from "@/shared/api/axios"
import type {
  Vacation,
  VacationCreate,
  VacationUpdate,
  VacationBalance,
  PositionVacationConfig,
  Holiday,
  VacationListResponse,
  EmployeeVacationSummary,
  EmployeeVacationHistory,
} from "./types"

export async function getVacations(params: {
  employee_id?: number
  year?: number
  vacation_type?: string
  page?: number
  per_page?: number
}): Promise<VacationListResponse> {
  const response = await api.get("/vacations", { params })
  return response.data
}

export async function createVacation(data: VacationCreate): Promise<Vacation> {
  console.log("[API] Creating vacation with data:", JSON.stringify(data, null, 2))
  const response = await api.post("/vacations", data)
  console.log("[API] Vacation created, response:", response.data)
  return response.data
}

export async function updateVacation(id: number, data: VacationUpdate): Promise<Vacation> {
  const response = await api.put(`/vacations/${id}`, data)
  return response.data
}

export async function deleteVacation(id: number): Promise<void> {
  await api.delete(`/vacations/${id}`)
}

export async function getVacationBalance(employeeId: number, year?: number): Promise<VacationBalance> {
  const response = await api.get("/vacations/balance", {
    params: { employee_id: employeeId, year },
  })
  return response.data
}

export async function getPositionVacationConfig(): Promise<PositionVacationConfig[]> {
  const response = await api.get("/references/vacation-days-by-position")
  return response.data
}

export async function upsertPositionVacationConfig(position: string, days: number): Promise<PositionVacationConfig> {
  const response = await api.put(`/references/vacation-days-by-position/${position}`, { position, days })
  return response.data
}

export async function deletePositionVacationConfig(position: string): Promise<void> {
  await api.delete(`/references/vacation-days-by-position/${position}`)
}

export async function getHolidays(year?: number): Promise<Holiday[]> {
  const response = await api.get("/references/holidays", { params: { year } })
  return response.data
}

export async function addHoliday(date: string, name: string): Promise<Holiday> {
  const response = await api.post("/references/holidays", { date, name })
  return response.data
}

export async function deleteHoliday(id: number): Promise<void> {
  await api.delete(`/references/holidays/${id}`)
}

export async function seedHolidays(year: number): Promise<{ message: string }> {
  const response = await api.post("/references/holidays/seed", null, { params: { year } })
  return response.data
}

export async function getVacationEmployeesSummary(
  q?: string,
  filter: string = "active"
): Promise<EmployeeVacationSummary[]> {
  const response = await api.get("/vacations/employees-summary", {
    params: { q, filter },
  })
  return response.data
}

export async function getEmployeeVacationHistory(employeeId: number): Promise<EmployeeVacationHistory> {
  const response = await api.get(`/vacations/employees/${employeeId}/history`)
  return response.data
}

export async function updateEmployeeCorrection(
  employeeId: number,
  correction: number
): Promise<{ message: string }> {
  const response = await api.put(`/vacations/employees/${employeeId}/correction`, null, {
    params: { correction },
  })
  return response.data
}

export async function cancelVacation(id: number): Promise<{ message: string }> {
  const response = await api.put(`/vacations/${id}/cancel`)
  return response.data
}
