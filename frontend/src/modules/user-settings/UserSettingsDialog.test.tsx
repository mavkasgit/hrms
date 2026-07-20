// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { UserSettingsDialog } from "./UserSettingsDialog"
import type { UserSettingsApi } from "./api/adapter"
import type { UserProfile } from "./types"

const profile: UserProfile = {
  username: "ivan",
  full_name: "Иван Иванов",
  email: "ivan@example.com",
  role: "admin",
  avatar_seed: "abc12345",
  locale: "ru",
  theme: "system",
  has_password: true,
  password_changed_at: "2026-07-01T10:00:00Z",
}

function createApi(overrides: Partial<UserSettingsApi> = {}): UserSettingsApi {
  return {
    getProfile: vi.fn(async () => profile),
    updateProfile: vi.fn(async (patch) => ({ ...profile, ...patch })),
    updateAvatar: vi.fn(async (seed) => ({ avatar_seed: seed })),
    setPassword: vi.fn(async () => undefined),
    getIdpLinks: vi.fn(async () => ({
      oidc_enabled: false,
      user_settings_url: null,
    })),
    listSessions: vi.fn(async () => [
      {
        id: "s1",
        device_label: "Windows · Chrome",
        ip_address: "10.0.0.1",
        user_agent: null,
        login_method: "password",
        created_at: "2026-07-20T09:00:00Z",
        last_seen_at: "2026-07-20T10:00:00Z",
        is_current: true,
      },
    ]),
    revokeSession: vi.fn(async () => undefined),
    revokeOtherSessions: vi.fn(async () => undefined),
    listLoginEvents: vi.fn(async () => []),
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
    renderDialog()

    expect(await screen.findByText("ivan")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Профиль" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Внешний вид" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Безопасность" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Сессии" })).toBeTruthy()
    // Открытый раздел по умолчанию — профиль
    expect(
      screen.getByRole("heading", { name: "Профиль" }),
    ).toBeTruthy()
  })

  it("переключается на раздел «Сессии» и показывает активные сеансы", async () => {
    renderDialog()
    expect(await screen.findByText("ivan")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Сессии" }))

    expect(
      await screen.findByRole("heading", { name: "Активные сессии" }),
    ).toBeTruthy()
    expect(await screen.findByText("Windows · Chrome")).toBeTruthy()
    expect(screen.getByText("Текущий сеанс")).toBeTruthy()
  })

  it("спрашивает подтверждение при закрытии с несохранёнными изменениями", async () => {
    const { onOpenChange } = renderDialog()
    expect(await screen.findByText("ivan")).toBeTruthy()

    // «Загрязняем» форму имени
    const nameInput = screen.getByLabelText("Полное имя")
    fireEvent.change(nameInput, { target: { value: "Новое Имя" } })

    // Пытаемся закрыть диалог крестиком
    fireEvent.click(screen.getByRole("button", { name: /close/i }))

    // Диалог НЕ закрылся — вместо этого подтверждение
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(
      await screen.findByText("Отменить несохранённые изменения?"),
    ).toBeTruthy()

    // «Продолжить редактирование» — остаёмся в диалоге
    fireEvent.click(screen.getByText("Продолжить редактирование"))
    await waitFor(() =>
      expect(
        screen.queryByText("Отменить несохранённые изменения?"),
      ).toBeNull(),
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
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
