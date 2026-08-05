import type { InternalNotification, InternalNotificationList } from "../types"
import type { NotificationsApi } from "./adapter"

/**
 * Готовый адаптер на чистом fetch — без зависимости от axios,
 * чтобы модуль работал в любом React-приложении.
 *
 * Эндпоинты по умолчанию совпадают с бэкендом семейства HRMS/KTM,
 * любой путь можно переопределить через `endpoints`.
 */

export interface HttpAdapterEndpoints {
  list: string
  read: (id: number) => string
  close: (id: number) => string
}

const DEFAULT_ENDPOINTS: HttpAdapterEndpoints = {
  list: "/internal-notifications",
  read: (id) => `/internal-notifications/${id}/read`,
  close: (id) => `/internal-notifications/${id}/close`,
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

export function createHttpAdapter(options: HttpAdapterOptions = {}): NotificationsApi {
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
    list: (limit = 50) =>
      request<InternalNotificationList>(
        "GET",
        `${ep.list}?limit=${limit}&only_unclosed=true`,
      ),

    markRead: (id) =>
      request<InternalNotification>("POST", ep.read(id)),

    close: (id) =>
      request<InternalNotification>("POST", ep.close(id)),
  }
}
