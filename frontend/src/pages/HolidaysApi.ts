import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "../entities/vacation/api"

export function useHolidaysApi(year: number) {
  const queryClient = useQueryClient()
  
  const { data: holidays, isLoading } = useQuery({
    queryKey: ["holidays", year],
    queryFn: () => api.getHolidays(year),
    enabled: !!year,
  })

  const addMutation = useMutation({
    mutationFn: ({ date, name }: { date: string; name: string }) =>
      api.addHoliday(date, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays", year] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteHoliday(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays", year] })
    },
  })

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      if (!holidays) return
      await Promise.all(holidays.map((h) => api.deleteHoliday(h.id)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays", year] })
    },
  })

  const seedMutation = useMutation({
    mutationFn: (year: number) => api.seedHolidays(year),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays", year] })
    },
  })

  return {
    holidays,
    isLoading,
    refetch: () => queryClient.invalidateQueries({ queryKey: ["holidays", year] }),
    addHoliday: addMutation.mutateAsync,
    deleteHoliday: deleteMutation.mutateAsync,
    deleteAllHolidays: deleteAllMutation.mutateAsync,
    seedHolidays: seedMutation.mutateAsync,
    isAdding: addMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isDeletingAll: deleteAllMutation.isPending,
    isSeeding: seedMutation.isPending,
  }
}