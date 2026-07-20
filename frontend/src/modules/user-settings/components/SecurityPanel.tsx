import { useEffect, useState } from "react"
import {
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"
import { useUserSettings } from "../context"
import { interpolate, type UserSettingsDict } from "../i18n"
import { formatDateTime } from "../lib/datetime"
import { estimatePasswordStrength } from "../lib/password"
import type { IdpLinks } from "../types"
import { Button, Input, cn } from "../ui"
import { Card, CardHeader, Field, StatusPill } from "./ui-bits"

const MIN_PASSWORD_LENGTH = 4

const STRENGTH_META: Array<{
  label: (d: UserSettingsDict) => string
  barClass: string
}> = [
  { label: () => "", barClass: "bg-muted" },
  { label: (d) => d.security.strengthWeak, barClass: "bg-red-500" },
  { label: (d) => d.security.strengthFair, barClass: "bg-amber-500" },
  { label: (d) => d.security.strengthGood, barClass: "bg-lime-500" },
  { label: (d) => d.security.strengthStrong, barClass: "bg-green-500" },
]

function PasswordField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  onChange: (v: string) => void
}) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          autoComplete="new-password"
          className="rounded-xl pr-10"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "hide password" : "show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  )
}

/**
 * Панель «Безопасность»: блок SSO (если настроен IdP) и локальный пароль.
 */
export function SecurityPanel() {
  const { api, dict, profile, features, refreshProfile, notify } =
    useUserSettings()

  const [idp, setIdp] = useState<IdpLinks | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!features.idp || !api.getIdpLinks) return
    let cancelled = false
    api
      .getIdpLinks()
      .then((links) => {
        if (!cancelled) setIdp(links)
      })
      .catch(() => {
        /* IdP недоступен — блок просто не показываем */
      })
    return () => {
      cancelled = true
    }
  }, [api, features.idp])

  if (!profile) return null

  const hasPassword = Boolean(profile.has_password)
  const strength = estimatePasswordStrength(password)
  const strengthMeta = STRENGTH_META[strength.score]
  const showIdpCard = Boolean(features.idp && idp?.oidc_enabled)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(
        interpolate(dict.security.errorTooShort, { min: MIN_PASSWORD_LENGTH }),
      )
      return
    }
    if (password !== confirm) {
      setError(dict.security.errorMismatch)
      return
    }

    setSaving(true)
    try {
      await api.setPassword(password)
      setPassword("")
      setConfirm("")
      setSuccess(true)
      await refreshProfile()
      notify?.({ title: dict.security.success, variant: "success" })
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data
          ?.detail
      setError(typeof detail === "string" ? detail : dict.errors.password)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {showIdpCard && (
        <Card>
          <CardHeader
            icon={ShieldCheck}
            title={dict.security.idpTitle}
            description={dict.security.idpDescription}
          />
          {idp?.user_settings_url && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl text-xs"
              onClick={() =>
                window.open(idp.user_settings_url!, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {dict.security.idpOpen}
            </Button>
          )}
        </Card>
      )}

      {features.password && (
        <Card>
          <CardHeader
            icon={KeyRound}
            title={
              <>
                {hasPassword
                  ? dict.security.passwordSetTitle
                  : dict.security.passwordSetupTitle}{" "}
                {hasPassword ? (
                  <StatusPill tone="success" icon={ShieldCheck}>
                    {dict.security.passwordStatusSet}
                  </StatusPill>
                ) : (
                  <StatusPill tone="warning" icon={ShieldAlert}>
                    {dict.security.passwordStatusNotSet}
                  </StatusPill>
                )}
              </>
            }
            description={dict.security.passwordDescription}
          />

          <p className="mb-4 text-xs text-muted-foreground">
            {hasPassword
              ? profile.password_changed_at
                ? `${dict.security.lastChanged}: ${formatDateTime(profile.password_changed_at, dict.meta.intl)}`
                : dict.security.lastChangedUnknown
              : dict.security.neverSet}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <PasswordField
                id="us-new-password"
                label={dict.security.newPasswordLabel}
                value={password}
                placeholder={dict.security.newPasswordPlaceholder}
                onChange={(v) => {
                  setPassword(v)
                  setError(null)
                  setSuccess(false)
                }}
              />
              <PasswordField
                id="us-confirm-password"
                label={dict.security.confirmPasswordLabel}
                value={confirm}
                placeholder={dict.security.confirmPasswordPlaceholder}
                onChange={(v) => {
                  setConfirm(v)
                  setError(null)
                  setSuccess(false)
                }}
              />
            </div>

            {/* Индикатор надёжности */}
            {password.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        step <= strength.score
                          ? strengthMeta.barClass
                          : "bg-muted",
                      )}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {dict.security.strengthLabel}: {strengthMeta.label(dict)}
                </p>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            {success && (
              <p className="text-xs text-green-600 dark:text-green-500">
                {dict.security.success}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground/80">
                {dict.security.revokeNote}
              </p>
              <Button
                type="submit"
                disabled={saving || !password || !confirm}
                className="shrink-0 rounded-xl text-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    {dict.common.saving}
                  </>
                ) : hasPassword ? (
                  dict.security.submitChange
                ) : (
                  dict.security.submitSet
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
