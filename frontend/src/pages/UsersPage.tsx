import { useCallback, useEffect, useState } from "react"
import {
  Users,
  Shield,
  Loader2,
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { fetchIdpConfig, type IdpConfig } from "@/shared/api/idpAdmin"
import { fetchOidcConfig } from "@/shared/api/oidcAuth"

/**
 * Страница «Пользователи» после удаления админ-IAM (#35).
 *
 * Локальной таблицы и CRUD-диалогов нет: жизненный цикл аккаунтов —
 * только в IdP (Authentik), локальная запись создаётся JIT при первом
 * OIDC-входе.
 * - OIDC включён → ссылки на админку Authentik / IdP Ops.
 * - OIDC выключен → заглушка-предупреждение.
 */
export function UsersPage() {
  const [loaded, setLoaded] = useState(false)
  const [oidcEnabled, setOidcEnabled] = useState(false)
  const [idpConfig, setIdpConfig] = useState<IdpConfig | null>(null)
  const [idpError, setIdpError] = useState("")

  const loadSection = useCallback(async () => {
    setIdpError("")
    try {
      const oidc = await fetchOidcConfig()
      const enabled = Boolean(oidc.enabled)
      setOidcEnabled(enabled)
      if (!enabled) {
        setIdpConfig(null)
        return
      }
      try {
        const cfg = await fetchIdpConfig()
        setIdpConfig(cfg)
      } catch (err) {
        console.error("IdP config failed:", err)
        setIdpError("Не удалось загрузить ссылки IdP")
        setIdpConfig(null)
      }
    } catch {
      setOidcEnabled(false)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void loadSection()
  }, [loadSection])

  const header = (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} title="Назад">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Пользователи
        </h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl pl-12">
        Управление пользователями выполняется в IdP (Authentik). Локальная запись в HRMS
        создаётся автоматически при первом входе через единый вход.
      </p>
    </div>
  )

  if (!loaded) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Загрузка настроек доступа...</span>
        </div>
      </div>
    )
  }

  // ── OIDC выключен: заглушка-предупреждение ──
  if (!oidcEnabled) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800/40 p-5 max-w-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Управление пользователями недоступно
              </p>
              <p className="text-sm text-amber-700/90 dark:text-amber-300/80">
                Единый вход (OIDC) выключен, а создание и редактирование пользователей внутри
                HRMS удалено. Жизненный цикл аккаунтов ведётся в админке Authentik; включите
                OIDC-интеграцию (AUTH_OIDC_ENABLED), чтобы открыть ссылки на IdP.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── OIDC включён: ссылки на админку Authentik / IdP Ops ──
  return (
    <div className="space-y-6">
      {header}

      <div className="rounded-lg border bg-card p-5 space-y-4 max-w-xl">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Управление — в IdP</p>
            <p className="text-sm text-muted-foreground">
              Каталог пользователей, приглашения и роли — в админке Authentik и IdP Ops.
              Пароль и MFA — в личном кабинете Authentik.
            </p>
          </div>
        </div>

        {idpError ? (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{idpError}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2 flex-wrap">
          {idpConfig?.admin_url ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(idpConfig.admin_url!, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Админка Authentik
            </Button>
          ) : null}
          {idpConfig?.ops_url ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(idpConfig.ops_url!, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Открыть IdP Ops
            </Button>
          ) : null}
          {idpConfig?.user_settings_url ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                window.open(idpConfig.user_settings_url!, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Кабинет пользователя
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
