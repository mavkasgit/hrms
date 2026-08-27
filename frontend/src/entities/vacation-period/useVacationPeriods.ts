import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchVacationPeriods,
  adjustVacationPeriod,
  closePeriod,
  partialClosePeriod,
  recalculateVacationPeriods,
  deleteManualClosureTransaction,
  fetchAdditionalDaysHistory,
  applyAdditionalDaysIncrease,
  adjustPeriodsAdditionalDays,
} from "./api"
import type { VacationPeriodAdjust, AdditionalDaysIncreaseRequest, VacationPeriodBulkAdjustItem } from "./types"

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

export function useDeleteManualClosureTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (transactionId: number) => deleteManualClosureTransaction(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
    },
  })
}

export function useAdditionalDaysHistory(employeeId: number | null) {
  return useQuery({
    queryKey: ["additional-days-history", employeeId],
    queryFn: () => fetchAdditionalDaysHistory(employeeId!),
    enabled: !!employeeId,
  })
}

export function useApplyAdditionalDaysIncrease() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, data }: { employeeId: number; data: AdditionalDaysIncreaseRequest }) =>
      applyAdditionalDaysIncrease(employeeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
      queryClient.invalidateQueries({ queryKey: ["additional-days-history"] })
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
  })
}

export function useAdjustPeriodsAdditionalDays() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, items }: { employeeId: number; items: VacationPeriodBulkAdjustItem[] }) =>
      adjustPeriodsAdditionalDays(employeeId, items),
    onSuccess: (_data, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ["vacation-periods", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-history"] })
      queryClient.invalidateQueries({ queryKey: ["additional-days-history"] })
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
  })
}
