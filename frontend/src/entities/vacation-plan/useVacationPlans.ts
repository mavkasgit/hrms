import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchVacationPlanSummary, createOrUpdateVacationPlan, deleteVacationPlan } from "./api"
import type { VacationPlanCreate } from "./types"

export function useVacationPlanSummary(year: number) {
  return useQuery({
    queryKey: ["vacation-plan-summary", year],
    queryFn: () => fetchVacationPlanSummary(year),
  })
}

export function useCreateOrUpdateVacationPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: VacationPlanCreate) => createOrUpdateVacationPlan(data),
    onMutate: async (newData) => {
      // Отменяем исходящие запросы чтобы не перезаписать optimistic update
      await queryClient.cancelQueries({ queryKey: ["vacation-plan-summary", newData.year] })

      // Сохраняем предыдущее состояние для отката
      const previous = queryClient.getQueryData(["vacation-plan-summary", newData.year])

      // Optimistic update: обновляем кэш немедленно
      queryClient.setQueryData(["vacation-plan-summary", newData.year], (old: any[] | undefined) => {
        if (!old) return old
        return old.map((emp: any) => {
          if (emp.employee_id !== newData.employee_id) return emp
          const newMonths = { ...emp.months, [newData.month]: newData.days }
          const newTotal = Object.values(newMonths).reduce((sum: number, v: any) => sum + (v || 0), 0)
          return { ...emp, months: newMonths, total_days: newTotal }
        })
      })

      return { previous }
    },
    onError: (_err, newData, context: any) => {
      // Откат при ошибке
      if (context?.previous) {
        queryClient.setQueryData(["vacation-plan-summary", newData.year], context.previous)
      }
    },
    onSettled: (_data, _error, variables) => {
      // Рефетч после мутации (успешной или нет)
      queryClient.invalidateQueries({ queryKey: ["vacation-plan-summary", variables.year] })
    },
  })
}

export function useDeleteVacationPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (planId: number) => deleteVacationPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-plan-summary"] })
    },
  })
}
