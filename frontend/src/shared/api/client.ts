/**
 * Единый API-клиент auth-shell (axios-инстанс + auth-интерсепторы).
 *
 * ОБЩИЙ МОДУЛЬ: не содержит бренд-значений. Базовый URL, token/cookie-ключи,
 * ключ storage-ошибок входа, словарь RU-текстов ошибок и способ перевода
 * серверных сообщений заданы в хостовом файле `./authHostConfig`. Файл
 * байт-идентичен в HRMS и KTM (сверяется scripts/verify-sync.mjs,
 * режим content + version).
 */
import axios from "axios"

import { authHostConfig } from "./authHostConfig"

declare module "axios" {
  export interface AxiosRequestConfig {
    /** Подавить глобальный тост ошибки (брендовый хук authHostConfig.onApiError; HRMS). */
    skipGlobalToast?: boolean
  }
}

/** Версия auth-shell-модуля — синхронизируется verify-sync (режим content + version). */
export const AUTH_SHELL_VERSION = "1.0.0"

export const API_BASE_URL = authHostConfig.apiBase

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
})

export default apiClient

/** Запись справочника ролей (KTM: /auth/roles; HRMS — пустой каталог). */
export interface AuthShellRoleCatalogEntry {
  code: string
  label: string
  sections: string[]
}

/** Поля профиля, влияющие на UI (theme/locale) — применяет бренд (authHostConfig.applyUserPrefs). */
export interface AuthShellUserPrefs {
  theme?: string | null
  locale?: string | null
}

/** Ключ sessionStorage «проскочившей» ошибки входа (пишет interceptor / useAuth, читает LoginPage). */
export const AUTH_ERROR_STORAGE_KEY = authHostConfig.authErrorStorageKey

export function getToken(): string | null {
  try {
    return localStorage.getItem(authHostConfig.tokenKey)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(authHostConfig.tokenKey, token)
    if (authHostConfig.cookieKey) {
      document.cookie = `${authHostConfig.cookieKey}=${token}; path=/; max-age=86400; SameSite=Lax`
    }
  } catch {
    /* ignore private mode / quota */
  }
}

export function clearAuthTokens(): void {
  try {
    localStorage.removeItem(authHostConfig.tokenKey)
  } catch {
    /* ignore */
  }
  if (authHostConfig.cookieKey) {
    try {
      document.cookie = `${authHostConfig.cookieKey}=; path=/; max-age=0`
    } catch {
      /* ignore */
    }
  }
}

/** Interceptor: подставляет Authorization-заголовок из localStorage */
apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** Машинные коды ошибок auth-shell — ключи хостового словаря authHostConfig.errorText. */
export const AUTH_ERROR_CODES = {
  SESSION_EXPIRED: "AUTH_SESSION_EXPIRED",
  BREAK_GLASS_DISABLED: "AUTH_BREAK_GLASS_DISABLED",
  BREAK_GLASS_INVALID: "AUTH_BREAK_GLASS_INVALID",
  BREAK_GLASS_FAILED: "AUTH_BREAK_GLASS_FAILED",
  LOGIN_OIDC_FAILED: "AUTH_OIDC_LOGIN_FAILED",
  ME_FAILED: "AUTH_ME_FAILED",
  LOGOUT_FAILED: "AUTH_LOGOUT_FAILED",
  HTTP_401: "AUTH_HTTP_401",
  HTTP_403: "AUTH_HTTP_403",
  HTTP_5XX: "AUTH_HTTP_5XX",
  UNKNOWN: "AUTH_UNKNOWN",
} as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]

export type AuthShellErrorDisplay = {
  code: string
  title: string
  message: string
  httpStatus?: number
}

export function isAuthPagePath(path: string): boolean {
  return path === authHostConfig.loginPath || path.startsWith("/auth/")
}

export function setAuthErrorForLogin(message: string): void {
  const text = (message || "").trim()
  if (!text) return
  try {
    sessionStorage.setItem(AUTH_ERROR_STORAGE_KEY, text)
  } catch {
    /* ignore private mode / quota */
  }
}

/** Прочитать и снять сохранённую ошибку (один раз). */
export function consumeAuthErrorForLogin(): string | null {
  try {
    const text = sessionStorage.getItem(AUTH_ERROR_STORAGE_KEY)
    if (text) sessionStorage.removeItem(AUTH_ERROR_STORAGE_KEY)
    return text
  } catch {
    return null
  }
}

/** Очистить токены и редиректнуть на /login, сохранив причину (для 401 «удалён», expired и т.п.). */
export function redirectToLoginWithError(message: string): void {
  clearAuthTokens()
  setAuthErrorForLogin(message)
  if (typeof window !== "undefined" && window.location.pathname !== authHostConfig.loginPath) {
    window.location.assign(authHostConfig.loginPath)
  }
}

/** Normalize FastAPI `detail` (string | {msg} | array | nested) → text. */
function extractDetail(detail: unknown): string {
  if (detail == null) return ""
  if (typeof detail === "string") return detail.trim()
  if (typeof detail === "number" || typeof detail === "boolean") return String(detail)
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg)
        }
        return ""
      })
      .filter(Boolean)
      .join("; ")
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>
    for (const key of ["detail", "code", "message", "error"]) {
      if (typeof o[key] === "string") return (o[key] as string).trim()
    }
    try {
      return JSON.stringify(detail)
    } catch {
      return ""
    }
  }
  return ""
}

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "response" in error) {
    const axErr = error as { response?: { status?: number } }
    return axErr.response?.status
  }
  return undefined
}

function errorDetail(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const axErr = error as { response?: { status?: number; data?: { detail?: unknown } } }
    return extractDetail(axErr.response?.data?.detail)
  }
  if (error instanceof Error) return error.message.trim()
  return ""
}

/**
 * Сопоставить ошибку auth-shell с машинным кодом и собрать RU-текст
 * из хостового словаря (authHostConfig.errorText).
 */
export function resolveAuthShellError(
  error: unknown,
  fallbackCode: AuthErrorCode = AUTH_ERROR_CODES.UNKNOWN,
): AuthShellErrorDisplay {
  const httpStatus = errorStatus(error)
  const detail = errorDetail(error).toLowerCase()
  const fallback =
    httpStatus != null
      ? httpStatus >= 500
        ? AUTH_ERROR_CODES.HTTP_5XX
        : httpStatus === 403
          ? AUTH_ERROR_CODES.HTTP_403
          : httpStatus === 401
            ? AUTH_ERROR_CODES.HTTP_401
            : fallbackCode
      : fallbackCode

  let code: string = fallbackCode
  if (fallbackCode === AUTH_ERROR_CODES.BREAK_GLASS_FAILED) {
    if (detail.includes("отключен")) code = AUTH_ERROR_CODES.BREAK_GLASS_DISABLED
    else if (detail.includes("неверн")) code = AUTH_ERROR_CODES.BREAK_GLASS_INVALID
  } else if (fallbackCode === AUTH_ERROR_CODES.UNKNOWN) {
    code = fallback
  }

  const entry = authHostConfig.errorText[code] ?? authHostConfig.errorText[AUTH_ERROR_CODES.UNKNOWN]
  const raw = errorDetail(error)
  const message = entry.withDetail && raw ? `${entry.message} ${raw}` : entry.message
  return { code, title: entry.title, message, httpStatus }
}

/** Interceptor: при 401 очищает токен и перенаправляет на /login с сохранением причины.
 *  Остальные ошибки (если не подавлены) отдаёт брендовому хуку authHostConfig.onApiError. */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error)
    const path = typeof window !== "undefined" ? window.location.pathname : ""
    const reqUrl = String(error?.config?.url ?? "")
    // Logout is best-effort in useAuth — do not race-redirect mid-logout flow
    const isLogoutCall = reqUrl.includes("/auth/logout")
    const status = error?.response?.status
    const skipToast = Boolean(error?.config?.skipGlobalToast)
    if (status === 401) {
      if (!isAuthPagePath(path) && !isLogoutCall) {
        const display = resolveAuthShellError(error)
        redirectToLoginWithError(display.message)
      }
    } else if (!skipToast) {
      authHostConfig.onApiError?.({
        status,
        message: getErrorMessage(error),
      })
    }
    return Promise.reject(error)
  },
)

export type ApiErrorResponse = {
  detail?: string | ValidationErrorItem[] | Record<string, unknown>
}

type ValidationErrorItem = {
  type?: string
  loc?: (string | number)[]
  msg?: string
  input?: unknown
  ctx?: Record<string, unknown>
}

function translateDetail(text: string): string {
  if (!text) return text
  return authHostConfig.translateDetail ? authHostConfig.translateDetail(text) : text
}

/** Преобразует detail из FastAPI (строка или массив pydantic-ошибок) в текст */
export function formatApiDetail(detail: unknown): string {
  if (detail == null) return ""
  if (typeof detail === "string") return translateDetail(detail)
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return translateDetail(item)
        if (item && typeof item === "object" && "msg" in item) {
          const ve = item as ValidationErrorItem
          const field = ve.loc?.filter((part) => part !== "body").join(" → ") ?? ""
          const message = ve.msg ? translateDetail(ve.msg) : ""
          return field ? `${field}: ${message}` : message
        }
        return String(item)
      })
      .filter(Boolean)
      .join("\n")
  }
  if (typeof detail === "object" && "msg" in detail) {
    return formatApiDetail([(detail as ValidationErrorItem)])
  }
  return translateDetail(String(detail))
}

/** Extract a human-readable error message from an Axios error */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "response" in error) {
    const axErr = error as { response?: { status?: number; data?: ApiErrorResponse } }
    const status = axErr.response?.status
    const detail = axErr.response?.data?.detail
    if (detail != null) {
      const formatted = formatApiDetail(detail)
      if (formatted) return formatted
    }
    if (status) return `HTTP ${status}: ${axErr.response?.data ? JSON.stringify(axErr.response.data) : "Нет тела ответа"}`
  }
  if (error instanceof Error) return translateDetail(error.message)
  return translateDetail(String(error ?? ""))
}
