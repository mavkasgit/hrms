import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchVacationCalendarList,
  fetchCurrentVacationCalendar,
  downloadVacationCalendar,
  deleteVacationCalendar,
} from "@/entities/vacation-plan/api"
import type { VacationCalendarDocument } from "@/entities/vacation-plan/types"

export function useVacationCalendarList() {
  return useQuery({
    queryKey: ["vacation-calendar-list"],
    queryFn: () => fetchVacationCalendarList(),
  })
}

export function useCurrentVacationCalendarDoc() {
  return useQuery({
    queryKey: ["vacation-calendar-current"],
    queryFn: () => fetchCurrentVacationCalendar(),
  })
}

export function useDeleteVacationCalendar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (docId: number) => deleteVacationCalendar(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-calendar-list"] })
      queryClient.invalidateQueries({ queryKey: ["vacation-calendar-current"] })
    },
  })
}

export function useDownloadVacationCalendar() {
  return useMutation({
    mutationFn: ({ docId, filename }: { docId: number; filename: string }) =>
      downloadVacationCalendar(docId, filename),
  })
}
