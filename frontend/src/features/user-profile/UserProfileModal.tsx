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
  CheckCircle2,
  XCircle,
  History,
  ExternalLink,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ru } from "date-fns/locale"
import api, { logout } from "@/shared/api/axios"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { getUserSeed } from "@/shared/lib/avatar"
import { AvatarPickerDialog } from "@/features/user-profile/AvatarPickerDialog"
import { formatDateTime } from "@/shared/utils/date"
import {
  fetchSessions,
  fetchLoginEvents,
  revokeSession,
  revokeOtherSessions,
  formatLoginMethod,
  type SessionDto,
  type LoginEventDto,
} from "@/features/user-profile/api/sessionsApi"
import { fetchIdpLinks } from "@/shared/api/idpAdmin"
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

  // Активные сессии + история входов (API)
  const [sessions, setSessions] = useState<SessionDto[]>([])
  const [loginEvents, setLoginEvents] = useState<LoginEventDto[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokingOthers, setRevokingOthers] = useState(false)

  // IdP deep-link (SSO-D)
  const [userSettingsUrl, setUserSettingsUrl] = useState<string | null>(null)
  const [oidcEnabled, setOidcEnabled] = useState(false)

  const loadSessionsAndEvents = useCallback(async () => {
    setSessionsLoading(true)
    setSessionsError(null)
    setEventsError(null)
    try {
      const [sessionsData, eventsData] = await Promise.all([
        fetchSessions().catch((err: unknown) => {
          console.error("Не удалось загрузить сессии:", err)
          setSessionsError("Не удалось загрузить активные сессии")
          return [] as SessionDto[]
        }),
        fetchLoginEvents(50).catch((err: unknown) => {
          console.error("Не удалось загрузить историю входов:", err)
          setEventsError("Не удалось загрузить историю входов")
          return [] as LoginEventDto[]
        }),
      ])
      setSessions(sessionsData)
      setLoginEvents(eventsData)
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const handleRevokeSession = useCallback(
    async (session: SessionDto) => {
      if (revokingId) return
      setRevokingId(session.id)
      setSessionsError(null)
      try {
        await revokeSession(session.id)
        if (session.is_current) {
          await logout()
          return
        }
        await loadSessionsAndEvents()
      } catch (err) {
        console.error("Не удалось завершить сеанс:", err)
        setSessionsError("Не удалось завершить сеанс")
      } finally {
        setRevokingId(null)
      }
    },
    [revokingId, loadSessionsAndEvents],
  )

  const handleRevokeOthers = useCallback(async () => {
    if (revokingOthers) return
    setRevokingOthers(true)
    setSessionsError(null)
    try {
      await revokeOtherSessions()
      await loadSessionsAndEvents()
    } catch (err) {
      console.error("Не удалось завершить другие сессии:", err)
      setSessionsError("Не удалось завершить другие сессии")
    } finally {
      setRevokingOthers(false)
    }
  }, [revokingOthers, loadSessionsAndEvents])

  useEffect(() => {
    if (open) {
      setPasswordError("")
      setPasswordSuccess("")
      setPassword("")
      setConfirmPassword("")
      setSessionsError(null)
      setEventsError(null)

      // Deep-link «Настройки входа» (IdP user UI)
      fetchIdpLinks()
        .then((links) => {
          setOidcEnabled(Boolean(links.oidc_enabled))
          setUserSettingsUrl(links.user_settings_url || null)
        })
        .catch(() => {
          setOidcEnabled(false)
          setUserSettingsUrl(null)
        })

      fetchUserData()
      void loadSessionsAndEvents()
    }
  }, [open, fetchUserData, loadSessionsAndEvents])

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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl h-[560px] p-0 overflow-hidden flex flex-col md:flex-row gap-0 rounded-2xl bg-card border border-border shadow-2xl">
          {/* Левое боковое меню (Навигация) */}
          <div className="w-full md:w-[220px] bg-muted/30 border-r border-border p-4 flex flex-col gap-1 shrink-0">
            <div className="flex flex-col items-center gap-2 px-3 py-4 border-b border-border/60 mb-3">
              {/*
                Hover-круг чуть больше аватара: padding даёт равный выступ
                со всех сторон (p-2 = 8px), кнопка absolute inset-0 на обёртке.
              */}
              <div className="relative group inline-flex items-center justify-center p-2">
                <UserAvatar
                  seed={getUserSeed(localUser)}
                  size={80}
                  className="shadow-md relative z-0"
                />
                <button
                  type="button"
                  onClick={() => setAvatarPickerOpen(true)}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Изменить аватар"
                  aria-label="Изменить аватар"
                >
                  <Pencil className="h-6 w-6 text-white drop-shadow-sm" />
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
                    {oidcEnabled && (
                      <p className="text-[11px] text-muted-foreground">
                        Роль из единого входа
                      </p>
                    )}
                  </div>
                </div>

                {userSettingsUrl && (
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-xs gap-1.5"
                      onClick={() => window.open(userSettingsUrl, "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Настройки входа
                    </Button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Полное имя</label>
                  <div className="bg-muted/40 border border-border/80 rounded-xl px-3.5 py-2 text-sm font-semibold text-foreground">
                    {localUser.full_name || "Не указано"}
                  </div>
                </div>

              </div>

              {/* РАЗДЕЛ 2: БЕЗОПАСНОСТЬ */}
              <div id="security-section" className="space-y-6 pt-2 scroll-mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 border-b border-border/40 pb-2 mb-4">Безопасность и доступы</h3>

                {oidcEnabled && (
                  <div className="p-4 rounded-2xl border border-border/80 bg-muted/10 space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Единый вход (Authentik)</h3>
                    <p className="text-xs text-muted-foreground">
                      Telegram, MFA и способы входа настраиваются только в IdP, не в HRMS.
                    </p>
                    {userSettingsUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl px-4 text-xs gap-1.5"
                        onClick={() =>
                          window.open(userSettingsUrl, "_blank", "noopener,noreferrer")
                        }
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Настройки входа в IdP
                      </Button>
                    )}
                  </div>
                )}

                {/* Секция пароля (локальный escape hatch) */}
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

              {/* РАЗДЕЛ 3: АКТИВНЫЕ СЕССИИ + ВХОДЫ */}
              <div id="sessions-section" className="space-y-6 pt-2 scroll-mt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                      Активные сессии
                    </h3>
                    {sessions.some((s) => !s.is_current) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={revokingOthers || sessionsLoading}
                        onClick={() => void handleRevokeOthers()}
                        className="rounded-xl text-xs h-7 px-2.5"
                      >
                        {revokingOthers ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                            Завершение...
                          </>
                        ) : (
                          "Завершить другие сессии"
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Список устройств и браузеров, с которых вы вошли в систему
                  </p>

                  {sessionsLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Загрузка сессий...
                    </div>
                  )}

                  {sessionsError && (
                    <p className="text-xs text-destructive">{sessionsError}</p>
                  )}

                  {!sessionsLoading && sessions.length === 0 && !sessionsError && (
                    <p className="text-xs text-muted-foreground py-2">
                      Нет активных сессий
                    </p>
                  )}

                  <div className="space-y-2">
                    {sessions.map((session) => {
                      const deviceLabel =
                        session.device_label?.trim() || "Неизвестное устройство"
                      const ipLabel = session.ip_address?.trim() || "IP неизвестен"
                      const lastSeenLabel = (() => {
                        try {
                          return formatDistanceToNow(new Date(session.last_seen_at), {
                            addSuffix: true,
                            locale: ru,
                          })
                        } catch {
                          return formatDateTime(session.last_seen_at, false)
                        }
                      })()
                      return (
                        <div
                          key={session.id}
                          className="p-4 rounded-2xl border border-border bg-muted/5 flex items-start gap-4"
                        >
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              session.is_current
                                ? "bg-green-500/10 text-green-500"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Laptop className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-semibold text-foreground truncate">
                                {deviceLabel}
                              </h4>
                              {session.is_current && (
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-green-600 dark:text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  Текущий сеанс
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              IP:{" "}
                              <span className="font-mono text-[11px]">{ipLabel}</span>
                              {" · "}
                              {formatLoginMethod(session.login_method)}
                            </p>
                            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                              Активность: {lastSeenLabel}
                              {" · "}
                              Вход: {formatDateTime(session.created_at, false)}
                            </p>
                          </div>
                          {!session.is_current && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={revokingId === session.id}
                              onClick={() => void handleRevokeSession(session)}
                              className="rounded-xl text-xs shrink-0 h-8"
                            >
                              {revokingId === session.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Завершить сеанс"
                              )}
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="text-xs text-muted-foreground/60 bg-muted/10 p-3.5 rounded-xl border border-border/40">
                    Примечание: при подозрении на несанкционированный доступ завершите
                    чужие сессии выше или нажмите «Выйти» в боковом меню — сеанс
                    отзывается на сервере, повторный вход потребует авторизации.
                  </div>
                </div>

                {/* История входов */}
                <div className="space-y-4 border-t border-border/40 pt-5">
                  <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                      Входы
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    История успешных и неудачных попыток входа (до 90 дней)
                  </p>

                  {eventsError && (
                    <p className="text-xs text-destructive">{eventsError}</p>
                  )}

                  {!sessionsLoading && loginEvents.length === 0 && !eventsError && (
                    <p className="text-xs text-muted-foreground py-2">
                      Пока нет записей о входах
                    </p>
                  )}

                  <div className="space-y-1.5">
                    {loginEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-muted/5"
                      >
                        <div className="shrink-0 mt-0.5">
                          {event.success ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-foreground">
                              {event.success
                                ? "Успешный вход"
                                : "Неудачная попытка"}
                            </span>
                            {event.login_method && (
                              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {formatLoginMethod(event.login_method)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {event.device_label?.trim() || "Устройство неизвестно"}
                            {" · "}
                            <span className="font-mono">
                              {event.ip_address?.trim() || "IP неизвестен"}
                            </span>
                          </p>
                          {!event.success && event.failure_reason && (
                            <p className="text-[11px] text-destructive/90 mt-0.5">
                              {event.failure_reason}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
                          {formatDateTime(event.created_at, false)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AvatarPickerDialog
        open={avatarPickerOpen}
        onOpenChange={setAvatarPickerOpen}
        currentSeed={localUser?.avatar_seed ?? null}
        onPick={handleAvatarPick}
        isSaving={avatarSaving}
      />
    </>
  )
}
