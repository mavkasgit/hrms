// @vitest-environment node

import { describe, expect, it, vi } from "vitest"
import { createHttpAdapter } from "./http-adapter"

function mockFetch() {
  const calls: { url: string }[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    calls.push({ url: String(url) })
    return new Response(
      JSON.stringify({
        username: "ivan",
        full_name: "Иван",
        role: "admin",
        avatar_seed: null,
        email: null,
        locale: "ru",
        theme: "system",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  })
  return { fetchImpl, calls }
}

describe("createHttpAdapter getProfile(refresh)", () => {
  it("без refresh не добавляет параметр", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    await api.getProfile()
    expect(calls[0].url).toBe("/api/auth/me")
  })

  it("getProfile(true) добавляет ?refresh=1 (мгновенная синхронизация)", async () => {
    const { fetchImpl, calls } = mockFetch()
    const api = createHttpAdapter({ baseUrl: "/api", fetchImpl })
    await api.getProfile(true)
    expect(calls[0].url).toBe("/api/auth/me?refresh=1")
  })
})
