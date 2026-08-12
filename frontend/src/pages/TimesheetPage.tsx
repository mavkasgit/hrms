import { useState, useMemo } from "react"
import {
  ChevronDown,
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
  Wand2,
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
import { useTimesheetGrid, useTimesheetImports, useRollbackImport, useTurnstileAutofill } from "@/entities/timesheet"
import type { TimesheetEmployeeRow } from "@/entities/timesheet"
import { TimesheetImportModal } from "@/features/timesheet-import"
import { TimesheetFiltersMenu, TimesheetTemplateButtons, useTimesheetFilters } from "@/features/timesheet-filters"
import { TimesheetGrid, formatHours } from "@/features/timesheet-grid"
import type { TimesheetViewMode, TimesheetSortField } from "@/features/timesheet-grid"
import type { SortConfig } from "@/shared/hooks/useTableQueryEngine"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
import { useNavigate } from "react-router-dom"

type SortField = TimesheetSortField
type FilterField = "department" | "tags"

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

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
  const [viewMode, setViewMode] = useState<TimesheetViewMode>("merged")
  const [importOpen, setImportOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [onlyDivergences, setOnlyDivergences] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
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
  const autofillMutation = useTurnstileAutofill()
  const { addToast } = useToast()

  const templateState = useTimesheetFilters()

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

    // Фильтр «только расхождения»: сотрудники, у которых есть хотя бы одна ячейка,
    // где ручное значение отличается от авто
    if (onlyDivergences) {
      rows = rows.filter((r) =>
        Object.values(r.cells ?? {}).some(
          (c) =>
            c.manual?.shift_type_code &&
            c.auto?.shift_type_code &&
            c.manual.shift_type_code !== c.auto.shift_type_code
        )
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
  }, [enrichedEmployees, search, sortConfigs, columnFilters, onlyDivergences])

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
      // Часы считаются по итоговому слою (result) — сервис отдаёт result_hours
      totalHours: data.reduce((sum, e) => sum + (e.result_hours ?? 0), 0),
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

  // Заполнение ручного слоя из факта турникета (#16): сначала превью
  // «будет изменено N ячеек», после подтверждения — применение.
  const handleTurnstileAutofill = async () => {
    const preview = await autofillMutation.mutateAsync({
      period_start: periodStart,
      period_end: periodEnd,
      dry_run: true,
    })
    if (preview.applied === 0) {
      addToast({
        title: "Заполнять нечего",
        description: "Нет дней с проходом турникета без ручного значения за выбранный период.",
        variant: "default",
      })
      return
    }
    const ok = confirm(
      `Заполнить ручной слой по турникету за период?\nБудет изменено ячеек: ${preview.applied}. ` +
        `Пропущено (нет прохода): ${preview.skipped_no_pass}. ` +
        `Не тронуто (уже заполнено руками): ${preview.skipped_manual}.`
    )
    if (!ok) return
    try {
      const result = await autofillMutation.mutateAsync({
        period_start: periodStart,
        period_end: periodEnd,
        dry_run: false,
      })
      addToast({
        title: `Заполнено по турникету: ${result.applied} ячеек`,
        description: `Без прохода: ${result.skipped_no_pass}, уже заполнено руками: ${result.skipped_manual}.`,
        variant: "success",
      })
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
    setOnlyDivergences(false)
    setSortConfigs([])
    setColumnFilters({ department: new Set(), tags: new Set() })
  }

  const activeFiltersCount =
    columnFilters.department.size +
    columnFilters.tags.size +
    (search.trim() ? 1 : 0) +
    (onlyDivergences ? 1 : 0)

  const employeeSortDirection = sortConfigs.find((s) => s.field === "employee")?.order ?? null

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] min-h-0 overflow-hidden space-y-4">
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
          <Button
            variant="outline"
            onClick={handleTurnstileAutofill}
            data-testid="timesheet-autofill-button"
            title="Перенести факт из турникета в ручной слой за период"
          >
            <Wand2 className="h-4 w-4 mr-1" /> Заполнить по турникету
          </Button>
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
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as TimesheetViewMode)}>
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
        {/* Переключатель «только расхождения» (ручное ≠ авто) */}
        <Button
          variant={onlyDivergences ? "default" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setOnlyDivergences((v) => !v)}
          data-testid="divergence-filter-toggle"
          title="Показать только сотрудников с расхождениями ручного и авто значений"
        >
          Расхождения
        </Button>
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
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
          title={legendOpen ? "Свернуть легенду" : "Развернуть легенду"}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${legendOpen ? "rotate-180" : ""}`}
          />
          Легенда
        </button>
      </div>

      {legendOpen && (
        <div className="text-xs text-muted-foreground space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-3.5 bg-amber-100 border border-amber-300 rounded" /> Расхождение плана и факта
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-3.5 border-2 border-orange-500 rounded" /> Расхождение ручного и авто
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-3.5 rounded-full bg-violet-500 animate-pulse" /> Приказ изменился
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
      )}

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
        <div className="flex-1 min-h-0">
          <TimesheetGrid
            employees={filteredEmployees}
            gridData={gridQuery.data}
            periodStart={periodStart}
            periodEnd={periodEnd}
            viewMode={viewMode}
            year={year}
            month={month}
            sortField="employee"
            sortDirection={employeeSortDirection}
            onToggleSort={handleSortChange}
          />
        </div>
      )}

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
