/**
 * Контракты данных модуля уведомлений — зеркало бэкенда семейства HRMS/KTM.
 */

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
