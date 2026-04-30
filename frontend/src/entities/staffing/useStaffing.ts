import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"

export function useStaffingHistory() {
  return useQuery({
    queryKey: ["staffing", "history"],
    queryFn: api.getStaffingHistory,
  })
}

export function useCurrentStaffing() {
  return useQuery({
    queryKey: ["staffing", "current"],
    queryFn: api.getCurrentStaffing,
  })
}

export function useUploadStaffingDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.uploadStaffingDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staffing", "history"] })
      queryClient.invalidateQueries({ queryKey: ["staffing", "current"] })
    },
  })
}

export function useDeleteStaffingDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.deleteStaffingDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staffing", "history"] })
      queryClient.invalidateQueries({ queryKey: ["staffing", "current"] })
    },
  })
}

export function useStaffingOnlyOfficeConfig(docId: number, mode: "edit" | "view" = "view") {
  return useQuery({
    queryKey: ["onlyoffice-config", "staffing", docId, mode],
    queryFn: () => api.fetchStaffingOnlyOfficeConfig(docId, mode),
    enabled: docId > 0,
  })
}
