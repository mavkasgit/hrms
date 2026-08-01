import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchInternalNotifications,
  markInternalNotificationRead,
  closeInternalNotification,
} from "./api"

export function useInternalNotifications(limit = 50) {
  return useQuery({
    queryKey: ["internal-notifications", limit],
    queryFn: () => fetchInternalNotifications(limit),
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => markInternalNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-notifications"] })
    },
  })
}

export function useCloseNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => closeInternalNotification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["internal-notifications"] })
    },
  })
}
