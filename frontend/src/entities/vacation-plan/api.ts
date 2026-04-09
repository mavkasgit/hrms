import api from "@/shared/api/axios"
import type { VacationPlan, VacationPlanCreate, VacationPlanSummary, VacationPlanUpdate } from "./types"

export async function fetchVacationPlanSummary(year: number): Promise<VacationPlanSummary[]> {
  const { data } = await api.get<VacationPlanSummary[]>("/vacation-plans/summary", {
    params: { year },
  })
  return data
}

export async function createOrUpdateVacationPlan(data: VacationPlanCreate): Promise<VacationPlan> {
  const { data: result } = await api.post<VacationPlan>("/vacation-plans", data)
  return result
}

export async function updateVacationPlan(planId: number, data: VacationPlanUpdate): Promise<VacationPlan> {
  const { data: result } = await api.put<VacationPlan>(`/vacation-plans/${planId}`, data)
  return result
}

export async function deleteVacationPlan(planId: number): Promise<void> {
  await api.delete(`/vacation-plans/${planId}`)
}
