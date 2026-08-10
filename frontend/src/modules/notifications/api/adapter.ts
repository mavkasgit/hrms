import type { Notification, NotificationList } from "../types"

/**
 * Адаптер данных модуля — единственная точка соприкосновения с бэкендом.
 *
 * Хост-приложение реализует этот интерфейс поверх своего HTTP-клиента
 * (axios/fetch/…) или использует готовый createHttpAdapter (fetch).
 */
export interface NotificationsApi {
  /**
   * Список незакрытых уведомлений + счётчик непрочитанных.
   * `limit` — сколько уведомлений вернуть (по умолчанию 50).
   */
  list(limit?: number): Promise<NotificationList>

  /** Пометить уведомление прочитанным. */
  markRead(id: number): Promise<Notification>

  /** Закрыть уведомление (пропадает из списка). */
  close(id: number): Promise<Notification>
}
