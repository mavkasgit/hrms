import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react"
import { Laptop, Palette, Shield, UserRound } from "lucide-react"
import type { UserSettingsApi } from "./api/adapter"
import { UserSettingsContext, type ResolvedFeatures } from "./context"
import { resolveDict, type UserSettingsDictOverride } from "./i18n"
import type {
  UserLocale,
  UserProfile,
  UserSettingsCallbacks,
  UserSettingsFeatures,
  UserTheme,
} from "./types"
import { AppearancePanel } from "./components/AppearancePanel"
import { ProfilePanel } from "./components/ProfilePanel"
import { SecurityPanel } from "./components/SecurityPanel"
import { SessionsPanel } from "./components/SessionsPanel"
import { AvatarArt } from "./components/AvatarArt"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  TooltipProvider,
  cn,
} from "./ui"

export type UserSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Адаптер данных (обязателен). См. createHttpAdapter или своя реализация. */
  api: UserSettingsApi
  /** Переопределения строк (deep-partial поверх русского словаря). */
  dict?: UserSettingsDictOverride
  /** Флаги разделов. По умолчанию — авто по методам api. */
  features?: UserSettingsFeatures
  /** Колбэки интеграции с хостом. */
  callbacks?: UserSettingsCallbacks
}

type SectionId = "profile" | "appearance" | "security" | "sessions"

const SECTION_ICONS: Record<SectionId, ComponentType<{ className?: string }>> = {
  profile: UserRound,
  appearance: Palette,
  security: Shield,
  sessions: Laptop,
}

/**
 * Модальное окно настроек пользователя (профиль / внешний вид /
 * безопасность / сессии). Самодостаточный модуль: все данные — через
 * `api`, все строки — через `dict`, все побочные эффекты — через `callbacks`.
 */
export function UserSettingsDialog({
  open,
  onOpenChange,
  api,
  dict: dictOverride,
  features: featuresProp,
  callbacks,
}: UserSettingsDialogProps) {
  const dict = useMemo(() => resolveDict(dictOverride), [dictOverride])

  const features = useMemo<ResolvedFeatures>(
    () => ({
      avatar: featuresProp?.avatar ?? true,
      idp: featuresProp?.idp ?? Boolean(api.getIdpLinks),
      sessions: featuresProp?.sessions ?? Boolean(api.listSessions),
      loginHistory: featuresProp?.loginHistory ?? Boolean(api.listLoginEvents),
      appearance: featuresProp?.appearance ?? true,
    }),
    [api, featuresProp],
  )

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [section, setSection] = useState<SectionId>("profile")
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>({})
  const [confirmClose, setConfirmClose] = useState(false)
  const closeIntentRef = useRef(false)

  const hasDirty = Object.values(dirtySections).some(Boolean)

  const setDirty = useCallback((id: string, dirty: boolean) => {
    setDirtySections((prev) =>
      prev[id] === dirty ? prev : { ...prev, [id]: dirty },
    )
  }, [])

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      // refresh=1: при открытии и после сохранения синхронизируем профиль с IdP,
      // не дожидаясь TTL-кэша бэкенда (мгновенный перенос между приложениями).
      const next = await api.getProfile(true)
      setProfile(next)
      callbacks?.onProfileUpdated?.(next)
      return next
    } catch {
      return null
    }
  }, [api, callbacks])

  // Загрузка профиля при открытии; сброс локального состояния.
  useEffect(() => {
    if (!open) return
    setSection("profile")
    setDirtySections({})
    void refreshProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** Запрос на закрытие: с «грязными» формами — через подтверждение. */
  const requestClose = useCallback(
    (next: boolean) => {
      if (next) {
        onOpenChange(true)
        return
      }
      if (hasDirty && !closeIntentRef.current) {
        setConfirmClose(true)
        return
      }
      closeIntentRef.current = false
      onOpenChange(false)
    },
    [hasDirty, onOpenChange],
  )

  const confirmDiscard = useCallback(() => {
    closeIntentRef.current = true
    setConfirmClose(false)
    setDirtySections({})
    onOpenChange(false)
  }, [onOpenChange])

  const ctxValue = useMemo(
    () => ({
      api,
      dict,
      features,
      callbacks: callbacks ?? {},
      profile,
      refreshProfile,
      applyTheme: (t: UserTheme) => callbacks?.onThemeChange?.(t),
      applyLocale: (l: UserLocale) => callbacks?.onLocaleChange?.(l),
      notify: callbacks?.notify,
      setDirty,
      onLogoutRequest: callbacks?.onLogoutRequest,
    }),
    [api, dict, features, callbacks, profile, refreshProfile, setDirty],
  )

  const sections = useMemo(
    () =>
      (
        [
          { id: "profile" as const, label: dict.nav.profile, visible: true },
          {
            id: "appearance" as const,
            label: dict.nav.appearance,
            visible: features.appearance,
          },
          {
            id: "security" as const,
            label: dict.nav.security,
            visible: features.idp,
          },
          {
            id: "sessions" as const,
            label: dict.nav.sessions,
            visible: features.sessions,
          },
        ]
      ).filter((s) => s.visible),
    [dict, features],
  )

  const activeMeta = {
    profile: { title: dict.profile.title, description: dict.profile.description },
    appearance: {
      title: dict.appearance.title,
      description: dict.appearance.description,
    },
    security: { title: dict.security.title, description: dict.security.description },
    sessions: { title: dict.sessions.title, description: dict.sessions.description },
  }[section]

  return (
    <UserSettingsContext.Provider value={ctxValue}>
      <TooltipProvider delayDuration={300}>
        <Dialog open={open} onOpenChange={requestClose}>
          <DialogContent className="flex h-[600px] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0 shadow-2xl md:flex-row">
            {/* Левая колонка: карточка пользователя + навигация */}
            <div className="flex w-full shrink-0 flex-row items-center gap-2 overflow-x-auto border-b border-border bg-muted/30 p-3 md:w-[240px] md:flex-col md:items-stretch md:overflow-visible md:border-b-0 md:border-r md:p-4">
              <div className="hidden items-center gap-3 border-b border-border/60 px-2 pb-4 md:flex">
                <AvatarArt
                  seed={profile?.avatar_seed}
                  size={44}
                  className="shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  {profile ? (
                    <>
                      <p className="truncate text-sm font-semibold text-foreground">
                        {profile.full_name || profile.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{profile.username}
                      </p>
                    </>
                  ) : (
                    <>
                      <Skeleton className="mb-1.5 h-3.5 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </>
                  )}
                </div>
              </div>

              <nav
                className="flex flex-row gap-1 md:mt-3 md:flex-col"
                aria-label="User settings"
              >
                {sections.map(({ id, label }) => {
                  const Icon = SECTION_ICONS[id]
                  const active = section === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSection(id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* Правая колонка: заголовок активного раздела + контент */}
            <div className="flex min-w-0 flex-1 flex-col bg-card">
              <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
                <DialogTitle className="text-lg font-bold">
                  {activeMeta.title}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {activeMeta.description}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {section === "profile" && <ProfilePanel />}
                {section === "appearance" && features.appearance && (
                  <AppearancePanel />
                )}
                {section === "security" && <SecurityPanel />}
                {section === "sessions" && features.sessions && <SessionsPanel />}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Подтверждение закрытия с несохранёнными изменениями */}
        <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{dict.guard.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {dict.guard.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{dict.guard.keepEditing}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDiscard}>
                {dict.guard.discard}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </UserSettingsContext.Provider>
  )
}
