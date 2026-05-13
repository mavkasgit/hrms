import api from "@/shared/api/axios"
import type { VacationPlan, VacationPlanCreate, VacationPlanSummary, VacationPlanUpdate } from "./types"

export async function fetchVacationPlanSummary(year: number): Promise<VacationPlanSummary[]> {
  const { data } = await api.get<VacationPlanSummary[]>("/vacation-plans/summary", {
    params: { year },
  })
  return data
}

export async function createOrUpdateVacationPlan(data: VacationPlanCreate): Promise<VacationPlan | null> {
  console.log("[createOrUpdateVacationPlan] API called with:", data)
  const { data: result } = await api.post<VacationPlan | null>("/vacation-plans", data)
  return result
}

export async function updateVacationPlan(planId: number, data: VacationPlanUpdate): Promise<VacationPlan> {
  const { data: result } = await api.put<VacationPlan>(`/vacation-plans/${planId}`, data)
  return result
}

export async function deleteVacationPlan(planId: number): Promise<void> {
  await api.delete(`/vacation-plans/${planId}`)
}

export interface VacationPlanImportResult {
  created: number
  updated: number
  not_found: {
    name: string
    position: string
    months: Record<string, string>
  }[]
  skipped_empty: string[]
  total_processed: number
  processed: {
    name: string
    position: string
    months: Record<string, string>
    is_update: boolean
  }[]
  preview_only: boolean
}

export async function importVacationPlans(
  file: File,
  year: number,
  sheetIndex: number = 0,
  previewOnly: boolean = false
): Promise<VacationPlanImportResult> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await api.post<VacationPlanImportResult>("/vacation-plans/import", formData, {
    params: { year, sheet_index: sheetIndex, preview_only: previewOnly },
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function downloadVacationPlanTemplate(): Promise<Blob> {
  const { data } = await api.get("/vacation-plans/import/template", {
    responseType: "blob",
  })
  return data
}

export interface VacationCalendarDocument {
  id: number
  original_filename: string
  file_type: string
  uploaded_at: string
  uploaded_by: string | null
}

const VACATION_CALENDAR_DOC_CODE = "vacation_calendar"

export async function fetchCurrentVacationCalendar(): Promise<{ document: VacationCalendarDocument | null }> {
  const { data } = await api.get(`/documents/${VACATION_CALENDAR_DOC_CODE}/current`)
  return data
}

export async function fetchVacationCalendarList(): Promise<VacationCalendarDocument[]> {
  const { data } = await api.get(`/documents/${VACATION_CALENDAR_DOC_CODE}`)
  return data
}

export async function downloadVacationCalendar(docId: number, filename?: string): Promise<void> {
  const { data } = await api.get(`/documents/${VACATION_CALENDAR_DOC_CODE}/${docId}/file`, {
    responseType: "blob",
  })
  const url = window.URL.createObjectURL(new Blob([data]))
  const link = document.createElement("a")
  link.href = url
  link.download = filename || `vacation_calendar_${docId}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export async function deleteVacationCalendar(docId: number): Promise<void> {
  await api.delete(`/documents/${VACATION_CALENDAR_DOC_CODE}/${docId}`)
}
