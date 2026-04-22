import { useMemo, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
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
  Wrench,
} from "lucide-react"

const topNavItems = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/employees", label: "Сотрудники", icon: Users },
  { to: "/structure", label: "Структура", icon: Building2 },
  { to: "/orders", label: "Приказы", icon: FileText },
]

const bottomNavItems = [
  { to: "/settings", label: "Настройки", icon: Settings },
  { to: "/dev", label: "Dev", icon: Wrench },
]

const absenceItems = [
  { to: "/vacations", label: "Трудовой отпуск", icon: CalendarDays },
  { to: "/vacation-calendar", label: "Календарь отпусков", icon: CalendarDays },
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

      <div className="p-3 border-t">
        <NavLink
          to="/login"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogIn className="h-4 w-4" />
          Вход
        </NavLink>
      </div>
    </aside>
  )
}
