import { useMemo, useState, useEffect, useCallback } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
import api, { getToken, logout, redirectToKtmLogin } from "@/shared/api/axios"
import { UserProfileModal } from "@/features/user-profile/UserProfileModal"
import { UserAvatar } from "@/shared/ui/user-avatar"
import { getUserSeed } from "@/shared/lib/avatar"
import { TelegramIcon } from "@/shared/ui/icons"
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

function decodeToken(token: string) {
  if (token === "admin") {
    return { username: "admin", full_name: "Администратор" }
  }
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch (e) {
    return null
  }
}

const topNavItems = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/employees", label: "Сотрудники", icon: Users },
  { to: "/timesheet", label: "Табель учёта", icon: CalendarDays },
  { to: "/structure", label: "Структура", icon: Building2 },
  { to: "/orders", label: "Приказы", icon: FileText },
  { to: "/vacations", label: "Трудовой отпуск", icon: CalendarDays },
  { to: "/vacation-calendar", label: "Календарь отпусков", icon: CalendarDays },
]

const bottomNavItems = [
  { to: "/settings", label: "Настройки", icon: Settings },
  ...(import.meta.env.DEV ? [{ to: "/dev", label: "Dev", icon: Wrench }] : []),
]

const absenceItems = [
  { to: "/unpaid-leaves", label: "Отпуск за свой счет", icon: CalendarDays },
  { to: "/weekend-calls", label: "Вызовы в выходные дни", icon: FileText },
  { to: "/sick-leaves", label: "Больничные", icon: Stethoscope },
]

export function Sidebar() {
  const location = useLocation()
  const hasActiveAbsenceItem = useMemo(
    () => absenceItems.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)),
    [location.pathname]
  )
  const [absenceOpen, setAbsenceOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const [currentUser, setCurrentUser] = useState<any>(() => {
    const token = getToken()
    if (!token) return null
    const decoded = decodeToken(token)
    if (!decoded) return null
    return {
      username: decoded.username || "",
      role: decoded.hrms_access_level || decoded.role || "viewer",
      full_name: decoded.full_name || "Пользователь",
    }
  })

  const refreshProfile = useCallback(() => {
    const token = getToken()
    if (token) {
      api.get("/auth/me")
        .then((res) => {
          setCurrentUser(res.data)
        })
        .catch((err) => {
          console.error("Не удалось перезагрузить данные пользователя:", err)
        })
    }
  }, [])

  useEffect(() => {
    const token = getToken()
    if (token) {
      refreshProfile()
    } else {
      setCurrentUser(null)
    }
  }, [location.pathname, refreshProfile])

  return (
    <aside className="w-64 h-screen sticky top-0 bg-card border-r flex flex-col shrink-0">
      <div className="p-6">
        <h1 className="text-xl font-bold">HRMS</h1>
        <p className="text-sm text-muted-foreground">Управление персоналом</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {topNavItems.map((item) => (
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

        {bottomNavItems.map((item) => (
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
      </nav>

      <div className="p-3 border-t flex flex-col gap-2">
        {currentUser ? (
          <>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-accent transition-all group"
            >
              <UserAvatar
                seed={getUserSeed(currentUser)}
                size={32}
                className="group-hover:scale-105 transition-transform"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
                  {currentUser.full_name || "Пользователь"}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                  <span className="truncate">Настройки профиля</span>
                  {currentUser.telegram_id != null && (
                    <span
                      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#2AABEE] text-white shrink-0"
                      title={currentUser.telegram_username ? `@${currentUser.telegram_username.replace("@", "")}` : "Telegram привязан"}
                      aria-label="Telegram привязан"
                    >
                      <TelegramIcon className="h-2 w-2 fill-current" />
                    </span>
                  )}
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
            <UserProfileModal
              open={profileOpen}
              onOpenChange={setProfileOpen}
              currentUser={currentUser}
              onUpdateProfile={refreshProfile}
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
