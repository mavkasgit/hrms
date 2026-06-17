import axios from "axios"

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

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null
  }
  return null
}

export function getToken(): string | null {
  // 1. Try hrms local token
  let token = localStorage.getItem("token")
  if (token) return token

  // 2. Try ktm2000 local token (just in case they share localStorage on the same port/host)
  token = localStorage.getItem("ktm2000_token")
  if (token) {
    localStorage.setItem("token", token)
    return token
  }

  // 3. Try shared cookie
  token = getCookie("ktm2000_token")
  if (token) {
    localStorage.setItem("token", token)
    return token
  }

  return null
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

export function logout(): void {
  localStorage.removeItem("token")
  localStorage.removeItem("ktm2000_token")
  document.cookie = "ktm2000_token=; path=/; max-age=0"
  window.location.href = "/login"
}

/** Запасной вход по логину/паролю через /api/auth/login. */
export async function loginWithPassword(username: string, password: string): Promise<void> {
  const baseURL = import.meta.env.VITE_API_URL || "/api"
  const response = await fetch(`${baseURL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || "Неверный логин или пароль")
  }
  const data = await response.json()
  localStorage.setItem("token", data.access_token)
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("[API Error]", error.response?.status, error.response?.data || error.message)
    if (error.response?.status === 401) {
      localStorage.removeItem("token")
      localStorage.removeItem("ktm2000_token")
      document.cookie = "ktm2000_token=; path=/; max-age=0"
      window.location.href = "/login"
    }
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

export default api
