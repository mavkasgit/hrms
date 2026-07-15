import api from "@/shared/api/axios"
import type {
  SystemSettingsResponse,
  SystemSettingsUpdateResponse,
} from "./types"

export const adminSettingsApi = {
  async fetchAll(): Promise<SystemSettingsResponse> {
    const { data } = await api.get<SystemSettingsResponse>("/admin/settings")
    return data
  },

  async update(
    settings: Record<string, string | null>,
  ): Promise<SystemSettingsUpdateResponse> {
    const { data } = await api.put<SystemSettingsUpdateResponse>(
      "/admin/settings",
      { settings },
    )
    return data
  },
}
