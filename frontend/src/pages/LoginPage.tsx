import { useState, useEffect, useRef } from "react"
import { Loader2, LogIn, Shield } from "lucide-react"
import { consumeAuthErrorForLogin } from "@/shared/api/axios"
import { TelegramIcon } from "@/shared/ui/icons"
import {
  fetchOidcConfig,
  startOidcLogin,
  resolveAuthorizationUrl,
  type OidcConfig,
} from "@/shared/api/oidcAuth"

export function LoginPage() {
  const [breakGlassPassword, setBreakGlassPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oidcConfig, setOidcConfig] = useState<OidcConfig | null>(null)
  const [oidcLoaded, setOidcLoaded] = useState(false)
  const [oidcUnreachable, setOidcUnreachable] = useState(false)
  const [oidcStarting, setOidcStarting] = useState(false)
  const oidcAutoStartedRef = useRef(false)

  const oidcEnabled = Boolean(
    oidcConfig?.enabled &&
      oidcConfig.authorization_url &&
      oidcConfig.client_id
  )
  const telegramPrimary = Boolean(oidcEnabled && oidcConfig?.telegram_primary)

  useEffect(() => {
    const saved = consumeAuthErrorForLogin()
    if (saved) setError(saved)

    let cancelled = false
    async function loadConfigs() {
      try {
        const oidc = await fetchOidcConfig()
        if (!cancelled) setOidcConfig(oidc)

        if (oidc.enabled && oidc.authorization_url) {
          try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 1200)
            const targetUrl = resolveAuthorizationUrl(oidc.authorization_url)
            await fetch(targetUrl, {
              mode: "no-cors",
              signal: controller.signal,
            })
            clearTimeout(timer)
          } catch {
            if (!cancelled) setOidcUnreachable(true)
          }
        }
      } catch {
        if (!cancelled) setOidcConfig(null)
      } finally {
        if (!cancelled) setOidcLoaded(true)
      }
    }
    loadConfigs()
    return () => {
      cancelled = true
    }
  }, [])

  const isLogoutAction = typeof window !== "undefined" && window.location.search.includes("logout")

  async function handleOidcLogin(forceReauth = false) {
    if (!oidcConfig || !oidcEnabled) return
    setError(null)
    setOidcStarting(true)
    try {
      await startOidcLogin(oidcConfig, { forceReauth: forceReauth || isLogoutAction })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа через единый вход")
      setOidcStarting(false)
    }
  }

  // Auto-redirect to Authentik when reachable (unless user just logged out)
  useEffect(() => {
    if (!oidcLoaded || !oidcEnabled || oidcUnreachable || oidcAutoStartedRef.current || isLogoutAction) return
    oidcAutoStartedRef.current = true
    void handleOidcLogin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oidcLoaded, oidcEnabled, oidcUnreachable, isLogoutAction])

  async function handleBreakGlassSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const baseURL = import.meta.env.VITE_API_URL || "/api"
      const resp = await fetch(`${baseURL}/auth/break-glass/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: breakGlassPassword }),
      })
      if (resp.ok) {
        const bgData = await resp.json()
        localStorage.setItem("token", bgData.access_token)
        window.location.href = "/"
        return
      }
      const errData = await resp.json().catch(() => ({}))
      throw new Error(errData.detail || "Неверный пароль аварийного доступа")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка аварийного входа")
    } finally {
      setLoading(false)
    }
  }

  if (!oidcLoaded || (oidcEnabled && !oidcUnreachable && oidcStarting)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-full max-w-md space-y-6 p-8 bg-white border border-slate-200 rounded-2xl shadow-lg">
          <div className="text-center space-y-3">
            <img
              src="/logo.svg"
              alt="HRMS"
              className="mx-auto h-16 w-16 rounded-2xl shadow-sm"
              width={64}
              height={64}
            />
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-slate-900">HRMS</h1>
              <p className="text-slate-500 text-sm">Система управления персоналом</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            <p className="text-sm text-slate-600">Переход к единому входу…</p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-md space-y-6 p-8 bg-white border border-slate-200 rounded-2xl shadow-lg">
        <div className="text-center space-y-3">
          <img
            src="/logo.svg"
            alt="HRMS"
            className="mx-auto h-16 w-16 rounded-2xl shadow-sm"
            width={64}
            height={64}
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">HRMS</h1>
            <p className="text-slate-500 text-sm">Система управления персоналом</p>
          </div>
        </div>

        {/* Primary Authentik SSO Login */}
        {oidcEnabled && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void handleOidcLogin()}
              disabled={loading || oidcStarting}
              className={
                telegramPrimary
                  ? "w-full flex items-center justify-center gap-2 bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-sm"
                  : "w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-sm"
              }
            >
              {oidcStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : telegramPrimary ? (
                <TelegramIcon className="h-5 w-5" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              {telegramPrimary ? "Войти через Telegram" : "Войти через единый вход"}
            </button>
            {telegramPrimary && (
              <p className="text-center text-xs text-slate-500">
                Единый вход для HRMS и KTM-2000 (Authentik)
              </p>
            )}
          </div>
        )}

        {oidcUnreachable && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 space-y-1">
            <div className="font-medium flex items-center gap-1.5 text-amber-900">
              <Shield className="h-4 w-4 text-amber-600 shrink-0" />
              <span>Единый вход (Authentik) недоступен</span>
            </div>
            <p className="text-amber-700">
              Включен аварийный вход (Break Glass). Введите пароль аварийного доступа.
            </p>
          </div>
        )}

        {/* Break Glass emergency access form */}
        <form onSubmit={handleBreakGlassSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
              Аварийный доступ (Break Glass)
            </label>
            <input
              type="password"
              value={breakGlassPassword}
              onChange={(e) => setBreakGlassPassword(e.target.value)}
              placeholder="Пароль аварийного доступа"
              autoComplete="current-password"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !breakGlassPassword}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Аварийный вход
          </button>
        </form>
      </div>
    </div>
  )
}
