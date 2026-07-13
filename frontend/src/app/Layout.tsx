import { useState, useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { Sidebar } from "@/shared/ui/sidebar"
import { ToastProvider } from "@/shared/ui/use-toast"
import { Toaster } from "@/shared/ui/toaster"
import api, { getUserAccessLevel } from "@/shared/api/axios"
import { AlertTriangle, AlertCircle, Loader2 } from "lucide-react"
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
import { fetchTelegramOidcConfig } from "@/shared/api/telegramAuth"

interface UserProfile {
  username: string
  role: string
  full_name: string
  has_telegram: boolean
  has_password: boolean
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
      fetchTelegramOidcConfig()
        .then(cfg => setTelegramConfig(cfg))
        .catch(err => console.error("Failed to fetch telegram config", err))
    }
  }, [accessLevel])

  if (accessLevel === "no_access") {
    localStorage.removeItem("token")
    localStorage.removeItem("ktm2000_token")
    document.cookie = "ktm2000_token=; path=/; max-age=0"
    return <Navigate to="/login" replace />
  }

  const showSecurityBanner =
    profile &&
    profile.invite_code &&
    (!profile.has_telegram || !profile.has_password)

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
                <p className="text-sm text-amber-800 font-medium">
                  Вы вошли по временному коду приглашения. Настройте пароль или привяжите Telegram для надежного входа.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {!profile.has_password && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                    onClick={() => {
                      setNewPassword("")
                      setConfirmPassword("")
                      setSetupError(null)
                      setSetupPasswordOpen(true)
                    }}
                  >
                    Установить пароль
                  </Button>
                )}
                {!profile.has_telegram && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-800 hover:bg-amber-100/50 text-xs font-semibold"
                    onClick={() => setLinkTelegramOpen(true)}
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
        }}
      />
    </ToastProvider>
  )
}
