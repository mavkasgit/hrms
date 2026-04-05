import { useState, useRef, useEffect, useCallback } from "react"
import { ChevronDown, ChevronRight, Edit2, X, Check, Trash2, Eye, Download } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  useVacations,
  useCreateVacation,
  useDeleteVacation,
  useCancelVacation,
  useVacationEmployeesSummary,
  useEmployeeVacationHistory,
  useUpdateCorrection,
} from "@/entities/vacation"
import { useSearchEmployees, useEmployees } from "@/entities/employee/useEmployees"
import { useNextOrderNumber } from "@/entities/order/useOrders"
import type { Employee } from "@/entities/employee/types"
import type { EmployeeVacationSummary } from "@/entities/vacation/types"

const VACATION_TYPES = ["Трудовой", "За свой счет"]

// Convert ISO date (YYYY-MM-DD) to DD.MM.YYYY
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const parts = dateStr.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Inline correction editor
function CorrectionEditor({
  employee,
  initialValue,
  onSave,
  onCancel,
}: {
  employee: EmployeeVacationSummary
  initialValue: number | null
  onSave: (correction: number) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(initialValue === null ? "" : String(initialValue))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSave = () => {
    const num = val === "" ? 0 : parseInt(val, 10)
    if (!isNaN(num)) onSave(num)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave()
    if (e.key === "Escape") onCancel()
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 w-20 text-xs px-1"
        placeholder="0"
      />
      <button onClick={handleSave} className="text-green-600 hover:text-green-800">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={onCancel} className="text-red-500 hover:text-red-700">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// Expandable history row
function EmployeeHistoryRow({ employeeId }: { employeeId: number }) {
  const { data: history, isLoading } = useEmployeeVacationHistory(employeeId)
  const deleteVacationMutation = useDeleteVacation()
  const cancelVacationMutation = useCancelVacation()

  const [cancelId, setCancelId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const handleCancelConfirm = () => {
    if (cancelId) cancelVacationMutation.mutate(cancelId)
    setCancelId(null)
  }

  const handleDeleteConfirm = () => {
    if (deleteId) deleteVacationMutation.mutate(deleteId)
    setDeleteId(null)
  }

  if (isLoading) return <div className="px-4 py-3"><Skeleton className="h-20 w-full" /></div>
  if (!history) return <div className="px-4 py-3 text-sm text-muted-foreground">Нет данных</div>

  return (
    <>
    <div className="px-4 py-3 space-y-4 bg-muted/20">
      {history.years.map((yg) => (
        <div key={yg.year} className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>{yg.year}</span>
            <span className="text-muted-foreground font-normal text-xs">
              использовано {yg.used_days} из {yg.available_days} дней
            </span>
          </div>
          {yg.vacations.length === 0 ? (
            <div className="text-xs text-muted-foreground pl-4">Нет отпусков</div>
          ) : (
            <table className="w-full text-xs ml-4">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium pr-2">Тип</th>
                  <th className="text-left font-medium pr-2">Начало</th>
                  <th className="text-left font-medium pr-2">Конец</th>
                  <th className="text-left font-medium pr-2">Дней</th>
                  <th className="text-left font-medium pr-2">Приказ</th>
                  <th className="text-left font-medium pr-2">Коммент</th>
                  <th className="w-[60px]"></th>
                </tr>
              </thead>
              <tbody>
                {yg.vacations.map((v) => (
                  <tr key={v.id} className="border-t border-muted/30">
                    <td className="py-1 pr-2">
                      <Badge variant={v.vacation_type === "Трудовой" ? "default" : "secondary"} className="text-[10px] px-1 py-0">
                        {v.vacation_type}
                      </Badge>
                    </td>
                    <td className="py-1 pr-2">{formatDate(v.start_date)}</td>
                    <td className="py-1 pr-2">{formatDate(v.end_date)}</td>
                    <td className="py-1 pr-2">{v.days_count}</td>
                    <td className="py-1 pr-2">
                      {v.order_id ? (
                        <div className="flex gap-0.5 items-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${v.order_id}/preview`, "_blank")}
                            title="Просмотр"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${v.order_id}/download`, "_blank")}
                            title="Скачать"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <span className="text-[10px] text-muted-foreground ml-0.5">№{v.order_number}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground truncate max-w-[150px]">{v.comment || "—"}</td>
                    <td className="py-1">
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-amber-500 hover:text-amber-700"
                          onClick={() => setCancelId(v.id)}
                          title="Отменить"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-red-400 hover:text-red-600"
                          onClick={() => setDeleteId(v.id)}
                          title="Удалить"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>

    <AlertDialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить отпуск?</AlertDialogTitle>
          <AlertDialogDescription>
            Дни будут возвращены в остаток. Связанный приказ также будет отменён.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleCancelConfirm} className="bg-amber-600 hover:bg-amber-700">
            Отменить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить отпуск безвозвратно?</AlertDialogTitle>
          <AlertDialogDescription>
            Отпуск, приказ и файл приказа будут удалены безвозвратно. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
            Удалить навсегда
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

export function VacationsPage() {
  // --- Form state ---
  const [collapsed, setCollapsed] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Employee[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [vacationType, setVacationType] = useState("")
  const [vacationTypeSearch, setVacationTypeSearch] = useState("")
  const [vacationTypeOpen, setVacationTypeOpen] = useState(false)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [orderDate, setOrderDate] = useState("")
  const [orderNumber, setOrderNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const searchRef = useRef<HTMLDivElement>(null)
  const vacationTypeRef = useRef<HTMLDivElement>(null)

  const { data: searchResult } = useSearchEmployees(searchQuery)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000 })
  const { data: nextNumber } = useNextOrderNumber(new Date().getFullYear())
  const createMutation = useCreateVacation()
  const deleteMutation = useDeleteVacation()

  // Получаем остаток дней выбранного сотрудника из summary
  const { data: employeesSummary } = useVacationEmployeesSummary()
  const selectedEmployeeSummary = selectedEmployee
    ? employeesSummary?.find((e) => e.id === selectedEmployee.id)
    : null

  useEffect(() => {
    if (nextNumber && !orderNumber) setOrderNumber(nextNumber)
    if (!orderDate) setOrderDate(new Date().toISOString().split("T")[0])
  }, [nextNumber])

  useEffect(() => {
    if (searchResult?.items) setSearchResults(searchResult.items)
  }, [searchResult])

  useEffect(() => {
    if (searchOpen && !searchQuery && allEmployees?.items) setSearchResults(allEmployees.items)
  }, [searchOpen, searchQuery, allEmployees])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
        setSearchOpen(false)
      }
      if (vacationTypeRef.current && !vacationTypeRef.current.contains(e.target as Node)) {
        setVacationTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredTypes = VACATION_TYPES.filter((t) =>
    t.toLowerCase().includes(vacationTypeSearch.toLowerCase())
  )

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp)
    setSearchQuery("")
    setSearchResults([])
    setSearchOpen(false)
    setErrors({})
  }

  const clearEmployee = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
    setErrors({})
  }

  const selectVacationType = (t: string) => {
    setVacationType(t)
    setVacationTypeSearch("")
    setVacationTypeOpen(false)
    setErrors({})
  }

  const clearVacationType = () => {
    setVacationType("")
    setVacationTypeSearch("")
    setErrors({})
  }

  const handleVacationTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      const first = filteredTypes[0]
      if (first) selectVacationType(first)
    }
    if (e.key === "Enter" && filteredTypes.length > 0) {
      e.preventDefault()
      selectVacationType(filteredTypes[0])
    }
  }

  const resetForm = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
    setVacationType("")
    setVacationTypeSearch("")
    setStartDate("")
    setEndDate("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setErrors({})
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedEmployee) newErrors.employee = "Выберите сотрудника"
    if (!vacationType) newErrors.vacationType = "Выберите тип отпуска"
    if (!startDate) newErrors.startDate = "Укажите дату начала"
    if (!endDate) newErrors.endDate = "Укажите дату конца"
    if (startDate && endDate && endDate < startDate) newErrors.endDate = "Дата конца раньше даты начала"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const isPending = createMutation.isPending

  const handleSubmit = () => {
    if (!validate()) return
    createMutation.mutate(
      {
        employee_id: selectedEmployee!.id,
        start_date: startDate,
        end_date: endDate,
        vacation_type: vacationType,
        order_date: orderDate || undefined,
      },
      { onSuccess: () => resetForm() }
    )
  }

  // --- Main table state ---
  const [searchName, setSearchName] = useState("")
  const debouncedSearch = useDebounce(searchName, 300)
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">("active")
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [editingCorrection, setEditingCorrection] = useState<number | null>(null)

  const { data: employees, isLoading: employeesLoading } = useVacationEmployeesSummary(
    debouncedSearch || undefined,
    archiveFilter
  )
  const correctionMutation = useUpdateCorrection()

  const toggleRow = (empId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(empId)) next.delete(empId)
      else next.add(empId)
      return next
    })
  }

  const filteredEmployees = employees?.filter((emp) => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      emp.name.toLowerCase().includes(q) ||
      (emp.tab_number && String(emp.tab_number).toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Отпуска</h1>
      </div>

      {/* --- Create vacation form --- */}
      <div className="border rounded-lg bg-card">
        <div
          className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold">Создать отпуск</h2>
        </div>

        {!collapsed && (
          <div className="border-t px-4 py-4">
            <div className="grid gap-4">
              <div className="flex gap-4">
                <div className="w-[40%]" ref={searchRef}>
                  <label className="text-sm font-medium">Сотрудник *</label>
                  {selectedEmployee ? (
                    <div className="flex items-center gap-2 border rounded-md px-3 h-10 bg-muted/50">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm flex-1 truncate">
                        {selectedEmployee.name}
                        {selectedEmployee.tab_number && (
                          <span className="text-muted-foreground ml-1">(таб. {selectedEmployee.tab_number})</span>
                        )}
                      </span>
                      {selectedEmployeeSummary?.remaining_days !== null && selectedEmployeeSummary?.remaining_days !== undefined && (
                        <span className={`text-sm font-semibold shrink-0 ${
                          selectedEmployeeSummary.remaining_days < 0
                            ? "text-red-600"
                            : selectedEmployeeSummary.remaining_days < 7
                            ? "text-amber-600"
                            : "text-green-600"
                        }`}>
                          {selectedEmployeeSummary.remaining_days} дн.
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={clearEmployee}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Поиск по ФИО..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => {
                          setSearchOpen(true)
                          if (!searchQuery && allEmployees?.items) setSearchResults(allEmployees.items)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && searchResults.length > 0) {
                            e.preventDefault()
                            selectEmployee(searchResults[0])
                          }
                        }}
                        className={errors.employee ? "border-red-500" : ""}
                      />
                      {searchResults.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                          {searchResults.map((emp) => {
                            const summary = employeesSummary?.find((e) => e.id === emp.id)
                            const remaining = summary?.remaining_days
                            return (
                              <button
                                key={emp.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0 flex items-center justify-between"
                                onClick={() => selectEmployee(emp)}
                              >
                                <div className="truncate">
                                  <span className="font-medium">{emp.name}</span>
                                  {emp.tab_number && (
                                    <span className="text-muted-foreground ml-2">таб. {emp.tab_number}</span>
                                  )}
                                </div>
                                {remaining !== null && remaining !== undefined && (
                                  <span className={`font-semibold ml-2 shrink-0 text-xs ${
                                    remaining < 0 ? "text-red-600" : remaining < 7 ? "text-amber-600" : "text-green-600"
                                  }`}>
                                    {remaining} дн.
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {errors.employee && <p className="text-xs text-red-500 mt-1">{errors.employee}</p>}
                </div>

                <div className="w-[17%] relative" ref={vacationTypeRef}>
                  <label className="text-sm font-medium">Тип отпуска *</label>
                  {vacationType ? (
                    <div className="flex items-center gap-2 border rounded-md px-3 h-10 bg-muted/50">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm flex-1 truncate">{vacationType}</span>
                      <button
                        type="button"
                        onClick={clearVacationType}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Input
                          placeholder="Выберите тип..."
                          value={vacationTypeSearch}
                          onChange={(e) => {
                            setVacationTypeSearch(e.target.value)
                            setVacationTypeOpen(true)
                          }}
                          onKeyDown={handleVacationTypeKeyDown}
                          onFocus={() => setVacationTypeOpen(true)}
                          className={errors.vacationType ? "border-red-500" : ""}
                        />
                        {vacationTypeOpen && filteredTypes.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                            {filteredTypes.map((t) => (
                              <button
                                key={t}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                                onClick={() => selectVacationType(t)}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {errors.vacationType && <p className="text-xs text-red-500 mt-1">{errors.vacationType}</p>}
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-[130px]">
                  <DatePicker label="Дата начала *" value={startDate} onChange={setStartDate} />
                  {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
                </div>
                <div className="w-[130px]">
                  <DatePicker label="Дата конца *" value={endDate} onChange={setEndDate} />
                  {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
                </div>
                <div className="w-[130px]">
                  <DatePicker label="Дата приказа" value={orderDate} onChange={setOrderDate} />
                </div>
                <div className="w-[105px]">
                  <label className="text-sm font-medium">Номер приказа</label>
                  <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Авто" />
                </div>
                {startDate && endDate && (
                  <div className="w-[130px]">
                    <label className="text-sm font-medium">Дней отпуска</label>
                    <Input
                      value={String(
                        Math.round(
                          (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
                        ) + 1
                      )}
                      readOnly
                      className="h-10 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  resetForm()
                }}
                disabled={isPending}
              >
                Очистить
              </Button>
              <Button
                onClick={(e) => {
                  e.stopPropagation()
                  handleSubmit()
                }}
                disabled={isPending}
              >
                {isPending ? "Создание..." : "Создать"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* --- Main employees table --- */}
      <div className="flex gap-3 items-center">
        <Input
          placeholder="Поиск по ФИО или таб.№..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="w-64 h-9 text-sm"
        />
        <div className="flex gap-1">
          {(["active", "archived", "all"] as const).map((f) => (
            <Button
              key={f}
              variant={archiveFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setArchiveFilter(f)}
              className="text-xs"
            >
              {f === "active" ? "Активные" : f === "archived" ? "В архиве" : "Все"}
            </Button>
          ))}
        </div>
      </div>

      {employeesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !filteredEmployees?.length ? (
        <EmptyState title="Нет сотрудников" description="Нет сотрудников, соответствующих фильтру" />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-[30px] px-2 py-2"></th>
                <th className="text-left px-4 py-2 font-medium">Таб.№</th>
                <th className="text-left px-4 py-2 font-medium">ФИО</th>
                <th className="text-left px-4 py-2 font-medium">Подразделение</th>
                <th className="text-left px-4 py-2 font-medium">Должность</th>
                <th className="text-left px-4 py-2 font-medium">Остаток дней</th>
                <th className="text-left px-4 py-2 font-medium">Поправка</th>
                <th className="text-left px-4 py-2 font-medium">Начало контракта</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const isExpanded = expandedRows.has(emp.id)
                const isEditing = editingCorrection === emp.id

                return (
                  <>
                    <tr
                      key={emp.id}
                      className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => toggleRow(emp.id)}
                    >
                      <td className="px-2 py-2 text-center">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 mx-auto" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mx-auto" />
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{emp.tab_number ?? "—"}</td>
                      <td className="px-4 py-2 font-medium">{emp.name}</td>
                      <td className="px-4 py-2">{emp.department}</td>
                      <td className="px-4 py-2">{emp.position}</td>
                      <td className="px-4 py-2">
                        {emp.remaining_days !== null ? (
                          <span
                            className={
                              emp.remaining_days < 0
                                ? "text-red-600 font-semibold"
                                : emp.remaining_days < 7
                                ? "text-amber-600 font-semibold"
                                : "text-green-600 font-semibold"
                            }
                          >
                            {emp.remaining_days}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <CorrectionEditor
                            employee={emp}
                            initialValue={emp.vacation_days_correction}
                            onSave={(correction) => {
                              correctionMutation.mutate({ employeeId: emp.id, correction })
                              setEditingCorrection(null)
                            }}
                            onCancel={() => setEditingCorrection(null)}
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              {emp.vacation_days_correction ?? 0}
                            </span>
                            <button
                              onClick={() => setEditingCorrection(emp.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDate(emp.contract_start)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${emp.id}-history`}>
                        <td colSpan={8} className="p-0">
                          <EmployeeHistoryRow employeeId={emp.id} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
