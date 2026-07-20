import { useEffect, useMemo, useRef, useState } from "react"
import { Pencil, UserRound } from "lucide-react"
import { useUserSettings } from "../context"
import { Badge, Input, Skeleton } from "../ui"
import { AvatarArt } from "./AvatarArt"
import { AvatarPickerDialog } from "./AvatarPickerDialog"
import { Card, CardHeader, CopyButton, Field, ReadonlyBox, SaveBar } from "./ui-bits"

/**
 * Панель «Профиль»: аватар, логин/роль, полное имя, email.
 * Одна форма + SaveBar: «грязное» состояние видно явно.
 */
export function ProfilePanel() {
  const {
    api,
    dict,
    profile,
    features,
    refreshProfile,
    setDirty,
    notify,
  } = useUserSettings()

  const [avatarOpen, setAvatarOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [emailDraft, setEmailDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const savedTimer = useRef<number | undefined>(undefined)

  const initial = useMemo(
    () => ({
      name: profile?.full_name ?? "",
      email: profile?.email ?? "",
    }),
    [profile?.full_name, profile?.email],
  )

  // Синхронизация черновиков с серверным профилем, пока форма «чистая».
  useEffect(() => {
    if (!dirtyRef.current) {
      setNameDraft(initial.name)
      setEmailDraft(initial.email)
    }
  }, [initial])

  const dirty =
    nameDraft.trim() !== initial.name.trim() ||
    emailDraft.trim() !== initial.email.trim()

  useEffect(() => {
    dirtyRef.current = dirty
    setDirty("profile", dirty)
    return () => setDirty("profile", false)
  }, [dirty, setDirty])

  useEffect(() => () => window.clearTimeout(savedTimer.current), [])

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

  const handleReset = () => {
    setNameDraft(initial.name)
    setEmailDraft(initial.email)
    setError(null)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (saving || !dirty) return
    const name = nameDraft.trim()
    if (!name) {
      setError(dict.errors.name)
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const patch: { full_name: string; email?: string } = { full_name: name }
      if (emailDraft.trim() && emailDraft.trim() !== initial.email.trim()) {
        patch.email = emailDraft.trim()
      }
      await api.updateProfile(patch)
      await refreshProfile()
      dirtyRef.current = false
      setSaved(true)
      window.clearTimeout(savedTimer.current)
      savedTimer.current = window.setTimeout(() => setSaved(false), 2000)
      notify?.({ title: dict.common.saved, variant: "success" })
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail
      setError(typeof detail === "string" ? detail : dict.errors.profile)
    } finally {
      setSaving(false)
    }
  }

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

      {/* Имя + email */}
      <Card>
        <CardHeader
          icon={UserRound}
          title={dict.profile.dataTitle}
          description={features.idp ? dict.profile.idpSyncHint : undefined}
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={dict.profile.fullNameLabel} htmlFor="us-full-name">
            <Input
              id="us-full-name"
              value={nameDraft}
              maxLength={255}
              autoComplete="name"
              placeholder={dict.profile.fullNamePlaceholder}
              className="rounded-xl"
              onChange={(e) => {
                setNameDraft(e.target.value)
                setError(null)
                setSaved(false)
              }}
            />
          </Field>
          <Field
            label={dict.profile.emailLabel}
            htmlFor="us-email"
            error={error ?? undefined}
          >
            <Input
              id="us-email"
              type="email"
              value={emailDraft}
              autoComplete="email"
              placeholder={dict.profile.emailPlaceholder}
              className="rounded-xl"
              onChange={(e) => {
                setEmailDraft(e.target.value)
                setError(null)
                setSaved(false)
              }}
            />
          </Field>
          <SaveBar
            visible={dirty}
            saving={saving}
            saved={saved}
            saveLabel={dict.common.save}
            cancelLabel={dict.common.cancel}
            savingLabel={dict.common.saving}
            savedLabel={dict.common.saved}
            onCancel={handleReset}
          />
        </form>
      </Card>

      {features.avatar && (
        <AvatarPickerDialog open={avatarOpen} onOpenChange={setAvatarOpen} />
      )}
    </div>
  )
}
