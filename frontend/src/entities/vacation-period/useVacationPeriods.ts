import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchVacationPeriods, adjustVacationPeriod, closePeriod, partialClosePeriod, recalculateVacationPeriods } from "./api"
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
    onSuccess: (data) => {
      // Обновляем массив периодов в кеше по employee_id
      queryClient.setQueryData(["vacation-periods"], (old: any) => {
        if (!old || !Array.isArray(old)) return old
        return old.map((p: any) =>
          p.period_id === data.period_id ? data : p
        )
      })

      // Также инвалидируем чтобы обновить другие списки
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
    onSuccess: (data) => {
      // Обновляем массив периодов в кеше по employee_id
      queryClient.setQueryData(["vacation-periods"], (old: any) => {
        if (!old || !Array.isArray(old)) return old
        return old.map((p: any) =>
          p.period_id === data.period_id ? data : p
        )
      })

      // Также инвалидируем
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}

export function useRecalculateVacationPeriods() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (employeeId: number) => recalculateVacationPeriods(employeeId),
    onSuccess: (_data, employeeId) => {
      // Инвалидируем кеш конкретного сотрудника
      queryClient.invalidateQueries({ queryKey: ["vacation-periods", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}
