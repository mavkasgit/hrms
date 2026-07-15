import { useState, useEffect, useCallback } from "react"
import {
  User,
  Shield,
  Laptop,
  Copy,
  Check,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Pencil,
} from "lucide-react"
import api from "@/shared/api/axios"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { TelegramLoginModal } from "@/features/auth/telegram/TelegramLoginModal"
import { fetchTelegramBotConfig, type TelegramBotConfig } from "@/shared/api/telegramAuth"
import { TelegramIcon } from "@/shared/ui/icons"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { getUserSeed } from "@/shared/lib/avatar"
import { AvatarPickerDialog } from "@/features/user-profile/AvatarPickerDialog"
import { formatDateTime } from "@/shared/utils/date"
type UserProfileModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUser: any
  onUpdateProfile: () => void
}

type TabType = "profile" | "security" | "sessions"

export function UserProfileModal({
  open,
  onOpenChange,
  currentUser,
  onUpdateProfile,
}: UserProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("profile")
  const [copied, setCopied] = useState(false)
  const [tgModalOpen, setTgModalOpen] = useState(false)
  const [telegramConfig, setTelegramConfig] = useState<TelegramBotConfig | null>(null)
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [localUser, setLocalUser] = useState<any>(currentUser)

  // Синхронизируем локального пользователя при обновлении пропса
  useEffect(() => {
    if (currentUser) {
      setLocalUser(currentUser)
    }
  }, [currentUser])

  const fetchUserData = useCallback(async () => {
    try {
      const res = await api.get("/auth/me")
      setLocalUser(res.data)
      onUpdateProfile() // уведомляем родительский компонент (Sidebar)
      // Layout слушает это для баннера «пароль + Telegram»
      window.dispatchEvent(new Event("hrms:profile-updated"))
    } catch (err) {
      console.error("Не удалось обновить профиль пользователя:", err)
    }
  }, [onUpdateProfile])

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveTab(sectionId as TabType)
    const element = document.getElementById(`${sectionId}-section`)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [])

  const handleAvatarPick = useCallback(
    async (seed: string | null) => {
      if (avatarSaving) return
      setAvatarSaving(true)
      setAvatarError(null)
      try {
        await api.patch("/users/me/avatar", { avatar_seed: seed })
        // Обновляем профиль в родителе — useEffect синхронизирует localUser.
        onUpdateProfile()
        setAvatarPickerOpen(false)
      } catch (err) {
        console.error("Не удалось обновить аватар:", err)
        setAvatarError("Не удалось сохранить аватар. Попробуйте ещё раз.")
      } finally {
        setAvatarSaving(false)
      }
    },
    [avatarSaving, onUpdateProfile],
  )
  useEffect(() => {
    if (!open) return

    const container = document.getElementById("settings-scroll-container")
    if (!container) return

    const sections = ["profile", "security", "sessions"]
    const observers = sections.map((id) => {
      const el = document.getElementById(`${id}-section`)
      if (!el) return null

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveTab(id as TabType)
          }
        },
        {
          root: container,
          rootMargin: "-20% 0px -60% 0px", // Активная секция в верхней части экрана
        }
      )
      observer.observe(el)
      return { observer, el }
    })

    return () => {
      observers.forEach((o) => {
        if (o) o.observer.unobserve(o.el)
      })
    }
  }, [open])

  // Состояния для формы пароля
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [passwordSuccess, setPasswordSuccess] = useState("")

  // Состояния для отвязки Telegram
  const [isUnlinkingTg, setIsUnlinkingTg] = useState(false)
  const [tgError, setTgError] = useState("")
  const [tgSuccess, setTgSuccess] = useState("")
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false)

  // Данные о сессии (парсинг userAgent)
  const [sessionInfo, setSessionInfo] = useState({
    os: "Неизвестная ОС",
    browser: "Неизвестный браузер",
    ip: "127.0.0.1 (локальный)",
  })

  useEffect(() => {
    if (open) {
      // Парсим User Agent при открытии модалки
      const ua = navigator.userAgent
      let os = "Неизвестная ОС"
      let browser = "Неизвестный браузер"

      if (ua.indexOf("Win") !== -1) os = "Windows"
      else if (ua.indexOf("Mac") !== -1) os = "macOS"
      else if (ua.indexOf("Linux") !== -1) os = "Linux"
      else if (ua.indexOf("Android") !== -1) os = "Android"
      else if (ua.indexOf("like Mac") !== -1) os = "iOS"

      if (ua.indexOf("Firefox") !== -1) browser = "Mozilla Firefox"
      else if (ua.indexOf("SamsungBrowser") !== -1) browser = "Samsung Browser"
      else if (ua.indexOf("Opera") !== -1 || ua.indexOf("OPR") !== -1) browser = "Opera"
      else if (ua.indexOf("Edge") !== -1 || ua.indexOf("Edg") !== -1) browser = "Microsoft Edge"
      else if (ua.indexOf("Chrome") !== -1) browser = "Google Chrome"
      else if (ua.indexOf("Safari") !== -1) browser = "Apple Safari"

      setSessionInfo({
        os,
        browser,
        ip: "127.0.0.1 (локальный)",
      })
      // Сброс сообщений
      setPasswordError("")
      setPasswordSuccess("")
      setTgError("")
      setTgSuccess("")
      setPassword("")
      setConfirmPassword("")

      // Загружаем конфигурацию Telegram
      fetchTelegramBotConfig()
        .then((cfg) => setTelegramConfig(cfg))
        .catch((err) => console.error("Не удалось загрузить конфиг Telegram:", err))

      // Загружаем свежие данные о пользователе
      fetchUserData()
    }
  }, [open, fetchUserData])

  if (!localUser) return null

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(localUser.username)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Сохранение пароля
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError("")
    setPasswordSuccess("")

    if (password.length < 4) {
      setPasswordError("Пароль должен содержать не менее 4 символов")
      return
    }

    if (password !== confirmPassword) {
      setPasswordError("Пароли не совпадают")
      return
    }

    setIsSubmittingPassword(true)
    try {
      await api.post("/users/me/setup-password", { password })
      setPasswordSuccess("Пароль успешно сохранен!")
      setPassword("")
      setConfirmPassword("")
      await fetchUserData() // Обновляем данные пользователя
    } catch (err: any) {
      console.error(err)
      setPasswordError(err.response?.data?.detail || "Не удалось сохранить пароль")
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  // Отвязка Telegram
  const handleUnlinkTelegram = async () => {
    setTgError("")
    setTgSuccess("")
    setIsUnlinkingTg(true)
    try {
      await api.delete("/auth/telegram/link")
      setTgSuccess("Telegram успешно отвязан")
      await fetchUserData()
    } catch (err: any) {
      console.error(err)
      setTgError(err.response?.data?.detail || "Не удалось отвязать Telegram")
    } finally {
      setIsUnlinkingTg(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl h-[560px] p-0 overflow-hidden flex flex-col md:flex-row gap-0 rounded-2xl bg-card border border-border shadow-2xl">
          {/* Левое боковое меню (Навигация) */}
          <div className="w-full md:w-[220px] bg-muted/30 border-r border-border p-4 flex flex-col gap-1 shrink-0">
            <div className="flex flex-col items-center gap-2 px-3 py-4 border-b border-border/60 mb-3">
              <div className="relative group">
                <UserAvatar
                  seed={getUserSeed(localUser)}
                  size={80}
                  className="shadow-md"
                />
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen(true)}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Изменить аватар"
                  aria-label="Изменить аватар"
                >
                  <Pencil className="h-6 w-6 text-white" />
                </button>
              </div>
              <div className="w-full text-center">
                <p className="font-semibold text-sm text-foreground truncate">
                  {localUser.full_name || "Пользователь"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  @{localUser.username}
                </p>
              </div>
              {avatarError && (
                <p className="text-[11px] text-destructive text-center">{avatarError}</p>
              )}
            </div>

            <button
              onClick={() => scrollToSection("profile")}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "profile"
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <User className="h-4 w-4" />
              Личный профиль
            </button>

            <button
              onClick={() => scrollToSection("security")}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "security"
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Shield className="h-4 w-4" />
              Безопасность
            </button>

            <button
              onClick={() => scrollToSection("sessions")}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === "sessions"
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <Laptop className="h-4 w-4" />
              Активные сессии
            </button>

            <div className="mt-auto px-3 py-2 text-[10px] text-muted-foreground/60 border-t border-border/40 pt-3">
              ID в системе: {localUser.username}
            </div>
          </div>

          {/* Правая часть (Содержимое вкладки) */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col bg-card scroll-smooth" id="settings-scroll-container">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-xl font-bold">Настройки профиля и безопасности</DialogTitle>
            </DialogHeader>

            <div className="space-y-10 pb-6">
              {/* РАЗДЕЛ 1: ЛИЧНЫЙ ПРОФИЛЬ */}
              <div id="profile-section" className="space-y-4 scroll-mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 border-b border-border/40 pb-2 mb-4">Личный профиль</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Имя пользователя (Логин)</label>
                    <div className="flex items-center gap-2 bg-muted/40 border border-border/80 rounded-xl px-3.5 py-2">
                      <span className="text-sm font-medium text-foreground flex-1 truncate">
                        {localUser.username}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyUsername}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Копировать логин"
                      >
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Системная роль</label>
                    <div className="bg-muted/40 border border-border/80 rounded-xl px-3.5 py-2 text-sm font-medium text-foreground">
                      {localUser.role === "admin" ? "Администратор" : "Сотрудник (Просмотр)"}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Полное имя</label>
                  <div className="bg-muted/40 border border-border/80 rounded-xl px-3.5 py-2 text-sm font-semibold text-foreground">
                    {localUser.full_name || "Не указано"}
                  </div>
                </div>

                {localUser.invite_code && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-3">
                    <ShieldAlert className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-500">
                        Вы вошли по одноразовому инвайт-коду
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Рекомендуем установить пароль и привязать аккаунт Telegram во вкладке «Безопасность», чтобы защитить свой аккаунт.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* РАЗДЕЛ 2: БЕЗОПАСНОСТЬ */}
              <div id="security-section" className="space-y-6 pt-2 scroll-mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 border-b border-border/40 pb-2 mb-4">Безопасность и доступы</h3>
                
                {/* Секция Telegram */}
                <div className="p-4 rounded-2xl border border-border/80 bg-muted/10 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#229ED9]/10 flex items-center justify-center text-[#229ED9] shrink-0 mt-0.5">
                      <TelegramIcon className="h-5 w-5 fill-current" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">Двухфакторный вход через Telegram</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Безопасный вход по QR-коду без использования пароля
                      </p>

                      {/* Детали привязанного аккаунта */}
                      {localUser.has_telegram && (localUser.telegram_id || localUser.telegram_username) && (
                        <div className="mt-2.5 text-xs text-muted-foreground/80 flex flex-col gap-1 bg-background/40 border border-border/40 p-2 rounded-xl max-w-[260px]">
                          {localUser.telegram_username && (
                            <div className="flex justify-between gap-2">
                              <span>Юзернейм:</span>
                              <span className="font-semibold text-foreground">@{localUser.telegram_username}</span>
                            </div>
                          )}
                          {localUser.telegram_id && (
                            <div className="flex justify-between gap-2">
                              <span>Telegram ID:</span>
                              <span className="font-mono font-medium text-foreground">{localUser.telegram_id}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      {localUser.has_telegram ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Привязан
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 px-2.5 py-1 rounded-full">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Не привязан
                        </span>
                      )}
                    </div>
                  </div>

                  {tgError && <p className="text-xs text-destructive">{tgError}</p>}
                  {tgSuccess && <p className="text-xs text-green-500">{tgSuccess}</p>}

                  <div className="flex justify-end pt-1">
                    {localUser.has_telegram ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isUnlinkingTg}
                        onClick={() => setUnlinkConfirmOpen(true)}
                        className="rounded-xl px-4 text-xs"
                      >
                        {isUnlinkingTg ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-2" />
                            Отвязка...
                          </>
                        ) : (
                          "Отвязать Telegram"
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => setTgModalOpen(true)}
                        className="rounded-xl px-4 text-xs gap-1.5"
                      >
                        <TelegramIcon className="h-3.5 w-3.5 fill-current" />
                        Привязать Telegram
                      </Button>
                    )}
                  </div>
                </div>

                {/* Секция пароля */}
                <form onSubmit={handleSavePassword} className="space-y-4 border-t border-border/40 pt-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Lock className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground">
                          {localUser.has_password ? "Смена пароля" : "Установка пароля доступа"}
                        </h3>
                        {localUser.has_password ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                            <ShieldCheck className="h-3 w-3" />
                            Пароль задан
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            <ShieldAlert className="h-3 w-3" />
                            Пароль не задан
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Локальный пароль для резервного входа в кадровое приложение
                      </p>
                      {localUser.has_password && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {localUser.password_changed_at
                            ? <>Последняя смена: <span className="font-medium text-foreground/80">{formatDateTime(localUser.password_changed_at, false)}</span></>
                            : "Дата последней смены неизвестна (пароль был задан до учёта дат)"}
                        </p>
                      )}
                      {!localUser.has_password && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Пароль ещё не устанавливался — задайте его ниже
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Новый пароль</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Введите новый пароль"
                          className="w-full bg-muted/40 border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl pl-3.5 pr-10 py-2 text-sm text-foreground outline-none transition-all"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Подтверждение нового пароля</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Подтвердите пароль"
                          className="w-full bg-muted/40 border border-border/80 focus:border-primary focus:ring-1 focus:ring-primary rounded-xl pl-3.5 pr-10 py-2 text-sm text-foreground outline-none transition-all"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
                  {passwordSuccess && <p className="text-xs text-green-500">{passwordSuccess}</p>}

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={isSubmittingPassword}
                      className="rounded-xl px-5 text-xs"
                    >
                      {isSubmittingPassword ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-2" />
                          Сохранение...
                        </>
                      ) : (
                        localUser.has_password ? "Сменить пароль" : "Установить пароль"
                      )}
                    </Button>
                  </div>
                </form>
              </div>

              {/* РАЗДЕЛ 3: АКТИВНЫЕ СЕССИИ */}
              <div id="sessions-section" className="space-y-4 pt-2 scroll-mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 border-b border-border/40 pb-2 mb-4">Активные сессии</h3>
                <p className="text-xs text-muted-foreground">
                  Список устройств и браузеров, с которых вы вошли в систему
                </p>

                <div className="p-4 rounded-2xl border border-border bg-muted/5 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500 shrink-0">
                    <Laptop className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground truncate">
                        {sessionInfo.browser} ({sessionInfo.os})
                      </h4>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-green-600 dark:text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Текущий сеанс
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      IP-адрес: <span className="font-mono text-[11px]">{sessionInfo.ip}</span>
                    </p>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground/60 bg-muted/10 p-3.5 rounded-xl border border-border/40">
                  Примечание: Если вы подозреваете несанкционированный доступ, нажмите кнопку «Выйти» в нижнем углу бокового меню, чтобы сбросить все токены сессий и войти заново.
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Модальное окно привязки Telegram */}
      <TelegramLoginModal
        open={tgModalOpen}
        onOpenChange={setTgModalOpen}
        config={telegramConfig}
        purpose="link"
        onSuccess={async () => {
          setTgModalOpen(false)
          setTgSuccess("Telegram успешно привязан!")
          // Как после setup-password: refresh + hrms:profile-updated для баннера Layout
          await fetchUserData()
        }}
      />

      {/* Подтверждение отвязки Telegram */}
      <AlertDialog open={unlinkConfirmOpen} onOpenChange={setUnlinkConfirmOpen}>
        <AlertDialogContent className="rounded-2xl max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Отвязать Telegram?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы больше не сможете использовать двухфакторный вход через этот аккаунт Telegram. Для входа вам потребуется использовать пароль.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setUnlinkConfirmOpen(false)
                handleUnlinkTelegram()
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl"
            >
              Отвязать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
        currentSeed={localUser?.avatar_seed ?? null}
        fallbackSeed={getUserSeed(localUser)}
        onPick={handleAvatarPick}
        isSaving={avatarSaving}
      />
    </>
  )
}
