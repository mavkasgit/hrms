import { useMemo, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
import { getToken, logout, redirectToKtmLogin } from "@/shared/api/axios"
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

  const token = getToken()
  const user = token ? decodeToken(token) : null

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
        {user ? (
          <>
            <div className="px-3 py-1.5 text-xs text-muted-foreground break-all">
              <div className="font-semibold text-foreground text-sm truncate">
                {user.full_name || "Пользователь"}
              </div>
              {(user.username || user.sub) && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Логин: {user.username || user.sub}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Выйти
            </button>
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
