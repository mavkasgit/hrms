/**
 * Хостовые auth-хелперы HRMS (над общим API-клиентом auth-shell).
 *
 * HRMS-специфичные утилиты, которых нет в общем клиенте (client.ts):
 * разбор HRMS JWT (hrms_access_level / is_break_glass), редирект в KTM-2000
 * и ping KTM-2000. Файл хостовый: в scripts/sync-manifest.json не входит.
 */
import { getToken } from "@/shared/api/client"

/** Проверяет, запущен ли фронтенд в dev/test режиме (VITE_AUTH_MODE=dev|test). */
export function isDevMode(): boolean {
  const mode = import.meta.env.VITE_AUTH_MODE
  return mode === "dev" || mode === "test"
}

/** Редирект на страницу входа KTM-2000 (SSO-хост). */
export function redirectToKtmLogin(): void {
  const isLocalhost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
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

/** Ping KTM-2000 (HEAD /favicon.ico) — живой ли SSO-хост. */
export async function pingKtm(): Promise<boolean> {
  const isLocalhost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
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

function decodeAccessLevelToken(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split(".")[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    )
    return JSON.parse(jsonPayload) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Уровень доступа из HRMS JWT (claim hrms_access_level): "admin" | "viewer" | "no_access". */
export function getUserAccessLevel(): "admin" | "viewer" | "no_access" {
  const token = getToken()
  if (!token) return "no_access"
  // Dev bypass tokens
  if (token === "admin") return "admin"
  if (token === "viewer") return "viewer"
  const payload = decodeAccessLevelToken(token)
  const level = payload?.hrms_access_level
  return level === "admin" ? "admin" : level === "viewer" ? "viewer" : "no_access"
}

export function isUserAdmin(): boolean {
  return getUserAccessLevel() === "admin"
}

export function isBreakGlassUser(): boolean {
  const token = getToken()
  if (!token) return false
  const payload = decodeAccessLevelToken(token)
  return Boolean(payload?.is_break_glass)
}
