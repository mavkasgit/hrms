import api from "@/shared/api/axios"
import type { HireDateAdjustment, HireDateAdjustmentCreate } from "./types"

export async function createHireDateAdjustment(
  employeeId: number,
  data: HireDateAdjustmentCreate,
): Promise<HireDateAdjustment> {
  const { data: result } = await api.post<HireDateAdjustment>(
    `/employees/${employeeId}/hire-date-adjustments`,
    data,
  )
  return result
}

export async function listHireDateAdjustments(
  employeeId: number,
): Promise<HireDateAdjustment[]> {
  const { data } = await api.get<HireDateAdjustment[]>(
    `/employees/${employeeId}/hire-date-adjustments`,
  )
  return data
}

export async function deleteHireDateAdjustment(
  employeeId: number,
  adjustmentId: number,
): Promise<void> {
  await api.delete(`/employees/${employeeId}/hire-date-adjustments/${adjustmentId}`)
}
