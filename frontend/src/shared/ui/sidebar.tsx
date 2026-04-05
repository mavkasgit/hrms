import { NavLink } from "react-router-dom"
import { cn } from "@/shared/utils/cn"
import {
  LayoutDashboard,
  Users,
  FileText,
  CalendarDays,
  Settings,
  LogIn,
  Wrench,
} from "lucide-react"

const navItems = [
  { to: "/", label: "Дашборд", icon: LayoutDashboard },
  { to: "/employees", label: "Сотрудники", icon: Users },
  { to: "/orders", label: "Приказы", icon: FileText },
  { to: "/vacations", label: "Отпуска", icon: CalendarDays },
  { to: "/settings", label: "Настройки", icon: Settings },
  { to: "/dev", label: "Dev", icon: Wrench },
]

export function Sidebar() {
  return (
    <aside className="w-64 h-screen sticky top-0 bg-card border-r flex flex-col shrink-0">
      <div className="p-6">
        <h1 className="text-xl font-bold">HRMS</h1>
        <p className="text-sm text-muted-foreground">Управление персоналом</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
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
