import { useEffect, useRef, useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import {
  completeOidcCallback,
  clearPkce,
  mapIdpRedirectError,
  OidcAuthError,
  tryForceOidcRelogin,
  type OidcErrorInfo,
} from "@/shared/api/oidcAuth"


/**
 * OIDC redirect target: /auth/callback?code=...&state=...
 * Exchanges code + PKCE verifier via backend, stores app JWT, redirects home.
 *
 * Recoverable token failures (invalid_id_token, invalid_grant, 502, …):
 * clear local session and force IdP re-login once (prompt=login) instead of
 * a permanent error card — SPA SDK / MSAL / Auth0 pattern.
 */
export function OidcCallbackPage() {
  const [error, setError] = useState<OidcErrorInfo | null>(null)
  const [reloginPending, setReloginPending] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    async function run() {
      const params = new URLSearchParams(window.location.search)
      const err = params.get("error")
      const errDesc = params.get("error_description")
      if (err) {
        clearPkce()
        const mapped = mapIdpRedirectError(err, errDesc)
        // login_required / interaction → re-auth; access_denied stays on card
        const navigated = await tryForceOidcRelogin({
          code: err,
          httpStatus: undefined,
        })
        if (navigated) {
          setReloginPending(true)
          return
        }
        setError(mapped)
        return
      }

      const code = params.get("code")
      const state = params.get("state")
      if (!code) {
        clearPkce()
        const missing: OidcErrorInfo = {
          title: "Нет кода авторизации",
          message:
            "В адресе возврата нет параметра code. Начните вход с страницы входа HRMS заново " +
            "(не открывайте /auth/callback вручную).",
          code: "missing_code",
        }
        const navigated = await tryForceOidcRelogin(missing)
        if (navigated) {
          setReloginPending(true)
          return
        }
        setError(missing)
        return
      }

      try {
        await completeOidcCallback({ code, state })
        window.location.replace("/")
      } catch (e: unknown) {
        clearPkce()
        let info: OidcErrorInfo
        if (e instanceof OidcAuthError) {
          info = {
            title: e.title,
            message: e.message,
            code: e.code,
            httpStatus: e.httpStatus,
          }
        } else if (e instanceof Error) {
          info = {
            title: "Не удалось войти",
            message: e.message,
          }
        } else {
          info = {
            title: "Не удалось войти",
            message: "Неизвестная ошибка при завершении единого входа.",
          }
        }

        const navigated = await tryForceOidcRelogin(info)
        if (navigated) {
          setReloginPending(true)
          return
        }
        setError(info)
      }
    }

    void run()
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <div className="min-w-0 space-y-2">
              <h1 className="text-lg font-semibold text-slate-900">{error.title}</h1>
              <p className="text-sm leading-relaxed text-slate-600">{error.message}</p>
              <p className="text-sm leading-relaxed text-slate-500">
                Повторный вход не помог перезаписать токен. Войдите снова вручную или используйте
                пароль.
              </p>
              {(error.code || error.httpStatus) && (
                <p className="break-all font-mono text-xs text-slate-400">
                  {error.code ? `Код: ${error.code}` : null}
                  {error.code && error.httpStatus ? " · " : null}
                  {error.httpStatus ? `HTTP ${error.httpStatus}` : null}
                </p>
              )}
            </div>
          </div>
          
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white text-slate-600">
      <img
        src="/logo.svg"
        alt="HRMS"
        className="h-14 w-14 rounded-2xl shadow-sm"
        width={56}
        height={56}
      />
      <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      <p className="text-sm">
        {reloginPending
          ? "Требуется повторный вход — перенаправляем для обновления токена…"
          : "Завершаем вход через единый вход…"}
      </p>
    </div>
  )
}
