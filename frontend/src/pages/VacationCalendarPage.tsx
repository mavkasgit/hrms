import { useState, useMemo, Fragment } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Search,
  Tag,
  X,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { Badge } from "@/shared/ui/badge"
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
import { useTags } from "@/entities/tag/useTags"
import type { VacationPlanSummary } from "@/entities/vacation-plan/types"
import type { EmployeeTag } from "@/entities/employee/types"
import { renderIcon } from "@/pages/structure-page/shared/EntityDialog"

interface CalendarRow {
  employee_id: number
  employee_name: string
  department_id: number
  department_name: string
  department_color?: string
  department_icon?: string
  tags: EmployeeTag[]
  months: Record<number, string | null>
  total_plan_count: string
}

type SortDir = "none" | "asc" | "desc"

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

function formatDays(days: string | null | undefined): string {
  if (days === null || days === undefined) return ""
  return String(days)
}

function getCellClasses(days: string | null | undefined): string {
  const base =
    "w-full h-full text-[14px] flex items-center justify-center overflow-hidden truncate transition-colors"
  if (days !== null && days !== undefined) return `${base} bg-sky-100 font-semibold`
  return base
}

function toggleSort(prev: SortDir): SortDir {
  if (prev === "none") return "asc"
  if (prev === "asc") return "desc"
  return "none"
}

function compareStr(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, "ru")
  return dir === "asc" ? cmp : -cmp
}

export function VacationCalendarPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(2026)
  const [search, setSearch] = useState("")
  const [departmentSort, setDepartmentSort] = useState<SortDir>("none")
  const [tagSort, setTagSort] = useState<SortDir>("none")
  const [employeeSort, setEmployeeSort] = useState<SortDir>("none")
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [activeMonthFilter, setActiveMonthFilter] = useState<number | null>(null)

  const { data: summaries, isLoading: plansLoading } = useVacationPlanSummary(year)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000, status: "active" })
  const { data: allTags } = useTags()
  const createMutation = useCreateOrUpdateVacationPlan()

  const [editingCell, setEditingCell] = useState<{
    employeeId: number
    month: number
  } | null>(null)
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
      const departmentName = emp.department?.name || `Подразделение #${emp.department_id}`
      const departmentColor = emp.department?.color
      const departmentIcon = emp.department?.icon
      if (existing) {
        return {
          ...existing,
          department_name: departmentName,
          department_color: departmentColor,
          department_icon: departmentIcon,
          tags: emp.tags || [],
        }
      }
      return {
        employee_id: emp.id,
        employee_name: emp.name,
        department_id: emp.department_id,
        department_name: departmentName,
        department_color: departmentColor,
        department_icon: departmentIcon,
        tags: emp.tags || [],
        months: {} as Record<number, string | null>,
        total_plan_count: "0",
      }
    })
  }, [summaries, allEmployees])

  const filtered = useMemo(() => {
    let rows = combinedData

    // Фильтр по тегам (AND)
    if (selectedTagIds.length > 0) {
      rows = rows.filter((r) =>
        selectedTagIds.every((id) => r.tags.some((t) => t.id === id))
      )
    }

    // Фильтр по месяцу (только с запланированными днями)
    if (activeMonthFilter !== null) {
      rows = rows.filter((r) => {
        const val = r.months[activeMonthFilter]
        return val !== null && val !== undefined && val !== ""
      })
    }

    // Поиск по тексту
    const q = search.toLowerCase().trim()
    if (q) {
      rows = rows.filter(
        (s) =>
          s.employee_name.toLowerCase().includes(q) ||
          s.department_name.toLowerCase().includes(q) ||
          s.department_id.toString().includes(q)
      )
    }

    // Сортировка
    const sortedRows = [...rows].sort((a, b) => {
      // 1. Подразделение
      if (departmentSort !== "none") {
        const cmp = compareStr(a.department_name, b.department_name, departmentSort)
        if (cmp !== 0) return cmp
      }
      // 2. Теги (по первому тегу, без тегов в конце)
      if (tagSort !== "none") {
        const aTag = a.tags[0]?.name || ""
        const bTag = b.tags[0]?.name || ""
        const cmp = compareStr(aTag, bTag, tagSort)
        if (cmp !== 0) return cmp
      }
      // 3. ФИО
      if (employeeSort !== "none") {
        const cmp = compareStr(a.employee_name, b.employee_name, employeeSort)
        if (cmp !== 0) return cmp
      }
      // fallback — по ФИО
      return a.employee_name.localeCompare(b.employee_name, "ru")
    })

    return sortedRows
  }, [
    combinedData,
    search,
    departmentSort,
    tagSort,
    employeeSort,
    selectedTagIds,
    activeMonthFilter,
  ])

  const groupedRows = useMemo(() => {
    return [{ key: "all", label: null, rows: filtered }]
  }, [filtered])

  const handleCellClick = (
    employeeId: number,
    month: number,
    currentValue: string | null
  ) => {
    setEditingCell({ employeeId, month })
    setEditingValue(currentValue !== null ? String(currentValue) : "")
  }

  const handleCellSave = () => {
    if (!editingCell) return
    const raw = editingValue.trim().replace(",", ".")
    createMutation.mutate({
      employee_id: editingCell.employeeId,
      year,
      month: editingCell.month,
      plan_count: raw,
    })
    setEditingCell(null)
  }

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCellSave()
    if (e.key === "Escape") setEditingCell(null)
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      setEditingValue("")
    }
  }

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    )
  }

  const clearTags = () => setSelectedTagIds([])

  const handleMonthHeaderClick = (monthNum: number) => {
    setActiveMonthFilter((prev) => (prev === monthNum ? null : monthNum))
  }

  const SortButton = ({
    label,
    sort,
    onToggle,
    title,
  }: {
    label: string
    sort: SortDir
    onToggle: () => void
    title?: string
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground"
      title={title || `Сортировать по ${label}`}
    >
      <span>{label}</span>
      {sort === "asc" && <ChevronUp className="h-3.5 w-3.5" />}
      {sort === "desc" && <ChevronDown className="h-3.5 w-3.5" />}
      {sort === "none" && <ArrowUpDown className="h-3.5 w-3.5" />}
    </button>
  )

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
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getYearOptions().map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по сотруднику или подразделению..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

      </div>

      {/* Фильтр по тегам и месяцу */}
      {(allTags && allTags.length > 0) || activeMonthFilter !== null ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeMonthFilter !== null && (
            <Badge variant="secondary" className="gap-1 mr-1">
              Месяц: {MONTHS[activeMonthFilter - 1]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => setActiveMonthFilter(null)}
              />
            </Badge>
          )}
          {allTags && allTags.length > 0 && (
            <>
              <Tag className="h-4 w-4 text-muted-foreground" />
              {allTags.map((t) => {
                const isSelected = selectedTagIds.includes(t.id)
                return (
                  <Badge
                    key={t.id}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer text-[11px] h-6 gap-1"
                    style={
                      isSelected ? {} : { borderColor: t.color, color: t.color }
                    }
                    onClick={() => toggleTag(t.id)}
                  >
                    {t.name}
                    {isSelected && <X className="h-3 w-3" />}
                  </Badge>
                )
              })}
            </>
          )}
          {selectedTagIds.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={clearTags}
            >
              Сбросить
            </Button>
          )}
        </div>
      ) : null}

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
          <table className="w-full text-sm border-collapse table-fixed" style={{ minWidth: 1250 }}>
            <thead>
              <tr>
                <th className="sticky left-0 text-left font-medium py-2 px-2 w-[110px] z-10 border border-zinc-300 bg-background">
                  <SortButton
                    label="Подразделение"
                    sort={departmentSort}
                    onToggle={() => setDepartmentSort((s) => toggleSort(s))}
                  />
                </th>
                <th className="text-left font-medium py-2 px-2 w-[60px] border border-zinc-300 bg-background">
                  <SortButton
                    label="Теги"
                    sort={tagSort}
                    onToggle={() => setTagSort((s) => toggleSort(s))}
                  />
                </th>
                <th className="text-left font-medium py-2 px-3 w-[240px] border border-zinc-300 bg-background">
                  <SortButton
                    label="Сотрудник"
                    sort={employeeSort}
                    onToggle={() => setEmployeeSort((s) => toggleSort(s))}
                  />
                </th>
                {MONTHS.map((m, i) => {
                  const monthNum = i + 1
                  const isActive = activeMonth === monthNum
                  const isFiltered = activeMonthFilter === monthNum
                  return (
                    <th
                      key={i}
                      onClick={() => handleMonthHeaderClick(monthNum)}
                      className={`text-center font-medium py-2 px-1 w-[70px] border border-zinc-300 transition-colors cursor-pointer select-none ${
                        isFiltered
                          ? "bg-blue-200 text-blue-900"
                          : isActive
                          ? "bg-blue-100"
                          : "bg-background hover:bg-muted"
                      }`}
                      title={`Нажмите, чтобы показать только сотрудников с днями в ${m}`}
                    >
                      {m.substring(0, 3)}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group) => (
                <Fragment key={group.key}>
                  {group.label && (
                    <tr className="bg-muted/50">
                      <td
                        colSpan={3 + MONTHS.length}
                        className="py-1.5 px-3 text-xs font-semibold text-muted-foreground border border-zinc-300 sticky left-0"
                      >
                        {group.label}
                      </td>
                    </tr>
                  )}
                  {group.rows.map((row) => {
                    const isHovered = hoveredRow === row.employee_id
                    return (
                      <tr
                        key={row.employee_id}
                        className={`${isHovered ? "!bg-zinc-100" : ""}`}
                        onMouseEnter={() => setHoveredRow(row.employee_id)}
                        onMouseLeave={() => setHoveredRow(null)}
                      >
                        <td
                          className={`sticky left-0 h-8 py-1.5 px-2 text-muted-foreground text-xs border border-zinc-300 whitespace-nowrap overflow-hidden text-ellipsis ${
                            isHovered ? "!bg-zinc-100" : "bg-background"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {row.department_icon
                              ? renderIcon(row.department_icon, "h-3.5 w-3.5 flex-shrink-0", { color: row.department_color || "#64748b" })
                              : row.department_color && (
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: row.department_color }}
                                  />
                                )}
                            <span className="truncate">{row.department_name}</span>
                          </div>
                        </td>
                        <td className="h-8 py-1.5 px-2 border border-zinc-300 align-middle">
                          <div className="flex flex-wrap gap-1 items-center h-full">
                            {row.tags.map((t) => (
                              <span
                                key={t.id}
                                className="inline-block h-5 w-5 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: t.color || "#94a3b8",
                                }}
                                title={t.name}
                              />
                            ))}
                          </div>
                        </td>
                        <td className="h-8 py-1.5 px-3 font-medium border border-zinc-300 whitespace-nowrap overflow-hidden text-ellipsis">
                          {row.employee_name}
                        </td>
                        {MONTHS.map((_, monthIdx) => {
                          const monthNum = monthIdx + 1
                          const value = row.months[monthNum] ?? null
                          const isEditing =
                            editingCell?.employeeId === row.employee_id &&
                            editingCell?.month === monthNum
                          return (
                            <td
                              key={monthNum}
                              className={`p-0 h-8 border border-zinc-300 ${
                                isEditing
                                  ? "outline outline-2 outline-blue-600 outline-offset-[-2px] z-10 relative"
                                  : ""
                              }`}
                              onMouseEnter={() => setHoveredMonth(monthNum)}
                              onMouseLeave={() => setHoveredMonth(null)}
                            >
                              {isEditing ? (
                                <Input
                                  data-testid={`vacation-cell-input-${row.employee_id}-${monthNum}`}
                                  value={editingValue}
                                  onChange={(e) =>
                                    setEditingValue(e.target.value)
                                  }
                                  onKeyDown={handleCellKeyDown}
                                  onBlur={() => {
                                    setHoveredMonth(null)
                                    handleCellSave()
                                  }}
                                  className="!bg-transparent !px-0 !py-0 !border-0 focus-visible:!ring-0 focus-visible:!ring-offset-0 h-full w-full text-[14px] text-center overflow-hidden truncate rounded-none"
                                  autoFocus
                                  placeholder="—"
                                />
                              ) : (
                                <button
                                  onClick={() =>
                                    handleCellClick(
                                      row.employee_id,
                                      monthNum,
                                      value
                                    )
                                  }
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
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
