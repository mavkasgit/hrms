import type {
  IdpLinks,
  LoginEvent,
  ProfilePatch,
  SessionInfo,
  UserProfile,
} from "../types"

/**
 * Адаптер данных модуля — единственная точка соприкосновения с бэкендом.
 *
 * Хост-приложение реализует этот интерфейс поверх своего HTTP-клиента
 * (axios/fetch/…) или использует готовый createHttpAdapter (fetch).
 *
 * Опциональные методы включают соответствующие разделы UI:
 * нет listSessions → раздел «Сессии» скрыт, и т.д.
 */
export interface UserSettingsApi {
  /**
   * Текущий профиль (GET /auth/me и аналоги).
   * `refresh=true` → добавить ?refresh=1 (принудительная синхронизация с IdP,
   * обходя TTL-кэш бэкенда). Диалог всегда открывает и перечитывает с refresh.
   */
  getProfile(refresh?: boolean): Promise<UserProfile>

  /** Частичное обновление профиля. Возвращает актуальный снимок полей. */
  updateProfile(patch: ProfilePatch): Promise<Partial<UserProfile>>

  /** Установить (seed) или сбросить (null) аватар. */
  updateAvatar(seed: string | null): Promise<{ avatar_seed: string | null }>

  /** Deep-links в IdP (SSO). Без метода — блок SSO скрыт. */
  getIdpLinks?(): Promise<IdpLinks>

  /** Активные сессии. Без метода — раздел скрыт. */
  listSessions?(): Promise<SessionInfo[]>

  /** Отозвать одну сессию. */
  revokeSession?(id: string): Promise<void>

  /** Отозвать все сессии, кроме текущей. */
  revokeOtherSessions?(): Promise<void>

  /** История входов. Без метода — блок скрыт. */
  listLoginEvents?(limit?: number): Promise<LoginEvent[]>
}
