import { useState } from "react"
import { Pencil, UserRound } from "lucide-react"
import { useUserSettings } from "../context"
import { Badge, Skeleton } from "../ui"
import { AvatarArt } from "./AvatarArt"
import { AvatarPickerDialog } from "./AvatarPickerDialog"
import { Card, CardHeader, CopyButton, Field, ReadonlyBox } from "./ui-bits"

/**
 * Панель «Профиль»: аватар, логин/роль, ФИО, email.
 *
 * Канон user-settings 2.0.0: ФИО и email — read-only (изменяются только
 * администратором через Authentik). Аватар остаётся self-service.
 * Формы и SaveBar для ФИО/email удалены — панель не «грязнится»,
 * dirty-guard для профиля всегда ложный.
 */
export function ProfilePanel() {
  const { dict, profile, features } = useUserSettings()

  const [avatarOpen, setAvatarOpen] = useState(false)

  if (!profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    )
  }

  const roleLabel =
    profile.role === "admin"
      ? dict.profile.roleAdmin
      : dict.profile.roleViewer

  return (
    <div className="space-y-4">
      {/* Аватар + идентификация */}
      <Card>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
          <div className="group relative inline-flex items-center justify-center p-1.5">
            <AvatarArt
              seed={profile.avatar_seed}
              size={88}
              className="shadow-md"
            />
            {features.avatar && (
              <button
                type="button"
                onClick={() => setAvatarOpen(true)}
                className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                title={dict.profile.avatarChange}
                aria-label={dict.profile.avatarChange}
              >
                <Pencil className="h-6 w-6 text-white drop-shadow-sm" />
              </button>
            )}
          </div>
          <div className="w-full min-w-0 flex-1 space-y-3">
            <Field label={dict.profile.usernameLabel}>
              <ReadonlyBox
                mono
                aside={
                  <CopyButton
                    value={profile.username}
                    label={dict.common.copy}
                    copiedLabel={dict.common.copied}
                  />
                }
              >
                {profile.username}
              </ReadonlyBox>
            </Field>
            <Field label={dict.profile.roleLabel}>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="rounded-lg px-2.5 py-1 text-xs">
                  {roleLabel}
                </Badge>
              </div>
            </Field>
          </div>
        </div>
      </Card>

      {/* ФИО + email (read-only, правятся администратором IdP) */}
      <Card>
        <CardHeader
          icon={UserRound}
          title={dict.profile.dataTitle}
          description={features.idp ? dict.profile.idpSyncHint : undefined}
        />
        <div className="space-y-4">
          <Field label={dict.profile.fullNameLabel}>
            <ReadonlyBox>
              {profile.full_name?.trim() || dict.common.notSet}
            </ReadonlyBox>
          </Field>
          <Field label={dict.profile.emailLabel}>
            <ReadonlyBox>
              {profile.email?.trim() || dict.common.notSet}
            </ReadonlyBox>
          </Field>
        </div>
      </Card>

      {features.avatar && (
        <AvatarPickerDialog open={avatarOpen} onOpenChange={setAvatarOpen} />
      )}
    </div>
  )
}
