import { useState, useEffect } from "react"
import { Loader2, Bug, LogIn, AlertCircle } from "lucide-react"
import { loginWithPassword, redirectToKtmLogin, isDevMode, pingKtm } from "@/shared/api/axios"
import {
  fetchTelegramOidcConfig,
  startTelegramLogin,
  type TelegramOidcConfig,
} from "@/shared/api/telegramAuth"

export function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isKtmDown, setIsKtmDown] = useState(false)
  const [telegramConfig, setTelegramConfig] = useState<TelegramOidcConfig | null>(null)

  const devMode = isDevMode()

  useEffect(() => {
    async function checkKtm() {
      const isUp = await pingKtm()
      setIsKtmDown(!isUp)
    }
    checkKtm()
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadTelegramConfig() {
      try {
        const cfg = await fetchTelegramOidcConfig()
        if (!cancelled) setTelegramConfig(cfg)
      } catch {
        if (!cancelled) setTelegramConfig(null)
      }
    }
    loadTelegramConfig()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleTelegramLogin() {
    if (!telegramConfig?.enabled) return
    setError(null)
    setLoading(true)
    try {
      await startTelegramLogin(telegramConfig)
      window.location.href = "/"
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа через Telegram")
    } finally {
      setLoading(false)
    }
  }

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
      // Сначала пытаемся получить собственный JWT через /api/auth/login
      // (в dev-режиме бэкенд принимает пароль "dev" для любого пользователя)
      await loginWithPassword(role, "dev")
    } catch {
      // Если собственный токен получить не удалось — fallback на упрощённый bypass-токен
      // KTM-2000 в этом случае вообще не используется (он читается в getToken только если "token" пуст)
      localStorage.setItem("token", role)
    } finally {
      setLoading(false)
      window.location.href = "/"
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-md space-y-6 p-8 bg-white border border-slate-200 rounded-2xl shadow-lg">

        {/* Заголовок */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">HRMS</h1>
          <p className="text-slate-500 text-sm">Система управления персоналом</p>
        </div>

        {/* Форма логин/пароль */}
        {isKtmDown && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3.5">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Сервер авторизации KTM-2000 недоступен</p>
              <p className="text-red-600">Вы переведены в локальный режим авторизации. Пожалуйста, войдите под своим логином и паролем.</p>
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
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Войти
          </button>
        </form>

        {/* Разделитель */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-400">или</span>
          </div>
        </div>

        {/* SSO кнопка */}
        <button
          onClick={redirectToKtmLogin}
          disabled={isKtmDown}
          className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400 text-slate-700 font-medium py-2.5 px-4 rounded-xl border border-slate-200 transition-colors cursor-pointer disabled:cursor-not-allowed text-sm"
        >
          Войти через SSO (KTM-2000) {isKtmDown && "(недоступен)"}
        </button>

        {/* Telegram OIDC — только если backend вернул enabled (client_id задан) */}
        {telegramConfig?.enabled && (
          <button
            type="button"
            onClick={handleTelegramLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Войти через Telegram
          </button>
        )}

        {/* Dev-блок — только в dev/test режиме */}
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
