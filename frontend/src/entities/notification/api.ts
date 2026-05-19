import axios from "@/shared/api/axios"
import type {
  Notification,
  NotificationListResponse,
  NotificationCreate,
  NotificationUpdate,
  NotificationType,
} from "./types"
import type { OnlyOfficeConfig } from "@/entities/order/onlyofficeTypes"

// ─── Notifications ───

export async function fetchNotifications(params: {
  page?: number
  per_page?: number
  date_from?: string
  date_to?: string
  employee_id?: number
  notification_type_id?: number
}): Promise<NotificationListResponse> {
  const { data } = await axios.get<NotificationListResponse>("/notifications", { params })
  return data
}

export async function fetchNextNotificationNumber(): Promise<string> {
  const { data } = await axios.get<{ number: string }>("/notifications/next-number")
  return data.number
}

export async function fetchNotification(id: number): Promise<Notification> {
  const { data } = await axios.get<Notification>(`/notifications/${id}`)
  return data
}

export async function createNotification(payload: NotificationCreate): Promise<Notification> {
  const { data } = await axios.post<Notification>("/notifications", payload)
  return data
}

export async function updateNotification(id: number, payload: NotificationUpdate): Promise<Notification> {
  const { data } = await axios.put<Notification>(`/notifications/${id}`, payload)
  return data
}

export async function deleteNotification(id: number): Promise<void> {
  await axios.delete(`/notifications/${id}`)
}

export async function fetchNotificationOnlyOfficeConfig(
  notificationId: number,
  mode: "edit" | "view" = "view"
): Promise<OnlyOfficeConfig> {
  const { data } = await axios.get<OnlyOfficeConfig>(`/notifications/${notificationId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}

export function openNotificationView(notificationId: number) {
  window.open(`/notifications/${notificationId}/view-docx`, "_blank", "noopener,noreferrer")
}

export function openNotificationEdit(notificationId: number) {
  window.open(`/notifications/${notificationId}/edit-docx`, "_blank", "noopener,noreferrer")
}

export function downloadNotificationDocx(notificationId: number) {
  window.open(`${import.meta.env.VITE_API_URL || "/api"}/notifications/${notificationId}/download`, "_blank")
}

export async function createNotificationDraft(): Promise<{ draft_id: string; notification_id: number }> {
  const { data } = await axios.post("/notifications/drafts")
  return data
}

// ─── Notification Types ───

export async function fetchNotificationTypes(active_only = false): Promise<NotificationType[]> {
  const { data } = await axios.get<NotificationType[]>("/notification-types", { params: { active_only } })
  return data
}

export async function fetchNotificationType(id: number): Promise<NotificationType> {
  const { data } = await axios.get<NotificationType>(`/notification-types/${id}`)
  return data
}

export async function createNotificationType(payload: Partial<NotificationType>): Promise<NotificationType> {
  const { data } = await axios.post<NotificationType>("/notification-types", payload)
  return data
}

export async function updateNotificationType(id: number, payload: Partial<NotificationType>): Promise<NotificationType> {
  const { data } = await axios.put<NotificationType>(`/notification-types/${id}`, payload)
  return data
}

export async function deleteNotificationType(id: number): Promise<void> {
  await axios.delete(`/notification-types/${id}`)
}

export async function uploadNotificationTypeTemplate(id: number, file: File): Promise<NotificationType> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await axios.post<NotificationType>(`/notification-types/${id}/template`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function deleteNotificationTypeTemplate(id: number): Promise<void> {
  await axios.delete(`/notification-types/${id}/template`)
}

export function downloadNotificationTypeTemplate(id: number) {
  window.open(`${import.meta.env.VITE_API_URL || "/api"}/notification-types/${id}/template`, "_blank")
}

// ─── OnlyOffice for notification type templates ───

export async function fetchNotificationTypeOnlyOfficeConfig(
  notificationTypeId: number,
  mode: "edit" | "view" = "edit"
): Promise<OnlyOfficeConfig> {
  const { data } = await axios.get<OnlyOfficeConfig>(`/notification-types/${notificationTypeId}/onlyoffice/config`, {
    params: { mode },
  })
  return data
}

export async function forceSaveNotificationTypeTemplate(notificationTypeId: number, documentKey: string) {
  const { data } = await axios.post<{ message: string }>(`/notification-types/${notificationTypeId}/onlyoffice/forcesave`, {
    document_key: documentKey,
  })
  return data
}
