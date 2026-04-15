import api from "@/shared/api/axios"
import type { VacationPeriod, VacationPeriodAdjust, VacationPeriodBreakdown } from "./types"

export async function fetchVacationPeriods(employeeId: number): Promise<VacationPeriod[]> {
  const { data } = await api.get<VacationPeriod[]>("/vacation-periods", {
    params: { employee_id: employeeId },
  })
  return data
}

export async function fetchPeriodBreakdown(periodId: number): Promise<VacationPeriodBreakdown> {
  const { data } = await api.get<VacationPeriodBreakdown>(
    `/vacation-periods/${periodId}/breakdown`,
  )
  return data
}

export async function adjustVacationPeriod(
  periodId: number,
  data: VacationPeriodAdjust,
): Promise<VacationPeriod> {
  const { data: result } = await api.post<VacationPeriod>(
    `/vacation-periods/${periodId}/adjust`,
    data,
  )
  return result
}

export async function closePeriod(periodId: number): Promise<VacationPeriod> {
  const { data } = await api.post<VacationPeriod>(
    `/vacation-periods/${periodId}/close`,
  )
  return data
}

export async function partialClosePeriod(
  periodId: number,
  remainingDays: number,
): Promise<VacationPeriod> {
  const { data } = await api.post<VacationPeriod>(
    `/vacation-periods/${periodId}/partial-close`,
    { remaining_days: remainingDays },
  )
  return data
}
