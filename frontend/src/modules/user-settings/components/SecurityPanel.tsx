import { useEffect, useState, type ComponentType } from "react"
import { ExternalLink, LayoutDashboard, ShieldCheck } from "lucide-react"
import { useUserSettings } from "../context"
import type { IdpLinks } from "../types"
import { Button } from "../ui"
import { Card, CardHeader } from "./ui-bits"

/**
 * Панель «Безопасность»: карточка SSO с двумя переходами в Authentik.
 *
 * Self-service управление локальным паролем убрано: вход выполняется
 * через единый вход (IdP), парольные политики живут на стороне IdP.
 */
export function SecurityPanel() {
  const { api, dict, features, profile } = useUserSettings()

  const [idp, setIdp] = useState<IdpLinks | null>(null)

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
  if (!features.idp || !idp?.oidc_enabled) return null

  const open = (url: string | null | undefined) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer")
  }

  const IdpButton = ({
    url,
    icon: Icon,
    label,
  }: {
    url: string | null | undefined
    icon: ComponentType<{ className?: string }>
    label: string
  }) =>
    url ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 rounded-xl text-xs"
        onClick={() => open(url)}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Button>
    ) : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={ShieldCheck}
          title={dict.security.idpTitle}
          description={dict.security.idpDescription}
        />
        <div className="flex flex-wrap items-center gap-2">
          <IdpButton
            url={idp.sso_dashboard_url}
            icon={LayoutDashboard}
            label={dict.security.idpDashboard}
          />
          <IdpButton
            url={idp.user_settings_url}
            icon={ExternalLink}
            label={dict.security.idpOpen}
          />
        </div>
      </Card>
    </div>
  )
}
