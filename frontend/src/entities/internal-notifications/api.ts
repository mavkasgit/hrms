import api from "@/shared/api/axios"

export interface InternalNotification {
  id: number
  notification_type: string
  title: string
  text: string | null
  entity_type: string | null
  entity_id: number | null
  created_at: string
  read_at: string | null
  closed_at: string | null
}

export interface InternalNotificationList {
  items: InternalNotification[]
  total: number
  unread_count: number
}

export async function fetchInternalNotifications(limit = 50): Promise<InternalNotificationList> {
  const { data } = await api.get<InternalNotificationList>("/internal-notifications", {
    params: { limit, only_unclosed: true },
  })
  return data
}

export async function markInternalNotificationRead(id: number): Promise<InternalNotification> {
  const { data } = await api.post<InternalNotification>(`/internal-notifications/${id}/read`)
  return data
}

export async function closeInternalNotification(id: number): Promise<InternalNotification> {
  const { data } = await api.post<InternalNotification>(`/internal-notifications/${id}/close`)
  return data
}
