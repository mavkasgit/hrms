import api from "@/shared/api/axios"
import type {
  WorkSchedule,
  WorkScheduleCreate,
  WorkScheduleUpdate,
  WorkScheduleEntryCreate,
  BulkSetEntriesRequest,
} from "./types"

export async function fetchWorkSchedules(
  year: number,
  month: number,
  employeeId?: number,
  withEntries = false
): Promise<WorkSchedule[]> {
  const { data } = await api.get<{ items: WorkSchedule[]; total: number }>("/work-schedules", {
    params: { year, month, employee_id: employeeId, with_entries: withEntries },
  })
  return data.items
}

export async function fetchWorkSchedule(id: number): Promise<WorkSchedule> {
  const { data } = await api.get<WorkSchedule>(`/work-schedules/${id}`)
  return data
}

export async function createWorkSchedule(payload: WorkScheduleCreate): Promise<WorkSchedule> {
  const { data } = await api.post<WorkSchedule>("/work-schedules", payload)
  return data
}

export async function updateWorkSchedule(
  id: number,
  payload: WorkScheduleUpdate
): Promise<WorkSchedule> {
  const { data } = await api.put<WorkSchedule>(`/work-schedules/${id}`, payload)
  return data
}

export async function approveWorkSchedule(id: number): Promise<WorkSchedule> {
  const { data } = await api.post<WorkSchedule>(`/work-schedules/${id}/approve`)
  return data
}

export async function unapproveWorkSchedule(id: number): Promise<WorkSchedule> {
  const { data } = await api.post<WorkSchedule>(`/work-schedules/${id}/unapprove`)
  return data
}

export async function deleteWorkSchedule(id: number): Promise<void> {
  await api.delete(`/work-schedules/${id}`)
}

export async function setWorkScheduleEntry(
  scheduleId: number,
  payload: WorkScheduleEntryCreate
): Promise<void> {
  await api.post(`/work-schedules/${scheduleId}/entries`, payload)
}

export async function bulkSetEntries(
  scheduleId: number,
  payload: BulkSetEntriesRequest
): Promise<WorkSchedule> {
  const { data } = await api.post<WorkSchedule>(`/work-schedules/${scheduleId}/entries/bulk`, payload)
  return data
}

export async function deleteWorkScheduleEntry(
  scheduleId: number,
  entryId: number
): Promise<void> {
  await api.delete(`/work-schedules/${scheduleId}/entries/${entryId}`)
}
