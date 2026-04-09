import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchVacationPeriods, adjustVacationPeriod, closePeriod, partialClosePeriod } from "./api"
import type { VacationPeriodAdjust } from "./types"

export function useVacationPeriods(employeeId: number | null) {
  return useQuery({
    queryKey: ["vacation-periods", employeeId],
    queryFn: () => fetchVacationPeriods(employeeId!),
    enabled: !!employeeId,
  })
}

export function useAdjustVacationPeriod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ periodId, data }: { periodId: number; data: VacationPeriodAdjust }) =>
      adjustVacationPeriod(periodId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
    },
  })
}

export function useClosePeriod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (periodId: number) => closePeriod(periodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}

export function usePartialClosePeriod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ periodId, remainingDays }: { periodId: number; remainingDays: number }) =>
      partialClosePeriod(periodId, remainingDays),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}
