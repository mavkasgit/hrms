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
      // Находим все кеши с периодами по period_id и обновляем
      queryClient.setQueryData(["vacation-periods", data.period_id], data)
      
      // Обновляем массив периодов - ищем во всех кешах
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
      // Обновляем кеш напрямую данными из ответа сервера
      queryClient.setQueryData(["vacation-periods", data.period_id], data)
      
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
    onSuccess: (data) => {
      queryClient.setQueryData(["vacation-periods"], data)
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}
