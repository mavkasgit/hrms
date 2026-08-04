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
 *
 * Пути — единый каноничный контракт /auth/me/*.
 */
export const hrmsUserSettingsApi: UserSettingsApi = {
  async getProfile(refresh?: boolean): Promise<UserProfile> {
    const { data } = await api.get<UserProfile>("/auth/me", {
      params: refresh ? { refresh: 1 } : undefined,
    })
    return data
  },

  async updateProfile(patch) {
    const { data } = await api.patch<Partial<UserProfile>>(
      "/auth/me/profile",
      patch,
    )
    return data
  },

  async updateAvatar(seed) {
    const { data } = await api.patch<{ avatar_seed: string | null }>(
      "/auth/me/avatar",
      { avatar_seed: seed },
    )
    return data
  },

  async getIdpLinks(): Promise<IdpLinks> {
    const { data } = await api.get<IdpLinks>("/auth/me/links")
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
    await api.delete("/auth/sessions/others")
  },

  async listLoginEvents(limit = 50): Promise<LoginEvent[]> {
    const { data } = await api.get<LoginEvent[]>("/auth/me/login-events", {
      params: { limit },
    })
    return data
  },
}
