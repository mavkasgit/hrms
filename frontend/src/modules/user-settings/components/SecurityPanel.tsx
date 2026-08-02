import { useEffect, useState } from "react"
import { ExternalLink, ShieldCheck } from "lucide-react"
import { useUserSettings } from "../context"
import type { IdpLinks } from "../types"
import { Button } from "../ui"
import { Card, CardHeader } from "./ui-bits"

/**
 * Панель «Безопасность»: карточка SSO с источниками входа.
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={ShieldCheck}
          title={dict.security.idpTitle}
          description={dict.security.idpDescription}
        />
        {idp.user_settings_url && (
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
    </div>
  )
}
