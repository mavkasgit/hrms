/**
 * notifications — переносимый модуль уведомлений.
 *
 * Публичный API модуля. Импортируйте только отсюда:
 *
 *   import { NotificationsBell, createHttpAdapter } from "@/modules/notifications"
 */

export const NOTIFICATIONS_MODULE_VERSION = "1.1.0"

export { NotificationsBell } from "./NotificationsBell"
export type { NotificationsBellProps } from "./NotificationsBell"

export type { NotificationsApi } from "./api/adapter"
export { createHttpAdapter, HttpAdapterError } from "./api/http-adapter"
export type {
  HttpAdapterEndpoints,
  HttpAdapterOptions,
} from "./api/http-adapter"

export type {
  InternalNotification,
  InternalNotificationList,
} from "./types"
