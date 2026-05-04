import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { createHireDateAdjustment, listHireDateAdjustments, deleteHireDateAdjustment } from "./api"
import type { HireDateAdjustmentCreate } from "./types"

export function useHireDateAdjustments(employeeId: number | null) {
  return useQuery({
    queryKey: ["hire-date-adjustments", employeeId],
    queryFn: () => listHireDateAdjustments(employeeId!),
    enabled: !!employeeId,
  })
}

export function useCreateHireDateAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, data }: { employeeId: number; data: HireDateAdjustmentCreate }) =>
      createHireDateAdjustment(employeeId, data),
    onSuccess: (_data, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ["hire-date-adjustments", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
    },
  })
}

export function useDeleteHireDateAdjustment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ employeeId, adjustmentId }: { employeeId: number; adjustmentId: number }) =>
      deleteHireDateAdjustment(employeeId, adjustmentId),
    onSuccess: (_data, { employeeId }) => {
      queryClient.invalidateQueries({ queryKey: ["hire-date-adjustments", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods", employeeId] })
      queryClient.invalidateQueries({ queryKey: ["vacation-periods"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-employees-summary"] })
    },
  })
}
