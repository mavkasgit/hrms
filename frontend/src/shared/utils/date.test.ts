import { afterEach, describe, expect, it, vi } from "vitest"
import { toIsoLocal, todayIsoLocal } from "./date"

/**
 * Фиксирует момент времени и часовой пояс процесса.
 * TZ читается Date лениво, поэтому смена пояса действует сразу.
 */
function freezeAt(iso: string, timeZone: string) {
  vi.stubEnv("TZ", timeZone)
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("todayIsoLocal", () => {
  it("UTC+3, ночь: локальная дата уже следующая, а UTC-дата — предыдущая", () => {
    freezeAt("2026-11-18T22:30:00Z", "Europe/Moscow")

    // Так считала дата документа до исправления (#108) — вчерашняя дата
    expect(new Date().toISOString().split("T")[0]).toBe("2026-11-18")
    expect(todayIsoLocal()).toBe("2026-11-19")
  })

  it("UTC-5, вечер: локальный день ещё не наступил по UTC", () => {
    freezeAt("2026-11-19T03:30:00Z", "America/New_York")

    expect(new Date().toISOString().split("T")[0]).toBe("2026-11-19")
    expect(todayIsoLocal()).toBe("2026-11-18")
  })

  it("UTC+7 вечером: совпадает с календарным днём пользователя", () => {
    freezeAt("2026-11-18T12:00:00Z", "Asia/Novosibirsk")

    expect(todayIsoLocal()).toBe("2026-11-18")
  })
})

describe("toIsoLocal", () => {
  it("берёт календарные компоненты даты в локальном поясе", () => {
    vi.stubEnv("TZ", "Europe/Moscow")

    expect(toIsoLocal(new Date("2026-01-01T21:00:00Z"))).toBe("2026-01-02")
    expect(toIsoLocal(new Date("2026-01-01T20:30:00Z"))).toBe("2026-01-01")
  })

  it("возвращает пустую строку для невалидной даты", () => {
    expect(toIsoLocal(new Date("не дата"))).toBe("")
  })
})
