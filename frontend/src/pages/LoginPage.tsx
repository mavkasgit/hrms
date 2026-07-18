import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { Loader2, Bug, LogIn, Shield } from "lucide-react"
import {
  loginWithPassword,
  isDevMode,
  consumeAuthErrorForLogin,
} from "@/shared/api/axios"
import { TelegramIcon } from "@/shared/ui/icons"
import {
  fetchOidcConfig,
  startOidcLogin,
  type OidcConfig,
} from "@/shared/api/oidcAuth"

// VITE_SSO_STUB=false — always show full login form even when OIDC enabled
// Default (absent): stub → auto startOidcLogin when OIDC on; escape via /login?password=1

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oidcConfig, setOidcConfig] = useState<OidcConfig | null>(null)
  const [oidcLoaded, setOidcLoaded] = useState(false)
  const [oidcStarting, setOidcStarting] = useState(false)
  const oidcAutoStartedRef = useRef(false)

  const devMode = isDevMode()
  /** Full form: CI/dev escape hatch (?password=1 or VITE_SSO_STUB=false) */
  const forceFullForm =
    searchParams.get("password") === "1" ||
    import.meta.env.VITE_SSO_STUB === "false"
  const oidcEnabled = Boolean(
    oidcConfig?.enabled &&
      oidcConfig.authorization_url &&
      oidcConfig.client_id
  )
  /** Stub when OIDC on and no password escape (default product UX) */
  const ssoStubActive = oidcLoaded && oidcEnabled && !forceFullForm
  /** Authentik Telegram Source — primary SSO CTA label only (no in-app bot) */
  const telegramPrimary = Boolean(oidcEnabled && oidcConfig?.telegram_primary)

  useEffect(() => {
    const saved = consumeAuthErrorForLogin()
    if (saved) setError(saved)

    let cancelled = false
    async function loadConfigs() {
      try {
        const oidc = await fetchOidcConfig()
        if (!cancelled) setOidcConfig(oidc)
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

  async function handleOidcLogin() {
    if (!oidcConfig || !oidcEnabled) return
    setError(null)
    setOidcStarting(true)
    try {
      await startOidcLogin(oidcConfig)
      // redirect — no further UI
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа через единый вход")
      setOidcStarting(false)
    }
  }

  // Stub mode: auto-redirect to Authentik once (ref guard)
  useEffect(() => {
    if (!ssoStubActive || !oidcConfig || oidcAutoStartedRef.current) return
    oidcAutoStartedRef.current = true
    void handleOidcLogin()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on stub activation
  }, [ssoStubActive, oidcConfig])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await loginWithPassword(username, password)
      window.location.href = "/"
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа")
    } finally {
      setLoading(false)
    }
  }

  async function loginAsDev(role: "admin" | "viewer") {
    setLoading(true)
    setError(null)
    try {
      await loginWithPassword(role, "dev")
    } catch {
      localStorage.setItem("token", role)
    } finally {
      setLoading(false)
      window.location.href = "/"
    }
  }

  const showOidcPending = !forceFullForm && !oidcLoaded
  const showSsoStub = ssoStubActive || showOidcPending

  if (showSsoStub) {
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

          <p className="text-center text-sm">
            <a
              href="/login?password=1"
              className="text-slate-600 underline hover:text-slate-900"
            >
              Войти по паролю
            </a>
          </p>
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

        {/* Authentik SSO — Telegram Source is IdP-side only */}
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
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-slate-400">или</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Логин</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Введите логин"
              required
              autoComplete="username"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
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
            disabled={loading || oidcStarting}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Войти
          </button>
        </form>

        {devMode && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Dev / Test режим
              </span>
            </div>
            <p className="text-xs text-amber-600">
              Быстрый вход без KTM-2000. Только в dev/test окружении.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => loginAsDev("admin")}
                disabled={loading}
                title="Полный доступ: создание, редактирование, удаление"
                className="flex-1 py-2 px-3 text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-lg transition-colors cursor-pointer"
              >
                Войти как Admin
              </button>
              <button
                onClick={() => loginAsDev("viewer")}
                disabled={loading}
                title="Только просмотр — создание должностей будет недоступно"
                className="flex-1 py-2 px-3 text-sm font-medium bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                Войти как Viewer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
