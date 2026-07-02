import { useState, useMemo } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  FileSpreadsheet,
  History,
  Search,
  X,
  Filter,
  ArrowLeft,
  Calendar,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import type { InlineMultiSelectOption } from "@/shared/ui/inline-multi-select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/use-toast"
import { useTimesheetGrid, useTimesheetImports, useRollbackImport } from "@/entities/timesheet"
import type { TimesheetPlanCell, TimesheetFactCell, TimesheetEmployeeRow } from "@/entities/timesheet"
import { TimesheetImportModal } from "@/features/timesheet-import"
import { CellEditPopover } from "@/features/timesheet-cell-edit"
import { TimesheetFiltersMenu, TimesheetTemplateButtons, useTimesheetFilters } from "@/features/timesheet-filters"
import { getShiftTypeMeta } from "@/shared/config/shiftTypes"
import type { SortConfig } from "@/shared/hooks/useTableQueryEngine"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
import { useNavigate } from "react-router-dom"

type ViewMode = "plan" | "fact" | "merged"
type SortField = "department" | "tags" | "employee"
type FilterField = "department" | "tags"

const DOW_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

function formatHours(h: number | null | undefined) {
  if (h === null || h === undefined) return ""
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

const NON_WORKING_LABELS: Record<string, string> = {
  vacation: "О",
  sick: "Б",
  A: "А",
  absence: "П",
  D: "Д",
  VK: "ВК",
  VS: "ВС"
}

function cellStatus(
  planCell: TimesheetPlanCell | undefined,
  factCell: TimesheetFactCell | undefined,
  absences: any[],
  shiftTypeMap: Record<string, any>,
  dateStr: string
) {
  const activeAbsences = absences.filter(
    (a) => dateStr >= a.start_date && dateStr <= a.end_date
  )

  if (activeAbsences.length > 0) {
    const a = activeAbsences[0]
    let label = "Б"
    let tooltip = "Больничный"

    if (a.type === "vacation") {
      const isUnpaid = a.vacation_type === "Отпуск за свой счет"
      label = isUnpaid ? "А" : "О"
      tooltip = isUnpaid ? "Отпуск за свой счет" : "Отпуск"
    }

    const factHours = factCell ? (factCell.work_hours ?? factCell.presence_hours ?? 0) : 0
    if (factHours > 0) {
      return {
        label: formatHours(factHours),
        color: "bg-amber-100 ring-2 ring-amber-400 ring-inset",
        tooltip: `${tooltip} (по факту отработано ${formatHours(factHours)}ч)`
      }
    }
    return { label, color: "", stColor: "", isNight: false, tooltip }
  }

  const isPlanNight = !!(
    planCell?.shift_type_code &&
    shiftTypeMap[planCell.shift_type_code] &&
    (shiftTypeMap[planCell.shift_type_code].is_night || shiftTypeMap[planCell.shift_type_code].isNight)
  )
  const isFactNight = !!(factCell && factCell.night_hours && factCell.night_hours > 0)
  const isNight = isPlanNight || isFactNight

  let planHours = 0
  let planCode: string | null = null
  if (planCell) {
    if (planCell.shift_type_code) {
      planCode = planCell.shift_type_code
    }
    if (planCell.planned_hours_override !== null) {
      planHours = planCell.planned_hours_override
    } else if (planCode && shiftTypeMap[planCode]) {
      const st = shiftTypeMap[planCode]
      planHours = st.planned_hours ?? st.plannedHours ?? 0
    }
  }

  const hasFact = factCell !== undefined
  const factHours = factCell ? (factCell.work_hours ?? factCell.presence_hours ?? 0) : 0

  if (!hasFact) {
    let label = ""
    let stColor = ""

    if (planCode) {
      const st = shiftTypeMap[planCode]
      if (NON_WORKING_LABELS[planCode]) {
        label = NON_WORKING_LABELS[planCode]
      } else if (planHours > 0) {
        label = formatHours(planHours)
        if (st.is_working || st.isWorking) {
          stColor = st.color
        }
      }
    } else if (planHours > 0) {
      label = formatHours(planHours)
    }

    return {
      label,
      color: "",
      stColor,
      isNight,
      tooltip: `План: ${planHours}ч (нет факта)`
    }
  }

  const isPlanNonWorking = planCode && NON_WORKING_LABELS[planCode]

  if (isPlanNonWorking) {
    if (factHours === 0) {
      const st = shiftTypeMap[planCode!]
      return {
        label: NON_WORKING_LABELS[planCode!],
        color: "",
        stColor: "",
        isNight: false,
        tooltip: `План: ${st.name}, Факт: 0ч`
      }
    } else {
      return {
        label: formatHours(factHours),
        color: "bg-amber-100 ring-2 ring-amber-400 ring-inset",
        isNight: false,
        tooltip: `Расхождение: План ${planHours}ч (${shiftTypeMap[planCode!].name}), Факт ${factHours}ч`
      }
    }
  }

  if (planHours !== factHours) {
    return {
      label: formatHours(factHours),
      color: "bg-amber-100 ring-1 ring-amber-300 ring-inset",
      isNight,
      tooltip: `Расхождение: План ${planHours}ч, Факт ${factHours}ч`
    }
  }

  let stColor = ""
  if (planCode && shiftTypeMap[planCode]) {
    const st = shiftTypeMap[planCode]
    if (st.is_working || st.isWorking) {
      stColor = st.color
    }
  }
  if (!stColor && isNight && shiftTypeMap["night"]) {
    stColor = shiftTypeMap["night"].color
  }

  return {
    label: factHours > 0 ? formatHours(factHours) : "",
    color: "",
    stColor,
    isNight,
    tooltip: `План ${planHours}ч, Факт ${factHours}ч`
  }
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

export function TimesheetPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tempYear, setTempYear] = useState(today.getFullYear())
  const [viewMode, setViewMode] = useState<ViewMode>("merged")
  const [importOpen, setImportOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [sortConfigs, setSortConfigs] = useState<SortConfig<SortField>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<FilterField, Set<string>>>({
    department: new Set(),
    tags: new Set(),
  })

  const periodStart = useMemo(() => `${year}-${String(month).padStart(2, "0")}-01`, [year, month])
  const periodEnd = useMemo(() => {
    const d = getDaysInMonth(year, month)
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }, [year, month])

  const gridQuery = useTimesheetGrid(periodStart, periodEnd)
  const importsQuery = useTimesheetImports(1, 20, periodStart, periodEnd)
  const rollbackMutation = useRollbackImport()
  const { addToast } = useToast()

  const templateState = useTimesheetFilters()

  const shiftTypeMap = useMemo(() => {
    const map: Record<string, any> = {}
    for (const st of gridQuery.data?.shift_types ?? []) {
      const meta = getShiftTypeMeta(st.code)
      map[st.code] = {
        ...st,
        color: meta?.color ?? "#94a3b8",
        letter: meta?.letter,
      }
    }
    return map
  }, [gridQuery.data])

  const holidayByDate = useMemo(() => {
    const map: Record<string, any> = {}
    for (const h of gridQuery.data?.holidays ?? []) {
      map[h.date] = h
    }
    return map
  }, [gridQuery.data])

  const days = useMemo(() => {
    const result: {
      date: string
      day: number
      dow: number
      dowShort: string
      isWeekend: boolean
      isHoliday: boolean
      holidayName: string | null
    }[] = []
    const daysCount = getDaysInMonth(year, month)
    for (let d = 1; d <= daysCount; d++) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      const dt = new Date(year, month - 1, d)
      const dow = dt.getDay()
      const holiday = holidayByDate[date] || null
      const isHoliday = !!holiday
      result.push({
        date,
        day: d,
        dow,
        dowShort: DOW_SHORT[dow],
        isWeekend: dow === 0 || dow === 6,
        isHoliday,
        holidayName: holiday?.name ?? null,
      })
    }
    return result
  }, [year, month, holidayByDate])

  const monthName = new Date(year, month - 1, 1).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  })

  // Сотрудники приходят из grid с полными данными: department_name, position_name, tags
  const enrichedEmployees = useMemo(() => {
    return gridQuery.data?.employees ?? []
  }, [gridQuery.data])

  // Уникальные значения для фильтров
  const departmentOptions: InlineMultiSelectOption[] = useMemo(() => {
    const seen = new Map<string, InlineMultiSelectOption>()
    for (const r of enrichedEmployees) {
      const name = r.department_name
      if (!name) continue
      if (!seen.has(name)) {
        seen.set(name, { value: name, label: name })
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "ru"))
  }, [enrichedEmployees])

  const tagOptions: InlineMultiSelectOption[] = useMemo(() => {
    const seen = new Map<string, InlineMultiSelectOption>()
    for (const r of enrichedEmployees) {
      for (const t of r.tags) {
        if (!seen.has(t.name)) {
          seen.set(t.name, { value: t.name, label: t.name, color: t.color ?? undefined })
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, "ru"))
  }, [enrichedEmployees])

  const filteredEmployees = useMemo(() => {
    let rows = enrichedEmployees

    if (columnFilters.department.size > 0) {
      rows = rows.filter((r) => r.department_name && columnFilters.department.has(r.department_name))
    }
    if (columnFilters.tags.size > 0) {
      rows = rows.filter((r) =>
        r.tags.some((t: TimesheetEmployeeRow["tags"][number]) => columnFilters.tags.has(t.name))
      )
    }

    const q = search.toLowerCase().trim()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.position_name || "").toLowerCase().includes(q) ||
          (r.department_name || "").toLowerCase().includes(q)
      )
    }

    // Сортировка
    const sorted = [...rows].sort((a, b) => {
      for (const sc of sortConfigs) {
        let cmp = 0
        if (sc.field === "department") {
          cmp = (a.department_name || "").localeCompare(b.department_name || "", "ru")
        } else if (sc.field === "tags") {
          const aTag = a.tags[0]?.name || ""
          const bTag = b.tags[0]?.name || ""
          cmp = aTag.localeCompare(bTag, "ru")
        } else if (sc.field === "employee") {
          cmp = a.name.localeCompare(b.name, "ru")
        }
        if (cmp !== 0) return sc.order === "asc" ? cmp : -cmp
      }
      return a.name.localeCompare(b.name, "ru")
    })

    return sorted
  }, [enrichedEmployees, search, sortConfigs, columnFilters])

  const totals = useMemo(() => {
    const data = gridQuery.data?.employees ?? []
    return {
      employees: data.length,
      daysWithFact: data.reduce(
        (sum, e) => sum + Object.keys(e.fact).filter((d) => {
          const f = e.fact[d]
          return f && (f.work_hours || f.presence_hours)
        }).length,
        0
      ),
      totalHours: data.reduce(
        (sum, e) =>
          sum +
          Object.values(e.fact).reduce(
            (s, f) => s + (f.work_hours || f.presence_hours || 0),
            0
          ),
        0
      ),
    }
  }, [gridQuery.data])



  const handleRollback = async (importId: number) => {
    if (!confirm("Откатить этот импорт? Все связанные дневные записи будут удалены.")) return
    try {
      await rollbackMutation.mutateAsync(importId)
      addToast({ title: "Импорт откатан", variant: "success" })
    } catch (err: any) {
      addToast({ title: "Ошибка", description: err.message, variant: "destructive" })
    }
  }

  const handleSortChange = (field: SortField) => {
    setSortConfigs((prev) => {
      const existing = prev.find((s) => s.field === field)
      if (!existing) return [...prev, { field, order: "asc" as const }]
      if (existing.order === "asc")
        return prev.map((s) => (s.field === field ? { ...s, order: "desc" as const } : s))
      return prev.filter((s) => s.field !== field)
    })
  }

  const handleClearAllFilters = () => {
    setSearch("")
    setSortConfigs([])
    setColumnFilters({ department: new Set(), tags: new Set() })
  }

  const activeFiltersCount =
    columnFilters.department.size +
    columnFilters.tags.size +
    (search.trim() ? 1 : 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Табель учёта рабочего времени</h1>
            <p className="text-sm text-muted-foreground">
              Плановый график, факт из турникетов и сводный режим
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1" /> История импортов
          </Button>
          <Button onClick={() => setImportOpen(true)} data-testid="timesheet-import-button">
            <Upload className="h-4 w-4 mr-1" /> Импорт из турникетов
          </Button>
        </div>
      </div>

      <div className="flex items-start justify-start flex-wrap gap-3">
        <Popover open={pickerOpen} onOpenChange={(val) => {
          setPickerOpen(val)
          if (val) {
            setTempYear(year)
          }
        }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="flex items-center gap-2 px-3 py-1.5 h-9 font-medium cursor-pointer min-w-[190px] justify-between text-left"
            >
              <span className="flex items-center gap-2 capitalize">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{monthName}</span>
              </span>
              <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="flex items-center justify-between border-b pb-2 mb-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setTempYear(prev => prev - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-sm">{tempYear} год</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setTempYear(prev => prev + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS_SHORT.map((name, idx) => {
                const isSelected = year === tempYear && month === idx + 1
                return (
                  <Button
                    key={name}
                    type="button"
                    variant={isSelected ? "default" : "ghost"}
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      setYear(tempYear)
                      setMonth(idx + 1)
                      setPickerOpen(false)
                    }}
                  >
                    {name}
                  </Button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="plan">План</TabsTrigger>
            <TabsTrigger value="fact">Факт</TabsTrigger>
            <TabsTrigger value="merged">Совмещённый</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по ФИО…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
        <TimesheetFiltersMenu
          departmentOptions={departmentOptions}
          tagOptions={tagOptions}
          departments={columnFilters.department}
          tags={columnFilters.tags}
          onDepartmentsChange={(next) => setColumnFilters((prev) => ({ ...prev, department: next }))}
          onTagsChange={(next) => setColumnFilters((prev) => ({ ...prev, tags: next }))}
          onReset={handleClearAllFilters}
          onSaveTemplate={(name, deps, tagsArr) => {
            const created = templateState.saveFilter(name, deps, tagsArr)
            if (created) templateState.setActiveFilterId(created.id)
          }}
        />
        <TimesheetTemplateButtons
          filters={templateState.filters}
          isFilterActive={(filter) =>
            templateState.isFilterActive(filter, {
              departments: columnFilters.department,
              tags: columnFilters.tags,
            })
          }
          activeFilterId={templateState.activeFilterId}
          onApply={(filter) => {
            setColumnFilters({
              department: new Set(filter.departments),
              tags: new Set(filter.tags),
            })
            templateState.setActiveFilterId(filter.id)
          }}
          onClear={handleClearAllFilters}
          onDelete={templateState.deleteFilter}
          onSetActive={templateState.setActiveFilterId}
        />
        {activeFiltersCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleClearAllFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Сбросить ({activeFiltersCount})
          </Button>
        )}
      </div>

      <div className="flex gap-3 text-sm flex-wrap">
        <Badge variant="secondary">Сотрудников: {totals.employees}</Badge>
        <Badge variant="secondary">Показано: {filteredEmployees.length}</Badge>
        <Badge variant="secondary">Дней с фактом: {totals.daysWithFact}</Badge>
        <Badge variant="secondary">Всего часов: {formatHours(totals.totalHours)}</Badge>
      </div>

      {gridQuery.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : filteredEmployees.length === 0 ? (
        <EmptyState
          icon={Filter as any}
          title="Нет данных"
          description={
            enrichedEmployees.length === 0
              ? "Нет сотрудников за выбранный период. Загрузите файл из турникетов или создайте план вручную."
              : "Фильтры не дали результатов. Попробуйте сбросить фильтры."
          }
        />
      ) : (
        <div className="border rounded-lg overflow-x-auto bg-card">
          <table className="text-sm border-collapse" style={{ minWidth: 900 + days.length * 32 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background border px-2 py-1 text-left min-w-[240px]">
                  <button
                    type="button"
                    onClick={() => handleSortChange("employee")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>Сотрудник</span>
                    {(() => {
                      const active = sortConfigs.find((s) => s.field === "employee")
                      if (active?.order === "asc") return <ArrowUp className="h-3.5 w-3.5" />
                      if (active?.order === "desc") return <ArrowDown className="h-3.5 w-3.5" />
                      return <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />
                    })()}
                  </button>
                </th>
                {days.map((d) => {
                  const thClass = `border px-0 py-0 text-center min-w-[36px] ${
                    d.isHoliday
                      ? "bg-red-100 border-red-300"
                      : d.isWeekend
                      ? "bg-slate-100 border-slate-300"
                      : ""
                  }`
                  return (
                    <th key={d.date} className={thClass} title={d.holidayName || d.date}>
                      <div
                        className={`text-[10px] leading-tight ${
                          d.isHoliday ? "text-red-900" : "text-muted-foreground"
                        }`}
                      >
                        {d.dowShort}
                      </div>
                      <div
                        className={`text-xs font-medium leading-tight ${
                          d.isHoliday ? "text-red-900 font-bold" : ""
                        }`}
                      >
                        {d.day}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-card border px-2 py-1 text-sm whitespace-nowrap">
                    <span className="truncate">{emp.name}</span>
                  </td>
                  {days.map((d) => {
                    const plan = emp.plan[d.date]
                    const fact = emp.fact[d.date]
                    const status = cellStatus(plan, fact, emp.absences, shiftTypeMap, d.date)
                    const activeAbsence = emp.absences.find(
                      (a: any) => d.date >= a.start_date && d.date <= a.end_date
                    )

                    // Приоритет заливки ячейки: праздник > выходной > обычная.
                    // Фон и border на самой <td>, чтобы вся ячейка была окрашена
                    // и границы оставались видны. Внутри — кликабельный div.
                    const tdClass = d.isHoliday
                      ? "p-0 bg-red-100/80 border-red-300"
                      : d.isWeekend
                      ? "p-0 bg-slate-100 border-slate-300"
                      : "p-0"
                    const cellInnerClass =
                      "w-full h-full min-h-[28px] min-w-[36px] px-1 py-1 text-center text-xs cursor-pointer hover:ring-2 hover:ring-primary/60 hover:ring-inset flex items-center justify-center"

                    if (viewMode === "plan") {
                      const label = plan
                        ? plan.planned_hours_override !== null
                          ? String(plan.planned_hours_override)
                          : plan.shift_type_code && shiftTypeMap[plan.shift_type_code]
                          ? (shiftTypeMap[plan.shift_type_code].code?.[0] || "?")
                          : ""
                        : ""
                      const isShiftNight = plan?.shift_type_code &&
                        shiftTypeMap[plan.shift_type_code] &&
                        (shiftTypeMap[plan.shift_type_code].is_night || shiftTypeMap[plan.shift_type_code].isNight)
                      const stColor =
                        isShiftNight && plan?.shift_type_code && !d.isHoliday && !d.isWeekend
                          ? shiftTypeMap[plan.shift_type_code]?.color
                          : null
                      return (
                        <td
                          key={d.date}
                          className={`border ${tdClass}`}
                          title={
                            plan?.shift_type_code
                              ? `${d.date}${d.holidayName ? ` · ${d.holidayName}` : ""} · Смена: ${shiftTypeMap[plan.shift_type_code]?.name || ""}\n${plan.note || ""}`
                              : d.holidayName
                              ? `${d.date} · ${d.holidayName}`
                              : d.date
                          }
                        >
                          <CellEditPopover
                            employeeId={emp.id}
                            year={year}
                            month={month}
                            workDate={d.date}
                            currentShiftTypeCode={plan?.shift_type_code ?? null}
                            currentHours={plan?.planned_hours_override ?? null}
                            currentNote={plan?.note ?? null}
                            absence={activeAbsence}
                            onSaved={() => gridQuery.refetch()}
                          >
                            <div
                              className={`${cellInnerClass} ${d.isHoliday ? "text-red-900" : d.isWeekend ? "text-slate-700" : ""}`}
                              style={stColor ? { backgroundColor: `${stColor}30` } : undefined}
                            >
                              {label}
                            </div>
                          </CellEditPopover>
                        </td>
                      )
                    }

                    if (viewMode === "fact") {
                      const hours = fact?.work_hours || fact?.presence_hours
                      const isFactNight = !!(fact && fact.night_hours && fact.night_hours > 0)
                      const stColor = isFactNight && shiftTypeMap["night"] ? shiftTypeMap["night"].color : ""
                      const cellBgStyle = isFactNight && stColor
                        ? { backgroundColor: `${stColor}35` }
                        : undefined

                      return (
                        <td
                          key={d.date}
                          className={`border ${tdClass}`}
                          style={cellBgStyle}
                          title={fact ? `${d.date} · ${hours ?? 0}ч` : d.holidayName ? `${d.date} · ${d.holidayName}` : d.date}
                        >
                          <CellEditPopover
                            employeeId={emp.id}
                            year={year}
                            month={month}
                            workDate={d.date}
                            currentShiftTypeCode={plan?.shift_type_code ?? null}
                            currentHours={plan?.planned_hours_override ?? null}
                            currentNote={plan?.note ?? null}
                            absence={activeAbsence}
                            onSaved={() => gridQuery.refetch()}
                          >
                            <div
                              className={`${cellInnerClass} ${d.isHoliday ? "text-red-900" : d.isWeekend ? "text-slate-700" : ""}`}
                            >
                              {hours ? formatHours(hours) : ""}
                            </div>
                          </CellEditPopover>
                        </td>
                      )
                    }

                    const isNight = status.isNight
                    const cellBgStyle = isNight && status.stColor
                      ? { backgroundColor: `${status.stColor}35` }
                      : undefined

                    return (
                      <td
                        key={d.date}
                        className={`border ${tdClass} ${status.color}`}
                        style={cellBgStyle}
                        title={status.tooltip || d.holidayName || d.date}
                      >
                          <CellEditPopover
                            employeeId={emp.id}
                            year={year}
                            month={month}
                            workDate={d.date}
                            currentShiftTypeCode={plan?.shift_type_code ?? null}
                            currentHours={plan?.planned_hours_override ?? null}
                            currentNote={plan?.note ?? null}
                            absence={activeAbsence}
                            onSaved={() => gridQuery.refetch()}
                          >
                          <div
                            className={`${cellInnerClass} ${d.isHoliday ? "text-red-900" : d.isWeekend ? "text-slate-700" : ""}`}
                          >
                            {status.label}
                          </div>
                        </CellEditPopover>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs text-muted-foreground space-y-2 mt-4">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 bg-amber-100 border border-amber-300 rounded" /> Расхождение плана и факта
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 bg-slate-100 border border-slate-300 rounded" /> Выходной (Сб/Вс)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3.5 bg-red-100/80 border border-red-300 rounded" /> Праздничный день
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-2 border-t">
          <span className="text-muted-foreground font-medium mr-1">Нерабочие статусы:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 min-w-[18px] text-center text-[10px] font-bold border rounded bg-muted text-foreground">О</span> Отпуск
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 min-w-[18px] text-center text-[10px] font-bold border rounded bg-muted text-foreground">Б</span> Больничный
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 min-w-[18px] text-center text-[10px] font-bold border rounded bg-muted text-foreground">А</span> За свой счет
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 min-w-[18px] text-center text-[10px] font-bold border rounded bg-muted text-foreground">П</span> Прогул
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 min-w-[18px] text-center text-[10px] font-bold border rounded bg-muted text-foreground">Д</span> Донорские
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 min-w-[18px] text-center text-[10px] font-bold border rounded bg-muted text-foreground">ВК</span> Военкомат
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block px-1 min-w-[18px] text-center text-[10px] font-bold border rounded bg-muted text-foreground">ВС</span> Военные сборы
          </span>
        </div>
      </div>

      <TimesheetImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => gridQuery.refetch()}
      />


      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>История импортов</DialogTitle>
          </DialogHeader>
          {importsQuery.isLoading ? (
            <Skeleton className="h-32" />
          ) : (importsQuery.data?.items ?? []).length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">Нет импортов</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Файл</th>
                  <th className="text-left p-2">Период</th>
                  <th className="text-left p-2">Сопоставлено</th>
                  <th className="text-left p-2">Записей</th>
                  <th className="text-left p-2">Загружен</th>
                  <th className="text-left p-2">Статус</th>
                  <th className="text-left p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(importsQuery.data?.items ?? []).map((imp) => (
                  <tr key={imp.id} className="border-b">
                    <td className="p-2 text-xs">
                      <FileSpreadsheet className="h-3.5 w-3.5 inline mr-1" />
                      {imp.file_name}
                    </td>
                    <td className="p-2 text-xs">
                      {imp.period_start} – {imp.period_end}
                    </td>
                    <td className="p-2 text-xs">
                      {imp.employees_matched}/{imp.employees_total}
                    </td>
                    <td className="p-2 text-xs">{imp.entries_imported}</td>
                    <td className="p-2 text-xs">{new Date(imp.uploaded_at).toLocaleString("ru-RU")}</td>
                    <td className="p-2 text-xs">
                      {imp.status === "rolled_back" ? (
                        <Badge variant="outline">Откачен</Badge>
                      ) : (
                        <Badge variant="secondary">Активен</Badge>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {imp.status !== "rolled_back" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRollback(imp.id)}
                        >
                          Откатить
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
