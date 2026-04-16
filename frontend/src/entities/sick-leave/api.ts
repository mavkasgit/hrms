import api from "@/shared/api/axios"
import type {
  SickLeave,
  SickLeaveCreate,
  SickLeaveUpdate,
  SickLeaveListResponse,
  SickLeaveSummary,
} from "./types"

export async function getSickLeaves(params: {
  employee_id?: number
  year?: number
  sick_leave_type?: string
  status?: string
  page?: number
  per_page?: number
}): Promise<SickLeaveListResponse> {
  const response = await api.get("/sick-leaves", { params })
  return response.data
}

export async function createSickLeave(data: SickLeaveCreate): Promise<SickLeave> {
  const response = await api.post("/sick-leaves", data)
  return response.data
}

export async function updateSickLeave(id: number, data: SickLeaveUpdate): Promise<SickLeave> {
  const response = await api.put(`/sick-leaves/${id}`, data)
  return response.data
}

export async function deleteSickLeave(id: number): Promise<void> {
  await api.delete(`/sick-leaves/${id}`)
}

export async function cancelSickLeave(id: number): Promise<{ message: string; data: SickLeave }> {
  const response = await api.put(`/sick-leaves/${id}/cancel`)
  return response.data
}

export async function getSickLeave(id: number): Promise<SickLeave> {
  const response = await api.get(`/sick-leaves/${id}`)
  return response.data
}

export async function getSickLeavesEmployeesSummary(
  q?: string,
  filter: string = "active"
): Promise<SickLeaveSummary[]> {
  const response = await api.get("/sick-leaves/stats/employees", {
    params: { q, filter },
  })
  return response.data
}
