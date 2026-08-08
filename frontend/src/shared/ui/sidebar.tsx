import { useMemo, useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
import { redirectToKtmLogin } from "@/shared/api/authHost"
import { useAuth } from "@/features/auth/hooks/useAuth"
import { HrmsUserSettingsDialog } from "@/features/user-settings/HrmsUserSettingsDialog"
import { HrmsNotificationBell } from "@/features/notifications"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { getUserSeed } from "@/shared/lib/avatar"
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Users,
  FileText,
  CalendarDays,
  Building2,
  Stethoscope,
  Settings,
  LogIn,
  LogOut,
  Wrench,
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

export function Sidebar({ afterNav }: { afterNav?: ReactNode }) {
  const location = useLocation()
  const { logout, user, refreshUser, isLoading } = useAuth()
  const hasActiveAbsenceItem = useMemo(
    () => absenceItems.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)),
    [location.pathname]
  )

  const isTopNavActive = (to: string): boolean => {
    const { pathname } = location
    return pathname === to || pathname.startsWith(`${to}/`)
  }
  const [absenceOpen, setAbsenceOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <aside className="w-64 h-screen sticky top-0 bg-card border-r flex flex-col shrink-0">
      <div className="p-6 flex items-center gap-3">
        <a
          href={getKtmDashboardURL()}
          className="shrink-0 hover:opacity-80 transition-opacity"
          title="Панель приложений"
        >
          <img
            src="/logo.svg"
            alt="HRMS"
            className="h-10 w-10 rounded-xl"
            width={40}
            height={40}
          />
        </a>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">HRMS</h1>
          <p className="text-sm text-muted-foreground">Управление персоналом</p>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {topNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={() =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
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
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
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
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
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
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
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
        {afterNav}
      </nav>

      <div className="p-3 border-t flex flex-col gap-2">
        {isLoading ? (
          <div className="flex items-center gap-3 px-3 py-2" role="status" aria-label="Загрузка профиля">
            <div className="h-8 w-8 shrink-0 rounded-xl bg-muted animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              <div className="h-2 w-16 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ) : user ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-accent transition-all group"
                title="Настройки профиля"
              >
                <UserAvatar
                  seed={getUserSeed(user)}
                  size={32}
                  className="group-hover:scale-105 transition-transform"
                />
              </button>
              <HrmsNotificationBell />
            </div>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex w-full items-center gap-3 px-3 py-1.5 rounded-xl text-left hover:bg-accent transition-all group"
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
              className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
            <HrmsUserSettingsDialog
              open={profileOpen}
              onOpenChange={setProfileOpen}
              onProfileUpdated={() => {
                void refreshUser().catch((err) => {
                  console.error("Не удалось обновить профиль после сохранения:", err)
                })
              }}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={redirectToKtmLogin}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Войти (SSO)
          </button>
        )}
      </div>
    </aside>
  )
}
