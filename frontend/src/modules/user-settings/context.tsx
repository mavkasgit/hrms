import { createContext, useContext } from "react"
import type { UserSettingsApi } from "./api/adapter"
import type { UserSettingsDict } from "./i18n"
import type {
  NotifyFn,
  UserLocale,
  UserProfile,
  UserSettingsCallbacks,
  UserTheme,
} from "./types"

/** Разрешённые флаги (после учёта доступных методов api). */
export interface ResolvedFeatures {
  avatar: boolean
  idp: boolean
  sessions: boolean
  loginHistory: boolean
  appearance: boolean
}

export interface UserSettingsContextValue {
  api: UserSettingsApi
  dict: UserSettingsDict
  features: ResolvedFeatures
  callbacks: UserSettingsCallbacks

  /** Текущий профиль (null — ещё грузится / не загрузился). */
  profile: UserProfile | null
  /**
   * Перезагрузить профиль с сервера и уведомить хост.
   * `force=true` → getProfile(true) (refresh=1, принудительный pull из IdP,
   * используется только после смены аватара). Обычный вызов — без форса.
   */
  refreshProfile: (force?: boolean) => Promise<UserProfile | null>

  /** Применить тему/язык в хосте (optimistic). */
  applyTheme: (theme: UserTheme) => void
  applyLocale: (locale: UserLocale) => void

  notify: NotifyFn | undefined

  /** Текущая сессия отозвана — хост должен разлогинить. */
  onLogoutRequest: (() => void) | undefined

  /**
   * Реестр «грязных» секций для защиты от закрытия с несохранёнными
   * изменениями. Панели вызывают setDirty(id, dirty).
   */
  setDirty: (sectionId: string, dirty: boolean) => void
}

export const UserSettingsContext = createContext<UserSettingsContextValue | null>(
  null,
)

export function useUserSettings(): UserSettingsContextValue {
  const ctx = useContext(UserSettingsContext)
  if (!ctx) {
    throw new Error("useUserSettings must be used within UserSettingsDialog")
  }
  return ctx
}
