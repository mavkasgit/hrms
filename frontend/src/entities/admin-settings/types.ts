/** Системные настройки (admin-only). */

export interface SystemSettingItem {
  key: string
  /** Маскированное значение для секретов; null если пусто. */
  value: string | null
  /** True если в БД есть непустое значение. */
  has_value: boolean
  description: string | null
  updated_at: string
  /** Login (username) кто сохранил — для отображения вместе с ФИО. */
  updated_by: string | null
  /** ФИО пользователя; null если не найден в users. */
  updated_by_full_name?: string | null
}

export interface SystemSettingsResponse {
  settings: SystemSettingItem[]
}

export interface SystemSettingsUpdateResponse {
  updated: string[]
}

/** Известные ключи, с которыми работает UI. */
export const KNOWN_SETTING_KEYS = {
  TELEGRAM_BOT_TOKEN: "telegram.bot_token",
} as const

export type KnownSettingKey =
  (typeof KNOWN_SETTING_KEYS)[keyof typeof KNOWN_SETTING_KEYS]
