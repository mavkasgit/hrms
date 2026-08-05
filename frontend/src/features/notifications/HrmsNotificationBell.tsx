import { NotificationsBell } from "@/modules/notifications"
import { hrmsNotificationsApi } from "./hrmsNotificationsApi"

/**
 * HRMS-обвязка переносимого модуля notifications:
 * axios-адаптер поверх проектного клиента.
 */
export function HrmsNotificationBell() {
  return <NotificationsBell api={hrmsNotificationsApi} />
}
