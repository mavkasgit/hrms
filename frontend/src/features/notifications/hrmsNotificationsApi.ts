import api from "@/shared/api/client"
import type {
  InternalNotification,
  InternalNotificationList,
  NotificationsApi,
} from "@/modules/notifications"

/**
 * Адаптер модуля notifications к бэкенду HRMS.
 *
 * Реализован поверх проектного axios-инстанса (а не createHttpAdapter),
 * чтобы сохранить общие интерсепторы: обработку 401, глобальные тосты и т.д.
 *
 * Пути — единый каноничный контракт /internal-notifications.
 */
export const hrmsNotificationsApi: NotificationsApi = {
  async list(limit = 50): Promise<InternalNotificationList> {
    const { data } = await api.get<InternalNotificationList>(
      "/internal-notifications",
      { params: { limit, only_unclosed: true } },
    )
    return data
  },

  async markRead(id): Promise<InternalNotification> {
    const { data } = await api.post<InternalNotification>(
      `/internal-notifications/${id}/read`,
    )
    return data
  },

  async close(id): Promise<InternalNotification> {
    const { data } = await api.post<InternalNotification>(
      `/internal-notifications/${id}/close`,
    )
    return data
  },
}
