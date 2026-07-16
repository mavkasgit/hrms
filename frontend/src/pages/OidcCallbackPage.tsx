import { useEffect, useRef, useState } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { completeOidcCallback, clearPkce } from "@/shared/api/oidcAuth"
import { Button } from "@/shared/ui/button"

/**
 * OIDC redirect target: /auth/callback?code=...&state=...
 * Exchanges code + PKCE verifier via backend, stores app JWT, redirects home.
 */
export function OidcCallbackPage() {
  const [error, setError] = useState<string | null>(null)
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
        setError(
          errDesc ||
            (err === "access_denied"
              ? "Вход отменён."
              : `Ошибка IdP: ${err}`)
        )
        return
      }

      const code = params.get("code")
      const state = params.get("state")
      if (!code) {
        clearPkce()
        setError("Отсутствует код авторизации. Начните вход заново.")
        return
      }

      try {
        await completeOidcCallback({ code, state })
        window.location.replace("/")
      } catch (e: unknown) {
        clearPkce()
        setError(e instanceof Error ? e.message : "Ошибка входа через единый вход")
      }
    }

    void run()
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-slate-900">Не удалось войти</h1>
              <p className="text-sm text-slate-600">{error}</p>
            </div>
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              window.location.href = "/login"
            }}
          >
            Вернуться к входу
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white text-slate-600">
      <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      <p className="text-sm">Завершаем вход через единый вход…</p>
    </div>
  )
}
