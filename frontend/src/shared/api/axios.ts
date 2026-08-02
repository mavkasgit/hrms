import axios from "axios"
import { showGlobalToast } from "@/shared/ui/use-toast"

declare module "axios" {
  export interface AxiosRequestConfig {
    skipGlobalToast?: boolean
  }
}

/** Проверяет, запущен ли фронтенд в dev/test режиме (VITE_AUTH_MODE=dev|test). */
export function isDevMode(): boolean {
  const mode = import.meta.env.VITE_AUTH_MODE
  return mode === "dev" || mode === "test"
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
})

export function getToken(): string | null {
  // HRMS app token only — cross-app SSO is Authentik OIDC (no ktm2000_token fallback)
  return localStorage.getItem("token")
}

export function redirectToKtmLogin(): void {
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  let ktmLoginURL = ""

  if (isLocalhost) {
    const ktmPort = import.meta.env.VITE_KTM_PORT || "5180"
    ktmLoginURL = `${window.location.protocol}//${window.location.hostname}:${ktmPort}/login`
  } else if (window.location.hostname.endsWith(".local")) {
    const ktmHostname = window.location.hostname.replace("hrms", "ktm")
    ktmLoginURL = `${window.location.protocol}//${ktmHostname}/login`
  } else {
    // В проде KTM-2000 слушает на порту 8082
    ktmLoginURL = `${window.location.protocol}//${window.location.hostname}:8082/login`
  }
  
  window.location.href = ktmLoginURL
}

export async function pingKtm(): Promise<boolean> {
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  let ktmBaseURL = ""

  if (isLocalhost) {
    const ktmPort = import.meta.env.VITE_KTM_PORT || "5180"
    ktmBaseURL = `${window.location.protocol}//${window.location.hostname}:${ktmPort}`
  } else if (window.location.hostname.endsWith(".local")) {
    const ktmHostname = window.location.hostname.replace("hrms", "ktm")
    ktmBaseURL = `${window.location.protocol}//${ktmHostname}`
  } else {
    ktmBaseURL = `${window.location.protocol}//${window.location.hostname}:8082`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 2000)

  try {
    await fetch(`${ktmBaseURL}/favicon.ico`, {
      method: "HEAD",
      mode: "no-cors",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return true
  } catch (e) {
    clearTimeout(timeoutId)
    return false
  }
}

/** sessionStorage key: сообщение об ошибке auth, показывается на /login после редиректа. */
export const AUTH_ERROR_STORAGE_KEY = "hrms_auth_error"

export function setAuthErrorForLogin(message: string): void {
  const text = (message || "").trim()
  if (!text) return
  try {
    sessionStorage.setItem(AUTH_ERROR_STORAGE_KEY, text)
  } catch {
    /* private mode / quota */
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

function clearAuthTokens(): void {
  localStorage.removeItem("token")
}

/** Server revoke current session (best-effort), then clear tokens and redirect.
 * If OIDC is enabled and backend provides end_session URL — best-effort IdP logout.
 */
export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout", undefined, { skipGlobalToast: true })
  } catch {
    /* best-effort — always clear local tokens */
  }
  clearAuthTokens()

  // Optional Authentik end_session (dual-run when OIDC off → just /login)
  try {
    const { fetchOidcLogoutUrl, clearOidcIdToken } = await import(
      "@/shared/api/oidcAuth"
    )
    const { enabled, logout_url } = await fetchOidcLogoutUrl()
    clearOidcIdToken()
    if (enabled && logout_url) {
      window.location.href = logout_url
      return
    }
  } catch {
    /* ignore — fall through to local login */
  }
  window.location.href = "/login"
}

/**
 * Редирект на login с сохранением причины (для 401 «удалён», expired и т.п.).
 * Не глотаем detail бэкенда — пользователь должен его увидеть.
 */
export function redirectToLoginWithError(message: string): void {
  clearAuthTokens()
  setAuthErrorForLogin(message)
  const isLoginPage = window.location.pathname === "/login"
  if (!isLoginPage) {
    window.location.href = "/login"
  }
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function formatErrorMessage(data: any, fallbackMessage: string): string {
  if (!data) return fallbackMessage

  const detail = data.detail !== undefined ? data.detail : data

  if (typeof detail === "string") {
    return detail
  }

  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => {
        if (typeof d === "string") return d
        const field = Array.isArray(d.loc)
          ? d.loc.filter((l: any) => l !== "body" && l !== "query").join(".")
          : ""
        const prefix = field ? `${field}: ` : ""
        return `${prefix}${d.msg || "некорректное значение"}`
      })
      .join("\n")
  }

  if (typeof detail === "object" && detail !== null) {
    const msg = detail.message || detail.error || detail.detail
    if (typeof msg === "string") return msg
    if (typeof msg === "object" && msg !== null) {
      return formatErrorMessage(msg, fallbackMessage)
    }
    try {
      return JSON.stringify(detail)
    } catch (e) {
      return fallbackMessage
    }
  }

  return fallbackMessage
}

/** Эндпоинты, где 401 = «неверный пароль/код», а не «сессия умерла». */
function isCredentialLoginUrl(url: string | undefined): boolean {
  if (!url) return false
  return (
    url.includes("/auth/break-glass/login") ||
    // OIDC code exchange failure — stay on callback, don't loop logout
    url.includes("/auth/oidc/callback")
  )
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Если запрос был отменен клиентом, тихо пропускаем без показа тоста
    if (axios.isCancel(error)) {
      return Promise.reject(error)
    }

    console.error("[API Error]", error.response?.status, error.response?.data || error.message)

    // 401: редирект на login С текстом ошибки (не глотать detail).
    // /auth/me и прочие защищённые URL — тоже (раньше /auth/* молча игнорировали 401).
    if (error.response?.status === 401) {
      const url = error.config?.url as string | undefined
      const isLoginPage = window.location.pathname === "/login"
      const skipRedirect = isCredentialLoginUrl(url) || isLoginPage

      if (!skipRedirect) {
        const detail = formatErrorMessage(
          error.response?.data,
          "Сессия недействительна. Войдите снова."
        )
        showGlobalToast({
          title: "Ошибка входа",
          description: detail,
          variant: "destructive",
        })
        redirectToLoginWithError(detail)
      }
      return Promise.reject(error)
    }

    // Если запрошено подавление глобального тоста, просто возвращаем ошибку
    if (error.config?.skipGlobalToast === true) {
      return Promise.reject(error)
    }

    let title = "Ошибка запроса"
    const status = error.response?.status
    const responseData = error.response?.data
    let description = formatErrorMessage(responseData, error.message || "Неизвестная ошибка")

    if (!error.response) {
      title = "Ошибка сети"
      description = "Сервер недоступен или превышено время ожидания."
    } else if (status === 403) {
      title = "Доступ запрещен"
      description = formatErrorMessage(responseData, "У вас недостаточно прав для выполнения этого действия.")
    } else if (status === 404) {
      title = "Ресурс не найден"
      description = formatErrorMessage(responseData, "Запрошенный ресурс не найден на сервере.")
    } else if (status === 422) {
      title = "Ошибка валидации данных"
      description = formatErrorMessage(responseData, "Ошибка валидации данных.")
    } else if (status >= 500) {
      title = "Ошибка сервера"
      description = formatErrorMessage(responseData, "Внутренняя ошибка сервера. Пожалуйста, попробуйте позже.")
    }

    showGlobalToast({
      title,
      description,
      variant: "destructive",
    })

    return Promise.reject(error)
  }
)

export function getUserAccessLevel(): "admin" | "viewer" | "no_access" {
  const token = getToken()
  if (!token) return "no_access"
  // Dev bypass tokens
  if (token === "admin") return "admin"
  if (token === "viewer") return "viewer"
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    const payload = JSON.parse(jsonPayload)
    return payload.hrms_access_level || "no_access"
  } catch (e) {
    return "no_access"
  }
}

export function isUserAdmin(): boolean {
  return getUserAccessLevel() === "admin"
}

export function isBreakGlassUser(): boolean {
  const token = getToken()
  if (!token) return false
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    const payload = JSON.parse(jsonPayload)
    return Boolean(payload.is_break_glass)
  } catch (e) {
    return false
  }
}

export default api
