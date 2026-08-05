// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { UserSettingsDialog } from "./UserSettingsDialog"
import type { UserSettingsApi } from "./api/adapter"
import type {
  LoginEventListResult,
  SessionListResult,
  UserProfile,
} from "./types"

const profile: UserProfile = {
  username: "ivan",
  full_name: "Иван Иванов",
  email: "ivan@example.com",
  role: "admin",
  avatar_seed: "abc12345",
  locale: "ru",
  theme: "system",
}

function makeSession(id: string, isCurrent: boolean) {
  return {
    id,
    device_label: `Session ${id}`,
    ip_address: "10.0.0.1",
    user_agent: null,
    login_method: "oidc",
    created_at: "2026-07-20T09:00:00Z",
    last_seen_at: "2026-07-20T10:00:00Z",
    is_current: isCurrent,
  }
}

function makeEvent(id: string) {
  return {
    id,
    success: true,
    ip_address: "10.0.0.1",
    device_label: `Event ${id}`,
    login_method: "oidc",
    created_at: "2026-07-20T10:00:00Z",
  }
}

function createApi(overrides: Partial<UserSettingsApi> = {}): UserSettingsApi {
  return {
    getProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async (patch) => ({ ...profile, ...patch })),
    updateAvatar: vi.fn(async (seed) => ({ avatar_seed: seed })),
    getIdpLinks: vi.fn(async () => ({
      oidc_enabled: false,
      user_settings_url: null,
      sso_dashboard_url: null,
    })),
    listSessions: vi.fn(async (): Promise<SessionListResult> => ({
      sessions: [makeSession("s1", true)],
      total: 1,
    })),
    revokeSession: vi.fn(async () => undefined),
    revokeOtherSessions: vi.fn(async () => undefined),
    listLoginEvents: vi.fn(
      async (): Promise<LoginEventListResult> => ({ events: [], total: 0 }),
    ),
    ...overrides,
  }
}

function renderDialog(api: UserSettingsApi = createApi()) {
  const onOpenChange = vi.fn()
  render(<UserSettingsDialog open onOpenChange={onOpenChange} api={api} />)
  return { onOpenChange }
}

describe("UserSettingsDialog", () => {
  it("загружает профиль и показывает все разделы навигации", async () => {
    const api = createApi()
    renderDialog(api)

    expect(await screen.findByText("ivan")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Профиль" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Внешний вид" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Безопасность" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Сессии" })).toBeTruthy()
    // Открытый раздел по умолчанию — профиль
    expect(
      screen.getByRole("heading", { name: "Профиль" }),
    ).toBeTruthy()
    // Открытие диалога — БЕЗ refresh-форса (TTL-кэш бэкенда)
    expect(api.getProfile).toHaveBeenCalledWith(false)
  })

  it("показывает ФИО/email как read-only (без формы и SaveBar)", async () => {
    const api = createApi()
    renderDialog(api)

    // ФИО видно и в сайдбаре диалога, и в read-only поле
    expect((await screen.findAllByText("Иван Иванов")).length).toBeGreaterThan(0)
    expect(screen.getByText("ivan@example.com")).toBeTruthy()
    // Нет редактируемых полей ввода
    expect(screen.queryByRole("textbox")).toBeNull()
    // Нет SaveBar
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull()
  })

  it("после смены аватара вызывает getProfile с refresh=1", async () => {
    const api = createApi()
    renderDialog(api)
    expect(await screen.findByText("ivan")).toBeTruthy()

    // Открываем пикер аватара (аватар остаётся self-service)
    fireEvent.click(screen.getByRole("button", { name: "Изменить аватар" }))
    const previews = await screen.findAllByLabelText(/Выбрать аватар/)
    fireEvent.click(previews[0])

    await waitFor(() => expect(api.updateAvatar).toHaveBeenCalled())
    await waitFor(() => expect(api.getProfile).toHaveBeenLastCalledWith(true))
  })

  it("переключается на раздел «Сессии» и показывает счётчик «последние N из total»", async () => {
    renderDialog()
    expect(await screen.findByText("ivan")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Сессии" }))

    expect(
      await screen.findByRole("heading", { name: "Активные сессии" }),
    ).toBeTruthy()
    expect(await screen.findByText("Session s1")).toBeTruthy()
    expect(screen.getByText("Текущий сеанс")).toBeTruthy()
    expect(screen.getByText("Последние 1 из 1")).toBeTruthy()
  })

  it("в «Сессиях» показывает максимум 10 из N (последние 10 из 12)", async () => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      makeSession(`s${i}`, i === 0),
    )
    const api = createApi({
      listSessions: vi.fn(async (): Promise<SessionListResult> => ({
        sessions: sessions.slice(0, 10),
        total: sessions.length,
      })),
    })
    renderDialog(api)
    expect(await screen.findByText("ivan")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Сессии" }))
    expect(await screen.findByText("Последние 10 из 12")).toBeTruthy()
    // Рендерится только список sessions (10), не все 12
    expect(screen.getAllByText(/^Session s\d+$/).length).toBe(10)
    // Кнопка «завершить все остальные» остаётся
    expect(
      screen.getByRole("button", { name: "Завершить другие сессии" }),
    ).toBeTruthy()
  })

  it("в «Истории входов» показывает максимум 10 из N (последние 10 из 12)", async () => {
    const events = Array.from({ length: 12 }, (_, i) => makeEvent(`e${i}`))
    const api = createApi({
      listLoginEvents: vi.fn(
        async (): Promise<LoginEventListResult> => ({
          events: events.slice(0, 10),
          total: events.length,
        }),
      ),
    })
    renderDialog(api)
    expect(await screen.findByText("ivan")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Сессии" }))
    expect(await screen.findByText("Последние 10 из 12")).toBeTruthy()
    // Рендерится только список events (10), не все 12
    expect(screen.getAllByText(/Event e\d+/).length).toBe(10)
  })

  it("скрывает счётчик истории, когда показаны все записи", async () => {
    const api = createApi({
      listSessions: vi.fn(
        async (): Promise<SessionListResult> => ({ sessions: [], total: 0 }),
      ),
      listLoginEvents: vi.fn(
        async (): Promise<LoginEventListResult> => ({
          events: [makeEvent("e1")],
          total: 1,
        }),
      ),
    })
    renderDialog(api)
    expect(await screen.findByText("ivan")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Сессии" }))
    expect(await screen.findByText(/Event e1/)).toBeTruthy()
    // Счётчик «Последние 1 из 1» — шум, прячем (все записи видны)
    expect(screen.queryByText("Последние 1 из 1")).toBeNull()
  })

  it("закрывает диалог без подтверждения (read-only форма не «грязнится»)", async () => {
    const { onOpenChange } = renderDialog()
    expect(await screen.findByText("ivan")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /закрыть|close/i }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(
      screen.queryByText("Отменить несохранённые изменения?"),
    ).toBeNull()
  })

  it("скрывает раздел «Сессии», если адаптер не умеет listSessions", async () => {
    const api = createApi()
    delete api.listSessions
    delete api.revokeSession
    delete api.revokeOtherSessions
    delete api.listLoginEvents
    renderDialog(api)

    expect(await screen.findByText("ivan")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Сессии" })).toBeNull()
  })

  it("в «Безопасности» показывает две кнопки SSO с корректными URL", async () => {
    const api = createApi({
      getIdpLinks: vi.fn(async () => ({
        oidc_enabled: true,
        user_settings_url: "https://sso.example.com/if/user/#/settings",
        sso_dashboard_url: "https://sso.example.com/if/user/",
      })),
    })
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)
    try {
      renderDialog(api)
      expect(await screen.findByText("ivan")).toBeTruthy()

      fireEvent.click(screen.getByRole("button", { name: "Безопасность" }))

      const dashboard = await screen.findByRole("button", {
        name: "Дашборд SSO",
      })
      const settings = screen.getByRole("button", {
        name: "Открыть настройки входа",
      })
      expect(dashboard).toBeTruthy()
      expect(settings).toBeTruthy()

      fireEvent.click(dashboard)
      fireEvent.click(settings)
      expect(openSpy).toHaveBeenCalledWith(
        "https://sso.example.com/if/user/",
        "_blank",
        "noopener,noreferrer",
      )
      expect(openSpy).toHaveBeenCalledWith(
        "https://sso.example.com/if/user/#/settings",
        "_blank",
        "noopener,noreferrer",
      )

      // Формы установки/смены локального пароля больше нет
      expect(screen.queryByText("Установить пароль")).toBeNull()
      expect(screen.queryByText("Сменить пароль")).toBeNull()
      expect(screen.queryByLabelText("Новый пароль")).toBeNull()
      expect(screen.queryByLabelText("Подтверждение пароля")).toBeNull()
    } finally {
      openSpy.mockRestore()
    }
  })

  it("применяет переопределения словаря (dict override)", async () => {
    const onOpenChange = vi.fn()
    render(
      <UserSettingsDialog
        open
        onOpenChange={onOpenChange}
        api={createApi()}
        dict={{ nav: { sessions: "Устройства" } }}
      />,
    )

    expect(await screen.findByText("ivan")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Устройства" })).toBeTruthy()
  })
})
