import type {
  IdpLinks,
  LoginEvent,
  ProfilePatch,
  SessionListResult,
  UserProfile,
} from "../types"
import type { UserSettingsApi } from "./adapter"

/**
 * Готовый адаптер на чистом fetch — без зависимости от axios,
 * чтобы модуль работал в любом React-приложении.
 *
 * Эндпоинты по умолчанию совпадают с бэкендом семейства HRMS/KTM,
 * любой путь можно переопределить через `endpoints`.
 */

export interface HttpAdapterEndpoints {
  getProfile: string
  updateProfile: string
  updateAvatar: string
  idpLinks: string
  sessions: string
  session: (id: string) => string
  revokeOthers: string
  loginEvents: string
}

const DEFAULT_ENDPOINTS: HttpAdapterEndpoints = {
  getProfile: "/auth/me",
  updateProfile: "/auth/me/profile",
  updateAvatar: "/auth/me/avatar",
  idpLinks: "/auth/me/links",
  sessions: "/auth/sessions",
  session: (id) => `/auth/sessions/${encodeURIComponent(id)}`,
  revokeOthers: "/auth/sessions/others",
  loginEvents: "/auth/me/login-events",
}

export interface HttpAdapterOptions {
  /** Базовый префикс API, например "/api". */
  baseUrl?: string
  /** Токен авторизации (Bearer). */
  getToken?: () => string | null
  /** Переопределение путей эндпоинтов. */
  endpoints?: Partial<HttpAdapterEndpoints>
  /** Своя реализация fetch (тесты, SSR). */
  fetchImpl?: typeof fetch
  /** Дополнительные заголовки. */
  headers?: Record<string, string>
}

/** Ошибка адаптера с человекочитаемым detail от бэкенда. */
export class HttpAdapterError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "HttpAdapterError"
    this.status = status
  }
}

export function createHttpAdapter(options: HttpAdapterOptions = {}): UserSettingsApi {
  const {
    baseUrl = "/api",
    getToken,
    fetchImpl = fetch,
    headers: extraHeaders,
  } = options
  const ep: HttpAdapterEndpoints = { ...DEFAULT_ENDPOINTS, ...options.endpoints }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { ...extraHeaders }
    const token = getToken?.()
    if (token) headers["Authorization"] = `Bearer ${token}`
    if (body !== undefined) headers["Content-Type"] = "application/json"

    const res = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    })

    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const data = await res.json()
        if (typeof data?.detail === "string") detail = data.detail
      } catch {
        /* тело не JSON — оставляем HTTP-код */
      }
      throw new HttpAdapterError(detail, res.status)
    }

    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    getProfile: (refresh?: boolean) =>
      request<UserProfile>(
        "GET",
        refresh ? `${ep.getProfile}?refresh=1` : ep.getProfile,
      ),

    updateProfile: (patch: ProfilePatch) =>
      request<Partial<UserProfile>>("PATCH", ep.updateProfile, patch),

    updateAvatar: (seed) =>
      request<{ avatar_seed: string | null }>("PATCH", ep.updateAvatar, {
        avatar_seed: seed,
      }),

    getIdpLinks: () => request<IdpLinks>("GET", ep.idpLinks),

    listSessions: () =>
      request<SessionListResult>("GET", ep.sessions),

    revokeSession: async (id) => {
      await request<void>("DELETE", ep.session(id))
    },

    revokeOtherSessions: async () => {
      await request<void>("DELETE", ep.revokeOthers)
    },

    listLoginEvents: (limit = 50) =>
      request<LoginEvent[]>("GET", `${ep.loginEvents}?limit=${limit}`),
  }
}
