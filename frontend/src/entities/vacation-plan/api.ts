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
