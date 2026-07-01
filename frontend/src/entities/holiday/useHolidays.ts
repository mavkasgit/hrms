import { useQuery } from "@tanstack/react-query"
import { fetchHolidays } from "./api"
import type { Holiday } from "./types"

export function useHolidays(year: number) {
  return useQuery<Holiday[]>({
    queryKey: ["holidays", year],
    queryFn: () => fetchHolidays(year),
    staleTime: 1000 * 60 * 60,
  })
}
