import type {
  IdpLinks,
  LoginEventListResult,
  ProfilePatch,
  SessionListResult,
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
   * обходя TTL-кэш бэкенда). Диалог открывается без форса; refresh=1 — только
   * после смены аватара (AvatarPickerDialog → updateAvatar → getProfile(true)).
   */
  getProfile(refresh?: boolean): Promise<UserProfile>

  /** Частичное обновление профиля (theme/locale). Возвращает актуальный снимок. */
  updateProfile(patch: ProfilePatch): Promise<Partial<UserProfile>>

  /** Установить (seed) или сбросить (null) аватар. */
  updateAvatar(seed: string | null): Promise<{ avatar_seed: string | null }>

  /** Deep-links в IdP (SSO). Без метода — блок SSO скрыт. */
  getIdpLinks?(): Promise<IdpLinks>

  /**
   * Активные сессии (канон 2.0.0): {sessions: последние 10, total: N}.
   * Без метода — раздел скрыт.
   */
  listSessions?(): Promise<SessionListResult>

  /** Отозвать одну сессию. */
  revokeSession?(id: string): Promise<void>

  /** Отозвать все сессии, кроме текущей. */
  revokeOtherSessions?(): Promise<void>

  /**
   * История входов (канон 2.1.0): {events: последние 10, total: N}.
   * Без метода — блок скрыт.
   */
  listLoginEvents?(): Promise<LoginEventListResult>
}
