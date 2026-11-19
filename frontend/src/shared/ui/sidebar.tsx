import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useMediaQuery } from "@siberiacancode/reactuse"
import { NavLink, useLocation } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
import { redirectToKtmLogin } from "@/shared/api/authHost"
import { useAuth } from "@/features/auth/hooks/useAuth"
import { HrmsUserSettingsDialog } from "@/features/user-settings/HrmsUserSettingsDialog"
import { HrmsNotificationBell } from "@/features/notifications"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { getUserSeed } from "@/shared/lib/avatar"
import {
  DESKTOP_MEDIA_QUERY,
  MOBILE_DRAWER_CLOSE_DELAY_MS,
  MOBILE_TOP_BAR_HEIGHT_CLASS,
} from "@/shared/lib/mobileLayout"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog"
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Users,
  FileText,
  CalendarDays,
  Building2,
  Stethoscope,
  Settings,
  LogIn,
  LogOut,
  Wrench,
  X,
} from "lucide-react"

const topNavItems = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/employees", label: "Сотрудники", icon: Users },
  { to: "/timesheet", label: "Табель учёта", icon: CalendarDays },
  { to: "/structure", label: "Структура", icon: Building2 },
  { to: "/orders", label: "Приказы", icon: FileText },
  { to: "/vacations", label: "Трудовой отпуск", icon: CalendarDays },
  { to: "/vacation-calendar", label: "Календарь отпусков", icon: CalendarDays },
]

const bottomNavItemsBase = [
  { to: "/settings", label: "Настройки", icon: Settings },
  ...(import.meta.env.DEV ? [{ to: "/dev", label: "Dev", icon: Wrench }] : []),
]

const absenceItems = [
  { to: "/unpaid-leaves", label: "Отпуск за свой счет", icon: CalendarDays },
  { to: "/weekend-calls", label: "Вызовы в выходные дни", icon: FileText },
  { to: "/sick-leaves", label: "Больничные", icon: Stethoscope },
]

const getKtmDashboardURL = () => {
  return `${window.location.protocol}//${window.location.hostname}:9000`
}

function BrandLogo({ compact = false }: { compact?: boolean }) {
  const size = compact ? 32 : 40
  return (
    <img
      src="/logo.svg"
      alt="HRMS"
      className={compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"}
      width={size}
      height={size}
    />
  )
}

type SidebarContentProps = {
  afterNav?: ReactNode
  mobile?: boolean
  onDismiss?: () => void
  onOpenProfile: () => void
}

function SidebarContent({
  afterNav,
  mobile = false,
  onDismiss,
  onOpenProfile,
}: SidebarContentProps) {
  const location = useLocation()
  const { logout, user, isLoading } = useAuth()
  const hasActiveAbsenceItem = useMemo(
    () =>
      absenceItems.some(
        (item) =>
          location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
      ),
    [location.pathname]
  )

  const isTopNavActive = (to: string): boolean => {
    const { pathname } = location
    return pathname === to || pathname.startsWith(`${to}/`)
  }
  const [absenceOpen, setAbsenceOpen] = useState(false)

  const navItemClassName = cn(
    "flex items-center gap-3 px-3 rounded-md text-sm transition-colors",
    mobile ? "py-2.5" : "py-2"
  )
  const footerButtonClassName = cn(
    "flex w-full items-center gap-3 px-3 rounded-md text-sm transition-colors",
    mobile ? "py-2.5" : "py-2"
  )

  return (
    <>
      <div className={cn("flex items-center gap-3", mobile ? "p-4" : "p-6")}>
        <a
          href={getKtmDashboardURL()}
          className="shrink-0 hover:opacity-80 transition-opacity"
          title="Панель приложений"
        >
          <BrandLogo />
        </a>
        <div className={cn("min-w-0", mobile && "flex-1")}>
          <h1 className="text-xl font-bold leading-tight">HRMS</h1>
          <p className="text-sm text-muted-foreground">Управление персоналом</p>
        </div>
        {mobile && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Закрыть меню"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className={cn("flex-1 px-3 space-y-1", mobile && "overflow-y-auto")}>
        {topNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onDismiss}
            className={() =>
              cn(
                navItemClassName,
                isTopNavActive(item.to)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setAbsenceOpen((prev) => !prev)}
            className={cn(
              navItemClassName,
              "w-full",
              hasActiveAbsenceItem
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="flex-1 text-left">Отсутствия</span>
            {absenceOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {absenceOpen && (
            <div className="ml-4 space-y-1">
              {absenceItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onDismiss}
                  className={({ isActive }) =>
                    cn(
                      navItemClassName,
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {bottomNavItemsBase.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onDismiss}
            className={({ isActive }) =>
              cn(
                navItemClassName,
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
        {afterNav && <div onClick={onDismiss}>{afterNav}</div>}
      </nav>

      <div className={cn("p-3 border-t flex flex-col gap-2", mobile && "shrink-0")}>
        {isLoading ? (
          <div className="flex items-center gap-3 px-3 py-2" role="status" aria-label="Загрузка профиля">
            <div className="h-8 w-8 shrink-0 rounded-xl bg-muted animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-muted animate-pulse rounded-sm" />
              <div className="h-2 w-16 bg-muted animate-pulse rounded-sm" />
            </div>
          </div>
        ) : user ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-accent transition-all group"
                title="Настройки профиля"
              >
                <UserAvatar
                  seed={getUserSeed(user)}
                  size={32}
                  className="group-hover:scale-105 transition-transform"
                />
              </button>
              {!mobile && <HrmsNotificationBell />}
            </div>
            <button
              type="button"
              onClick={onOpenProfile}
              className={cn(
                "flex w-full items-center gap-3 px-3 rounded-xl text-left hover:bg-accent transition-all group",
                mobile ? "py-2" : "py-1.5"
              )}
              title="Настройки профиля"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
                  {user.full_name || "Пользователь"}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  Настройки профиля
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={logout}
              className={cn(
                footerButtonClassName,
                "text-destructive hover:bg-destructive/10"
              )}
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={redirectToKtmLogin}
            className={cn(
              footerButtonClassName,
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <LogIn className="h-4 w-4" />
            Войти (SSO)
          </button>
        )}
      </div>
    </>
  )
}

export function Sidebar({ afterNav }: { afterNav?: ReactNode }) {
  const location = useLocation()
  const { refreshUser } = useAuth()
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [pendingProfileOpen, setPendingProfileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (isDesktop) {
      setMobileOpen(false)
      setPendingProfileOpen(false)
    }
  }, [isDesktop])

  useEffect(() => {
    if (!pendingProfileOpen || mobileOpen) return
    const timer = window.setTimeout(() => {
      setPendingProfileOpen(false)
      setProfileOpen(true)
    }, MOBILE_DRAWER_CLOSE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [pendingProfileOpen, mobileOpen])

  const dismissMobile = () => setMobileOpen(false)

  const handleMobileOpenChange = (open: boolean) => {
    if (open) setPendingProfileOpen(false)
    setMobileOpen(open)
  }

  const openProfile = () => {
    if (isDesktop) {
      setProfileOpen(true)
      return
    }
    setPendingProfileOpen(true)
    setMobileOpen(false)
  }

  const profileDialog = (
    <HrmsUserSettingsDialog
      open={profileOpen}
      onOpenChange={setProfileOpen}
      onProfileUpdated={() => {
        void refreshUser().catch((err) => {
          console.error("Не удалось обновить профиль после сохранения:", err)
        })
      }}
    />
  )

  if (isDesktop) {
    return (
      <>
        <aside className="w-64 h-screen sticky top-0 bg-card border-r flex flex-col shrink-0">
          <SidebarContent afterNav={afterNav} onOpenProfile={openProfile} />
        </aside>
        {profileDialog}
      </>
    )
  }

  return (
    <>
      <Dialog open={mobileOpen} onOpenChange={handleMobileOpenChange}>
        <header
          className={cn(
            "fixed inset-x-0 top-0 z-40 flex items-center gap-2 border-b bg-card px-3",
            MOBILE_TOP_BAR_HEIGHT_CLASS
          )}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </button>
          </DialogTrigger>
          <a
            href={getKtmDashboardURL()}
            className="flex min-w-0 items-center gap-2 hover:opacity-80 transition-opacity"
            title="Панель приложений"
          >
            <BrandLogo compact />
            <span className="text-base font-bold">HRMS</span>
          </a>
          <div className="ml-auto flex items-center [&>button]:h-10">
            <HrmsNotificationBell />
          </div>
        </header>

        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          overlayTestId="mobile-nav-overlay"
          className="mobile-nav-drawer fixed left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r bg-card p-0 shadow-xl data-[state=open]:animate-mobile-nav-in data-[state=closed]:animate-mobile-nav-out motion-reduce:!animate-none sm:rounded-none"
        >
          <DialogTitle className="sr-only">Навигация</DialogTitle>
          <SidebarContent
            afterNav={afterNav}
            mobile
            onDismiss={dismissMobile}
            onOpenProfile={openProfile}
          />
        </DialogContent>
      </Dialog>

      {profileDialog}
    </>
  )
}
