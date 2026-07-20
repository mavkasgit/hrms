import { useMemo } from "react"
import { logout } from "@/shared/api/axios"
import { applyTheme, storeLocale } from "@/shared/lib/profile-prefs"
import { showGlobalToast } from "@/shared/ui/use-toast"
import {
  UserSettingsDialog,
  type UserSettingsCallbacks,
  type UserProfile,
} from "@/modules/user-settings"
import { hrmsUserSettingsApi } from "./hrmsUserSettingsApi"

type HrmsUserSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Колбэк сайдбара: профиль обновился → перечитать currentUser. */
  onProfileUpdated?: () => void
}

/**
 * HRMS-обвязка переносимого модуля user-settings:
 * axios-адаптер + тосты + применение темы/языка + logout.
 */
export function HrmsUserSettingsDialog({
  open,
  onOpenChange,
  onProfileUpdated,
}: HrmsUserSettingsDialogProps) {
  const callbacks = useMemo<UserSettingsCallbacks>(
    () => ({
      onProfileUpdated: (_profile: UserProfile) => onProfileUpdated?.(),
      onThemeChange: applyTheme,
      onLocaleChange: storeLocale,
      onLogoutRequest: () => void logout(),
      notify: showGlobalToast,
    }),
    [onProfileUpdated],
  )

  return (
    <UserSettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      api={hrmsUserSettingsApi}
      callbacks={callbacks}
    />
  )
}
