/**
 * Единый auth-shell hook: AuthProvider + useAuth.
 *
 * ОБЩИЙ МОДУЛЬ: не содержит бренд-значений. token/cookie-ключи, применение
 * theme/locale, справочник ролей и словарь RU-текстов ошибок заданы в хостовом
 * файле `@/shared/api/authHostConfig`. Файл байт-идентичен в HRMS и KTM
 * (сверяется scripts/verify-sync.mjs, режим content + version).
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { authHostConfig } from "@/shared/api/authHostConfig"
import {
  apiClient,
  clearAuthTokens,
  getToken,
  setToken,
  setAuthErrorForLogin,
  resolveAuthShellError,
  AUTH_ERROR_CODES,
  type AuthShellRoleCatalogEntry,
} from "@/shared/api/client"
import { fetchOidcLogoutUrl } from "../api/oidcAuth"

/** Версия auth-shell-модуля — синхронизируется verify-sync (режим content + version). */
export const AUTH_SHELL_VERSION = "1.1.0"

/** Пользователь из единого контракта /auth/me (общее подмножество обоих проектов). */
export interface AuthShellUser {
  id?: number | null
  username: string
  email?: string | null
  full_name: string
  role: string
  section_id?: number | null
  section_ids?: number[]
  is_active?: boolean
  tab_number?: string | null
  avatar_seed?: string | null
  locale?: string | null
  theme?: string | null
  authentik_linked?: boolean
  profile_sot?: string
  is_break_glass?: boolean
}

/**
 * Получение данных текущего авторизованного пользователя.
 * `force=true` → ?refresh=1 — принудительный pull из IdP, обходя TTL-кэш
 * бэкенда (аватар/ФИО/email из Authentik обновляются мгновенно).
 */
async function fetchMeApi(force = false): Promise<AuthShellUser> {
  const { data } = await apiClient.get<AuthShellUser>(force ? "/auth/me?refresh=1" : "/auth/me")
  return data
}

/** Server revoke current session (best-effort before local clear). */
async function logoutApi(): Promise<void> {
  await apiClient.post("/auth/logout")
}

interface AuthContextValue {
  user: AuthShellUser | null
  /** Справочник ролей (KTM: /auth/roles; HRMS — пустой каталог). */
  rolesCatalog: AuthShellRoleCatalogEntry[]
  /** Подпись роли из справочника (fallback — сам код роли). */
  roleLabel: (role: string) => string
  /** Допустимые разделы навигации роли из справочника (пустой список — недоступно). */
  roleSections: (role: string) => string[]
  isAuthenticated: boolean
  isLoading: boolean
  loginWithToken: (accessToken: string) => Promise<void>
  logout: () => void | Promise<void>
  /** Re-fetch /auth/me (unified profile pull). */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthShellUser | null>(null)
  const [rolesCatalog, setRolesCatalog] = useState<AuthShellRoleCatalogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Тема и локаль — из профиля (источник — Authentik). Применяем при каждой
  // загрузке/обновлении пользователя, чтобы настройка не слетала после reload.
  // Способ применения — брендовый (authHostConfig.applyUserPrefs).
  useEffect(() => {
    if (!user) return
    authHostConfig.applyUserPrefs?.(user)
  }, [user])

  const loadRoles = useCallback(async () => {
    if (!authHostConfig.rolesEnabled) {
      setRolesCatalog([])
      return
    }
    try {
      const { data } = await apiClient.get<{ roles: AuthShellRoleCatalogEntry[] }>("/auth/roles")
      setRolesCatalog(data.roles)
    } catch {
      // Справочник недоступен — навигация скрывает недоступные пункты (пустая допустимость).
      setRolesCatalog([])
    }
  }, [])

  // При монтировании проверяем наличие токена и загружаем данные пользователя
  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    void loadRoles()
    // force=true: при загрузке приложения всегда тянем свежий профиль из IdP,
    // обходя TTL-кэш — аватар, изменённый в другом приложении, виден сразу.
    fetchMeApi(true)
      .then((u) => setUser(u))
      .catch(() => {
        setAuthErrorForLogin(
          resolveAuthShellError(null, AUTH_ERROR_CODES.SESSION_EXPIRED).message,
        )
        clearAuthTokens()
      })
      .finally(() => setIsLoading(false))
  }, [loadRoles])

  const loginWithToken = useCallback(
    async (accessToken: string) => {
      setToken(accessToken)
      const me = await fetchMeApi()
      setUser(me)
      void loadRoles()
    },
    [loadRoles],
  )

  const refreshUser = useCallback(async () => {
    // force=true: ручное обновление тоже обходит TTL-кэш (мгновенный pull из IdP)
    const me = await fetchMeApi(true)
    setUser(me)
  }, [])

  const roleLabel = useCallback(
    (role: string): string => rolesCatalog.find((r) => r.code === role)?.label ?? role,
    [rolesCatalog],
  )

  const roleSections = useCallback(
    (role: string): string[] => rolesCatalog.find((r) => r.code === role)?.sections ?? [],
    [rolesCatalog],
  )

  const logout = useCallback(async () => {
    // 1) Best-effort server revoke (needs Authorization while token still present)
    try {
      await logoutApi()
    } catch {
      /* ignore — always clear local tokens */
    }
    // 2) Build the OIDC end-session URL FIRST, while the id_token is still in
    //    localStorage. Navigating must happen before setUser(null): clearing
    //    the React auth state mounts /login, whose auto-SSO fires
    //    window.location.href = authorize — that races with and overrides the
    //    end-session navigation, silently re-logging the user in.
    let ssoUrl: string | null = null
    try {
      const { enabled, logout_url } = await fetchOidcLogoutUrl()
      if (enabled && logout_url) ssoUrl = logout_url
    } catch {
      /* fall through to local /login */
    }
    // 3) Clear app token
    clearAuthTokens()
    // 4) Full SSO logout (Authentik session + all apps). Return before clearing
    //    React state — the page is leaving anyway, and /login auto-SSO must not
    //    get a chance to override this navigation.
    if (ssoUrl) {
      window.location.assign(ssoUrl)
      return
    }
    setUser(null)
    setRolesCatalog([])
    window.location.assign(authHostConfig.loginPath)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        rolesCatalog,
        roleLabel,
        roleSections,
        isAuthenticated: !!user,
        isLoading,
        loginWithToken,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/** Хук для доступа к контексту авторизации */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
