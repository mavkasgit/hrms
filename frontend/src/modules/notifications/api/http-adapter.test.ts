// @vitest-environment node

import { describe, expect, it, vi } from "vitest"
import { createHttpAdapter } from "./http-adapter"
import type { Notification } from "../types"

function mockFetch() {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) ?? {}),
    )
    calls.push({ url, method: init?.method ?? "GET", headers })
    return new Response(JSON.stringify({ items: [], total: 0, unread_count: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  })
  return { fetchImpl, calls }
}

const notif: Notification = {
  id: 1,
  user_id: null,
  notification_type: "hire",
  title: "Привет",
  text: null,
  entity_type: null,
  entity_id: null,
  created_at: "2026-01-01T10:00:00Z",
  read_at: null,
  closed_at: null,
}

describe("createHttpAdapter notifications", () => {
  it("list() запрашивает незакрытые с лимитом по умолчанию", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    await api.list()
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "/api/internal-notifications?limit=50&only_unclosed=true",
    })
  })

  it("list(10) передаёт свой лимит", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    await api.list(10)
    expect(calls[0].url).toBe("/api/internal-notifications?limit=10&only_unclosed=true")
  })

  it("markRead(id) POST на read-эндпоинт", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    await api.markRead(42)
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/internal-notifications/42/read" })
  })

  it("close(id) POST на close-эндпоинт", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    await api.close(7)
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/internal-notifications/7/close" })
  })

  it("endpoints переопределяются частично", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({
      baseUrl: "/api",
      fetchImpl,
      endpoints: { list: "/custom/notifications" },
    })
    await api.list()
    expect(calls[0].url).toBe("/api/custom/notifications?limit=50&only_unclosed=true")
  })

  it("getToken подставляет Authorization", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({
      baseUrl: "/api",
      fetchImpl,
      getToken: () => "tok-123",
    })
    await api.markRead(1)
    expect(calls[0].headers.Authorization).toBe("Bearer tok-123")
  })

  it("ошибка сервера бросает HttpAdapterError с detail из тела", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ detail: "Нет доступа" }), { status: 403 }),
    )
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    await expect(api.list()).rejects.toMatchObject({
      name: "HttpAdapterError",
      status: 403,
      message: "Нет доступа",
    })
  })

  it("возвращает список и счётчики из тела ответа", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          items: [notif],
          total: 1,
          unread_count: 1,
        }),
        { status: 200 },
      ),
    )
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    const result = await api.list()
    expect(result.items[0].title).toBe("Привет")
    expect(result.unread_count).toBe(1)
  })
})
