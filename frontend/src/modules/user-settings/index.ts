/**
 * user-settings — переносимый модуль настроек пользователя.
 *
 * Публичный API модуля. Импортируйте только отсюда:
 *
 *   import { UserSettingsDialog, createHttpAdapter } from "@/modules/user-settings"
 */

export const USER_SETTINGS_MODULE_VERSION = "2.2.0"

export { UserSettingsDialog } from "./UserSettingsDialog"
export type { UserSettingsDialogProps } from "./UserSettingsDialog"

export type { UserSettingsApi } from "./api/adapter"
export { createHttpAdapter, HttpAdapterError } from "./api/http-adapter"
export type {
  HttpAdapterEndpoints,
  HttpAdapterOptions,
} from "./api/http-adapter"

export { ru, en, resolveDict } from "./i18n"
export type { UserSettingsDict, UserSettingsDictOverride } from "./i18n"

export type {
  IdpLinks,
  LoginEvent,
  NotifyFn,
  ProfilePatch,
  SessionInfo,
  UserLocale,
  UserProfile,
  UserSettingsCallbacks,
  UserSettingsFeatures,
  UserTheme,
} from "./types"

export { AvatarArt } from "./components/AvatarArt"
export { generateAvatarSeed } from "./lib/avatar-seed"
