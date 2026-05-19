import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"
import type { NotificationCreate, NotificationUpdate } from "./types"

// ─── Notifications ───

export function useNextNotificationNumber() {
  return useQuery({
    queryKey: ["next-notification-number"],
    queryFn: () => api.fetchNextNotificationNumber(),
  })
}

export function useNotifications(params: {
  page?: number
  per_page?: number
  number?: string
  date_from?: string
  date_to?: string
  employee_id?: number
  notification_type_id?: number
}) {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => api.fetchNotifications(params),
  })
}

export function useNotification(id: number | null) {
  return useQuery({
    queryKey: ["notification", id],
    queryFn: () => api.fetchNotification(id!),
    enabled: !!id,
  })
}

export function useCreateNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NotificationCreate) => api.createNotification(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

export function useCreateNotificationDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NotificationCreate) => api.createNotificationDraft(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

export function useUpdateNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: NotificationUpdate }) =>
      api.updateNotification(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })
}

// ─── Notification Types ───

export function useNotificationTypes(active_only = false) {
  return useQuery({
    queryKey: ["notification-types", active_only],
    queryFn: () => api.fetchNotificationTypes(active_only),
  })
}

export function useNotificationType(id: number | null) {
  return useQuery({
    queryKey: ["notification-type", id],
    queryFn: () => api.fetchNotificationType(id!),
    enabled: !!id,
  })
}

export function useCreateNotificationType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<import("./types").NotificationType>) => api.createNotificationType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-types"] })
    },
  })
}

export function useUpdateNotificationType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<import("./types").NotificationType> }) =>
      api.updateNotificationType(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-types"] })
    },
  })
}

export function useDeleteNotificationType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteNotificationType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-types"] })
    },
  })
}

export function useUploadNotificationTypeTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => api.uploadNotificationTypeTemplate(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-types"] })
    },
  })
}

export function useDeleteNotificationTypeTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteNotificationTypeTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-types"] })
    },
  })
}

export function useNotificationTypeOnlyOfficeConfig(id: number | null, mode: "edit" | "view" = "edit") {
  return useQuery({
    queryKey: ["onlyoffice-config", "notification-template", id, mode],
    queryFn: () => api.fetchNotificationTypeOnlyOfficeConfig(id!, mode),
    enabled: !!id && id > 0,
  })
}
