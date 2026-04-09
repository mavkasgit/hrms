import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Search } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import {
  useVacationPlanSummary,
  useCreateOrUpdateVacationPlan,
} from "@/entities/vacation-plan"
import { useEmployees } from "@/entities/employee/useEmployees"
import type { VacationPlanSummary } from "@/entities/vacation-plan/types"

interface CalendarRow {
  employee_id: number
  employee_name: string
  department: string
  months: Record<number, number | null>
  total_days: number
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear()
  const startYear = 2026
  const years: number[] = []
  for (let y = startYear; y <= currentYear + 1; y++) years.push(y)
  return years
}

function formatDays(days: number | null | undefined): string {
  if (days === null || days === undefined || days <= 0) return ""
  return String(days)
}

function getCellClasses(days: number | null | undefined): string {
  const base = "w-[70px] h-8 text-[14px] flex items-center justify-center overflow-hidden truncate transition-colors"
  if (days !== null && days !== undefined && days > 0) return `${base} bg-sky-100 font-semibold`
  return base
}

export function VacationCalendarPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(2026)
  const [search, setSearch] = useState("")

  const { data: summaries, isLoading: plansLoading } = useVacationPlanSummary(year)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000, status: "active" })
  const createMutation = useCreateOrUpdateVacationPlan()

  const [editingCell, setEditingCell] = useState<{ employeeId: number; month: number } | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)
  const activeMonth = editingCell?.month ?? hoveredMonth

  // Merge all employees with plan data
  const combinedData: CalendarRow[] = useMemo(() => {
    const planMap = new Map<number, VacationPlanSummary>()
    if (summaries) {
      for (const s of summaries) planMap.set(s.employee_id, s)
    }

    if (!allEmployees?.items) return []

    return allEmployees.items.map((emp) => {
      const existing = planMap.get(emp.id)
      if (existing) return existing
      return {
        employee_id: emp.id,
        employee_name: emp.name,
        department: emp.department,
        months: {} as Record<number, number | null>,
        total_days: 0,
      }
    })
  }, [summaries, allEmployees])

  const filtered = useMemo(() => {
    if (!search) return combinedData
    const q = search.toLowerCase()
    return combinedData.filter(
      (s) => s.employee_name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q)
    )
  }, [combinedData, search])

  const handleCellClick = (employeeId: number, month: number, currentValue: number | null) => {
    setEditingCell({ employeeId, month })
    setEditingValue(currentValue !== null ? String(currentValue) : "")
  }

  const handleCellSave = () => {
    if (!editingCell) return
    const raw = editingValue.trim()
    let days: number
    if (raw.includes("/")) {
      const [num, den] = raw.split("/").map(Number)
      days = isNaN(num) || isNaN(den) || den === 0 ? NaN : num / den
    } else {
      days = parseFloat(raw)
    }
    if (isNaN(days) || days < 0) {
      setEditingCell(null)
      return
    }
    createMutation.mutate({ employee_id: editingCell.employeeId, year, month: editingCell.month, days })
    setEditingCell(null)
  }

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCellSave()
    if (e.key === "Escape") setEditingCell(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/vacations")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Календарь отпусков</h1>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex items-center gap-3">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getYearOptions().map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по сотруднику или отделу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Таблица */}
      {plansLoading || !allEmployees ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 text-left font-medium py-2 px-3 min-w-[200px] z-10 border border-zinc-300 bg-background">Сотрудник</th>
                <th className="text-left font-medium py-2 px-2 min-w-[100px] border border-zinc-300 bg-background">Отдел</th>
                {MONTHS.map((m, i) => {
                  const monthNum = i + 1
                  const isActive = activeMonth === monthNum
                  return (
                    <th key={i} className={`text-center font-medium py-2 px-1 min-w-[70px] border border-zinc-300 transition-colors ${isActive ? "bg-blue-100" : "bg-background"}`}>{m.substring(0, 3)}</th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isHovered = hoveredRow === row.employee_id
                return (
                <tr key={row.employee_id} className={`${isHovered ? "!bg-zinc-100" : ""}`} onMouseEnter={() => setHoveredRow(row.employee_id)} onMouseLeave={() => setHoveredRow(null)}>
                  <td className={`sticky left-0 py-1.5 px-3 z-10 font-medium border border-zinc-300 ${isHovered ? "!bg-zinc-100" : "bg-background"}`}>{row.employee_name}</td>
                  <td className="py-1.5 px-2 text-muted-foreground text-xs border border-zinc-300">{row.department}</td>
                  {MONTHS.map((_, monthIdx) => {
                    const monthNum = monthIdx + 1
                    const value = row.months[monthNum] ?? null
                    const isEditing = editingCell?.employeeId === row.employee_id && editingCell?.month === monthNum
                    return (
                      <td key={monthNum} className={`p-0 border border-zinc-300 w-[70px] min-w-[70px] max-w-[70px] h-8 ${isEditing ? "outline outline-2 outline-blue-600 outline-offset-[-2px] z-10 relative" : ""}`}
                        onMouseEnter={() => setHoveredMonth(monthNum)}
                        onMouseLeave={() => setHoveredMonth(null)}
                      >
                        {isEditing ? (
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={handleCellKeyDown}
                            onBlur={() => { setHoveredMonth(null); handleCellSave() }}
                            className="h-8 w-[70px] text-[14px] px-0 text-center border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-background overflow-hidden truncate caret-transparent"
                            autoFocus
                            placeholder="—"
                          />
                        ) : (
                          <button
                            onClick={() => handleCellClick(row.employee_id, monthNum, value)}
                            className={getCellClasses(value)}
                          >
                            {formatDays(value)}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
