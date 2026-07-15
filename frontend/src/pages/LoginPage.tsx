import { useState, useEffect } from "react"
import { Loader2, Bug, LogIn, AlertCircle } from "lucide-react"
import api, {
  loginWithPassword,
  isDevMode,
  consumeAuthErrorForLogin,
} from "@/shared/api/axios"
import { TelegramIcon } from "@/shared/ui/icons"
import {
  fetchTelegramBotConfig,
  type TelegramBotConfig,
  type TelegramLoginResponse,
} from "@/shared/api/telegramAuth"
import { TelegramLoginModal } from "@/features/auth/telegram/TelegramLoginModal"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

export function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [telegramConfig, setTelegramConfig] = useState<TelegramBotConfig | null>(null)
  const [tgModalOpen, setTgModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteCodeInput, setInviteCodeInput] = useState("")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)

  // Состояние для установки пароля
  const [setupPasswordModalOpen, setSetupPasswordModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  const devMode = isDevMode()
  const botEnabled =
    Boolean(telegramConfig?.bot_enabled) ||
    Boolean(telegramConfig?.bot_username)

  useEffect(() => {
    // Ошибка после 401-редиректа (сессия / «пользователь удалён» и т.п.)
    const saved = consumeAuthErrorForLogin()
    if (saved) setError(saved)

    let cancelled = false
    async function loadTelegramConfig() {
      try {
        const cfg = await fetchTelegramBotConfig()
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

  async function handleTelegramSuccess(data: TelegramLoginResponse) {
    if (data.require_password_setup) {
      setSetupPasswordModalOpen(true)
    } else {
      window.location.href = "/"
    }
  }

  async function handleSetupPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setSetupError("Пароли не совпадают")
      return
    }
    if (newPassword.length < 4) {
      setSetupError("Пароль должен быть не менее 4 символов")
      return
    }
    setSetupLoading(true)
    setSetupError(null)
    try {
      await api.post("/users/me/setup-password", { password: newPassword })
      window.location.href = "/"
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : "Не удалось сохранить пароль")
    } finally {
      setSetupLoading(false)
    }
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inviteCodeInput.trim().length !== 6) return
    setInviteLoading(true)
    setInviteError(null)
    try {
      const response = await api.post(
        "/auth/invite/login",
        { invite_code: inviteCodeInput.trim() },
        { skipGlobalToast: true }
      )
      localStorage.setItem("token", response.data.access_token)
      // Проверяем, что сессия реально принимается (soft-delete и т.п.),
      // до редиректа — иначе пользователь «вылетает» без текста ошибки.
      try {
        await api.get("/auth/me", { skipGlobalToast: true })
      } catch (meErr: any) {
        localStorage.removeItem("token")
        const detail =
          meErr?.response?.data?.detail ||
          meErr?.message ||
          "Вход по коду получен, но доступ запрещён"
        setInviteError(
          typeof detail === "string" ? detail : "Вход по коду получен, но доступ запрещён"
        )
        return
      }
      window.location.href = "/"
    } catch (err: any) {
      setInviteError(
        err.response?.data?.detail || err.message || "Ошибка входа по коду приглашения"
      )
    } finally {
      setInviteLoading(false)
    }
  }

  // SSO click handler removed as SSO is hidden

  async function loginAsDev(role: "admin" | "viewer") {
    setLoading(true)
    setError(null)
    try {
      // Сначала пытаемся получить собственный JWT через /api/auth/login
      // (в dev-режиме бэкенд принимает пароль "dev" для любого пользователя)
      await loginWithPassword(role, "dev")
    } catch {
      // Fallback на упрощённый bypass-токен, если собственный получить не удалось
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

        {/* SSO кнопка скрыта по требованию */}

        {/* Telegram: две кнопки */}
        {botEnabled && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setInviteCodeInput("")
                setInviteError(null)
                setInviteModalOpen(true)
              }}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-sm"
            >
              <LogIn className="h-4 w-4" />
              Вход по коду приглашения
            </button>
            <button
              type="button"
              onClick={() => {
                setTgModalOpen(true)
              }}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#2AABEE] hover:bg-[#229ED9] disabled:opacity-60 text-white font-medium py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-sm"
            >
              <TelegramIcon className="h-5 w-5" />
              Войти через Telegram
            </button>
          </div>
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

      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Вход по коду приглашения</DialogTitle>
            <DialogDescription>
              Введите 6-значный цифровой инвайт-код для входа в систему.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Инвайт-код</label>
              <input
                type="text"
                value={inviteCodeInput}
                onChange={(e) => {
                  setInviteCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setInviteError(null)
                }}
                placeholder="000000"
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 placeholder:text-slate-400 uppercase font-mono text-center tracking-widest text-lg"
              />
            </div>
            {inviteError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {inviteError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInviteModalOpen(false)}
                disabled={inviteLoading}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={inviteCodeInput.trim().length !== 6 || inviteLoading}
                className="bg-amber-500 hover:bg-amber-600 text-white font-medium flex items-center justify-center gap-1.5"
              >
                {inviteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Войти
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TelegramLoginModal
        open={tgModalOpen}
        onOpenChange={setTgModalOpen}
        config={telegramConfig}
        onSuccess={handleTelegramSuccess}
      />

      <Dialog open={setupPasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Установка пароля</DialogTitle>
            <DialogDescription>
              Для вашего аккаунта необходимо установить пароль. Это позволит вам входить в систему без использования Telegram.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSetupPasswordSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Новый пароль</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setSetupError(null)
                }}
                placeholder="Минимум 4 символа"
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Подтвердите пароль</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setSetupError(null)
                }}
                placeholder="Повторите пароль"
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Пароли не совпадают
              </p>
            )}

            {newPassword && newPassword.length < 4 && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                Пароль должен содержать не менее 4 символов
              </p>
            )}

            {setupError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {setupError}
              </p>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={
                  setupLoading ||
                  newPassword.length < 4 ||
                  newPassword !== confirmPassword
                }
                className="w-full bg-slate-900 hover:bg-slate-700 text-white font-medium flex items-center justify-center gap-1.5"
              >
                {setupLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить пароль
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
