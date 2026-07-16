import api from "@/shared/api/axios"

export type SessionDto = {
  id: string
  device_label: string | null
  ip_address: string | null
  user_agent: string | null
  login_method: string
  created_at: string
  last_seen_at: string
  is_current: boolean
}

export type LoginEventDto = {
  id: number
  event_type: string
  success: boolean
  ip_address: string | null
  device_label: string | null
  login_method: string | null
  created_at: string
  failure_reason: string | null
}

/** Human-readable login method labels (RU). */
export function formatLoginMethod(method: string | null | undefined): string {
  switch (method) {
    case "password":
      return "Пароль"
    case "invite":
      return "Инвайт"
    case "telegram_widget":
      return "Telegram"
    case "telegram_bot":
      return "Telegram-бот"
    case "oidc":
      return "Единый вход"
    default:
      return method || "—"
  }
}

export async function fetchSessions(): Promise<SessionDto[]> {
  const { data } = await api.get<SessionDto[]>("/auth/sessions")
  return data
}

export async function revokeSession(id: string): Promise<void> {
  await api.delete(`/auth/sessions/${id}`)
}

/** DELETE /auth/sessions?scope=others — revoke all except current. */
export async function revokeOtherSessions(): Promise<void> {
  await api.delete("/auth/sessions", { params: { scope: "others" } })
}

export async function fetchLoginEvents(limit = 50): Promise<LoginEventDto[]> {
  const { data } = await api.get<LoginEventDto[]>("/auth/login-events", {
    params: { limit },
  })
  return data
}

/** Server-side logout (best-effort from callers). */
export async function logoutApi(): Promise<void> {
  await api.post("/auth/logout", undefined, { skipGlobalToast: true })
}
