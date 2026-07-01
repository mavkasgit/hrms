import api from "@/shared/api/axios"
import type { Holiday } from "./types"

export async function fetchHolidays(year: number): Promise<Holiday[]> {
  const { data } = await api.get<Holiday[]>("/references/holidays", { params: { year } })
  return data
}
