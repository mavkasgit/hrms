import api from "@/shared/api/axios"
import type {
  IdpLinks,
  LoginEvent,
  SessionInfo,
  UserProfile,
  UserSettingsApi,
} from "@/modules/user-settings"

/**
 * Адаптер модуля user-settings к бэкенду HRMS.
 *
 * Реализован поверх проектного axios-инстанса (а не createHttpAdapter),
 * чтобы сохранить общие интерсепторы: обработку 401, глобальные тосты и т.д.
 */
export const hrmsUserSettingsApi: UserSettingsApi = {
  async getProfile(): Promise<UserProfile> {
    const { data } = await api.get<UserProfile>("/auth/me")
    return data
  },

  async updateProfile(patch) {
    const { data } = await api.patch<Partial<UserProfile>>(
      "/users/me/profile",
      patch,
    )
    return data
  },

  async updateAvatar(seed) {
    const { data } = await api.patch<{ avatar_seed: string | null }>(
      "/users/me/avatar",
      { avatar_seed: seed },
    )
    return data
  },

  async setPassword(password) {
    await api.post("/users/me/setup-password", { password })
  },

  async getIdpLinks(): Promise<IdpLinks> {
    const { data } = await api.get<IdpLinks>("/idp/links")
    return data
  },

  async listSessions(): Promise<SessionInfo[]> {
    const { data } = await api.get<SessionInfo[]>("/auth/sessions")
    return data
  },

  async revokeSession(id) {
    await api.delete(`/auth/sessions/${encodeURIComponent(id)}`)
  },

  async revokeOtherSessions() {
    await api.delete("/auth/sessions", { params: { scope: "others" } })
  },

  async listLoginEvents(limit = 50): Promise<LoginEvent[]> {
    const { data } = await api.get<LoginEvent[]>("/auth/login-events", {
      params: { limit },
    })
    return data
  },
}
