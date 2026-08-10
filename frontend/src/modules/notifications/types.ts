/**
 * Контракты данных модуля уведомлений — зеркало бэкенда семейства HRMS/KTM.
 */

export interface Notification {
  id: number
  /** null — общее уведомление, заполнено — персональное текущему пользователю */
  user_id: number | null
  notification_type: string
  title: string
  text: string | null
  entity_type: string | null
  entity_id: number | null
  created_at: string
  read_at: string | null
  closed_at: string | null
}

export interface NotificationList {
  items: Notification[]
  total: number
  unread_count: number
}
