/**
 * Публичные контракты модуля user-settings.
 *
 * Модуль не знает о конкретном бэкенде: все данные приходят через
 * UserSettingsApi (см. api/adapter.ts), а типы ниже — единый язык модуля
 * и хост-приложения.
 */

/** Поддерживаемые языки интерфейса профиля. */
export type UserLocale = "ru" | "en"

/** Тема оформления. */
export type UserTheme = "system" | "light" | "dark"

/**
 * Профиль текущего пользователя (снимок «как отдал бэкенд»).
 * Поля опциональны там, где бэкенды могут отличаться.
 */
export interface UserProfile {
  username: string
  full_name: string | null
  email?: string | null
  role?: string | null
  avatar_seed?: string | null
  locale?: UserLocale | null
  theme?: UserTheme | null
}

/** Патч профиля (только изменённые поля). */
export interface ProfilePatch {
  full_name?: string
  email?: string
  locale?: UserLocale
  theme?: UserTheme
}

/** Активная сессия (сеанс) пользователя. */
export interface SessionInfo {
  id: string
  device_label: string | null
  ip_address: string | null
  user_agent?: string | null
  login_method: string | null
  created_at: string
  last_seen_at: string
  is_current: boolean
}

/** Событие входа (успешное или нет). */
export interface LoginEvent {
  id: number | string
  success: boolean
  ip_address: string | null
  device_label: string | null
  login_method: string | null
  created_at: string
  failure_reason?: string | null
  event_type?: string | null
}

/** Ссылки на внешний IdP (единый вход), если он настроен. */
export interface IdpLinks {
  oidc_enabled: boolean
  user_settings_url: string | null
}

/** Уровень уведомления для callbacks.notify. */
export type NotifyVariant = "default" | "success" | "destructive"

/** Колбэк уведомлений — хост подставляет свой toast. */
export type NotifyFn = (toast: {
  title: string
  description?: string
  variant?: NotifyVariant
}) => void

/** Флаги возможностей модуля (что показывать). */
export interface UserSettingsFeatures {
  /** Выбор аватара (по seed). По умолчанию true. */
  avatar?: boolean
  /** Блок внешнего IdP. По умолчанию — авто (есть api.getIdpLinks). */
  idp?: boolean
  /** Активные сессии. По умолчанию — авто (есть api.listSessions). */
  sessions?: boolean
  /** История входов. По умолчанию — авто (есть api.listLoginEvents). */
  loginHistory?: boolean
  /** Внешний вид (тема/язык). По умолчанию true. */
  appearance?: boolean
}

/** Колбэки модуля — точки интеграции с хост-приложением. */
export interface UserSettingsCallbacks {
  /** Профиль обновлён (после любой успешной записи). */
  onProfileUpdated?: (profile: UserProfile) => void
  /** Пользователь сменил тему (применить в хосте немедленно). */
  onThemeChange?: (theme: UserTheme) => void
  /** Пользователь сменил язык (сохранить в хосте немедленно). */
  onLocaleChange?: (locale: UserLocale) => void
  /** Текущая сессия отозвана — хост должен разлогинить. */
  onLogoutRequest?: () => void
  /** Тосты хоста. Без него — только инлайн-статусы. */
  notify?: NotifyFn
}
