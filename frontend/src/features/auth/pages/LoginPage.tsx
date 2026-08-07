/**
 * Единая страница входа auth-shell (OIDC + break-glass).
 *
 * ОБЩИЙ МОДУЛЬ: не содержит бренд-значений. Имя приложения, подзаголовок,
 * пути и словарь RU-текстов ошибок заданы в хостовом файле
 * `@/shared/api/authHostConfig`. Файл байт-идентичен в HRMS и KTM
 * (сверяется scripts/verify-sync.mjs, режим content + version).
 */
import { useState, useEffect, useRef, type FormEvent } from "react"
import { Navigate } from "react-router-dom"
import { Loader2, LogIn, Shield } from "lucide-react"
import { useAuth } from "../hooks/useAuth"
import {
  API_BASE_URL,
  AUTH_ERROR_CODES,
  consumeAuthErrorForLogin,
  resolveAuthShellError,
} from "@/shared/api/client"
import { authHostConfig } from "@/shared/api/authHostConfig"
import {
  fetchOidcConfig,
  startOidcLogin,
  type OidcConfig,
} from "../api/oidcAuth"

/** Версия auth-shell-модуля — синхронизируется verify-sync (режим content + version). */
export const AUTH_SHELL_VERSION = "1.0.0"

export function LoginPage() {
  const { loginWithToken, isAuthenticated, isLoading: authLoading } = useAuth()

  const [breakGlassPassword, setBreakGlassPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(() => consumeAuthErrorForLogin())

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

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const oidc = await fetchOidcConfig()
        if (cancelled) return
        setOidcConfig(oidc)

        if (oidc.enabled && oidc.authorization_url) {
          try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 1200)
            await fetch(oidc.authorization_url, {
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
    void load()
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа через единый вход")
      setOidcStarting(false)
    }
  }

  useEffect(() => {
    if (!oidcLoaded || !oidcEnabled || oidcUnreachable || oidcAutoStartedRef.current) return
    if (authLoading || isAuthenticated) return
    oidcAutoStartedRef.current = true
    void handleOidcLogin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oidcLoaded, oidcEnabled, oidcUnreachable, authLoading, isAuthenticated])

  async function handleBreakGlassSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE_URL}/auth/break-glass/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: breakGlassPassword }),
      })
      if (resp.ok) {
        const data = await resp.json()
        await loginWithToken(data.access_token)
        return
      }
      const errData = await resp.json().catch(() => ({}))
      const display = resolveAuthShellError(
        { response: { status: resp.status, data: errData } },
        AUTH_ERROR_CODES.BREAK_GLASS_FAILED,
      )
      throw new Error(display.message)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка аварийного входа")
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={authHostConfig.rootPath} replace />
  }

  if (!oidcLoaded || (oidcEnabled && !oidcUnreachable)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4">
        <img
          src="/logo.svg"
          alt={authHostConfig.appName}
          className="h-14 w-14 rounded-2xl shadow-lg shadow-slate-900/15"
          width={56}
          height={56}
        />
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <p className="text-sm">
            {!oidcLoaded || !oidcStarting
              ? "Проверка настроек входа…"
              : "Переход к единому входу…"}
          </p>
        </div>
        {error && (
          <div className="w-full max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}
        {oidcEnabled && !oidcUnreachable && (
          <button
            type="button"
            onClick={() => void handleOidcLogin()}
            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            Повторить попытку
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50">
      <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-500/5 blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-100 sm:p-10">
          <div className="mb-8 flex flex-col items-center gap-3">
            <img
              src="/logo.svg"
              alt={authHostConfig.appName}
              className="h-14 w-14 rounded-2xl shadow-lg shadow-slate-900/15"
              width={56}
              height={56}
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{authHostConfig.appName}</h1>
              <p className="mt-1 text-sm text-slate-500">{authHostConfig.appTagline}</p>
            </div>
          </div>

          {oidcUnreachable && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
              <div className="flex items-center gap-1.5 font-medium text-amber-900">
                <Shield className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Единый вход (Authentik) недоступен</span>
              </div>
              <p className="mt-1 text-amber-700">
                Включен аварийный вход (Break Glass). Введите пароль аварийного доступа.
              </p>
            </div>
          )}

          {!oidcEnabled && (
            <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
              Единый вход (SSO) отключён. Используйте аварийный доступ.
            </div>
          )}

          <form onSubmit={handleBreakGlassSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                Аварийный доступ (Break Glass)
              </label>
              <input
                type="password"
                value={breakGlassPassword}
                onChange={(e) => setBreakGlassPassword(e.target.value)}
                placeholder="Пароль аварийного доступа"
                autoComplete="current-password"
                className="block w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all duration-200 hover:border-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 placeholder:text-slate-400"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !breakGlassPassword}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Аварийный вход
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {authHostConfig.appName} · {authHostConfig.appTagline}
        </p>
      </div>
    </div>
  )
}
