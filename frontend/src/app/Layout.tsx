import { useState, useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"
import { ToastProvider } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"
import api, {
  getUserAccessLevel,
  AUTH_ERROR_STORAGE_KEY,
} from "@/shared/api/axios"
import { AlertTriangle, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { TelegramLoginModal } from "@/features/auth/telegram/TelegramLoginModal"
import { fetchTelegramBotConfig } from "@/shared/api/telegramAuth"

interface UserProfile {
  username: string
  role: string
  full_name: string
  has_telegram: boolean
  has_password: boolean
  password_changed_at?: string | null
  /** true, пока не заданы и пароль, и Telegram */
  needs_security_setup?: boolean
  invite_code: string | null
}

export function Layout() {
  const accessLevel = getUserAccessLevel()
  
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [telegramConfig, setTelegramConfig] = useState<any>(null)
  const [setupPasswordOpen, setSetupPasswordOpen] = useState(false)
  const [linkTelegramOpen, setLinkTelegramOpen] = useState(false)

  // Стейты для формы установки пароля
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)

  const fetchProfile = async () => {
    try {
      const response = await api.get("/auth/me")
      setProfile(response.data)
    } catch (err) {
      console.error("Failed to fetch user profile", err)
    }
  }

  useEffect(() => {
    if (accessLevel !== "no_access") {
      fetchProfile()

      // Загрузка конфига Telegram
      fetchTelegramBotConfig()
        .then(cfg => setTelegramConfig(cfg))
        .catch(err => console.error("Failed to fetch telegram config", err))
    }
  }, [accessLevel])

  // Синхронизация баннера после смены пароля / TG в профиле (Sidebar → UserProfileModal)
  useEffect(() => {
    const onProfileUpdated = () => {
      if (accessLevel !== "no_access") {
        void fetchProfile()
      }
    }
    window.addEventListener("hrms:profile-updated", onProfileUpdated)
    return () => window.removeEventListener("hrms:profile-updated", onProfileUpdated)
  }, [accessLevel])

  if (accessLevel === "no_access") {
    // Сохраняем причину, если токен был, но доступ «no_access» (битый JWT / нет claim).
    try {
      const hadToken = Boolean(localStorage.getItem("token") || localStorage.getItem("ktm2000_token"))
      if (hadToken) {
        sessionStorage.setItem(
          AUTH_ERROR_STORAGE_KEY,
          "Нет доступа к системе. Войдите снова или обратитесь к администратору."
        )
      }
    } catch {
      /* ignore */
    }
    localStorage.removeItem("token")
    localStorage.removeItem("ktm2000_token")
    document.cookie = "ktm2000_token=; path=/; max-age=0"
    return <Navigate to="/login" replace />
  }

  // Баннер, пока не выполнены ОБА пункта: пароль и Telegram.
  // Не завязан на invite_code (он мог уже сброситься) — только на фактический статус.
  const showSecurityBanner = Boolean(
    profile &&
      (profile.needs_security_setup ??
        (!profile.has_telegram || !profile.has_password))
  )

  const handlePasswordBannerClick = () => {
    setNewPassword("")
    setConfirmPassword("")
    setSetupError(null)
    setSetupPasswordOpen(true)
  }

  const handleTelegramBannerClick = () => {
    setLinkTelegramOpen(true)
  }

  const handleSetupPasswordSubmit = async (e: React.FormEvent) => {
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
      setSetupPasswordOpen(false)
      await fetchProfile()
      window.dispatchEvent(new Event("hrms:profile-updated"))
    } catch (err: any) {
      setSetupError(err.response?.data?.detail || err.message || "Не удалось сохранить пароль")
    } finally {
      setSetupLoading(false)
    }
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          {showSecurityBanner && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="text-sm text-amber-800 font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    {profile.invite_code
                      ? "Вы вошли по временному коду приглашения."
                      : "Завершите настройку аккаунта."}
                  </span>
                  {profile.has_password ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Пароль установлен
                    </span>
                  ) : (
                    <span className="font-semibold">Настройте пароль</span>
                  )}
                  <span className="text-amber-700/70">и</span>
                  {profile.has_telegram ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Telegram привязан
                    </span>
                  ) : (
                    <span className="font-semibold">привяжите Telegram</span>
                  )}
                  <span>для надёжного входа.</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {!profile.has_password && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                    onClick={handlePasswordBannerClick}
                  >
                    Установить пароль
                  </Button>
                )}
                {!profile.has_telegram && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-800 hover:bg-amber-100/50 text-xs font-semibold"
                    onClick={handleTelegramBannerClick}
                  >
                    Привязать Telegram
                  </Button>
                )}
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <Toaster />

      <Dialog open={setupPasswordOpen} onOpenChange={setSetupPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Установка пароля</DialogTitle>
            <DialogDescription>
              Установите пароль для вашего аккаунта, чтобы входить без использования временного кода.
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

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSetupPasswordOpen(false)}
                disabled={setupLoading}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={
                  setupLoading ||
                  newPassword.length < 4 ||
                  newPassword !== confirmPassword
                }
                className="bg-slate-900 hover:bg-slate-700 text-white font-medium flex items-center justify-center gap-1.5"
              >
                {setupLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить пароль
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TelegramLoginModal
        open={linkTelegramOpen}
        onOpenChange={setLinkTelegramOpen}
        config={telegramConfig}
        purpose="link"
        onSuccess={async () => {
          await fetchProfile()
          window.dispatchEvent(new Event("hrms:profile-updated"))
        }}
      />
    </ToastProvider>
  )
}
