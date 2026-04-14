import React, { useState, useRef, useEffect } from "react"
import { ChevronDown, ChevronRight, Trash2, Calendar, Check, X, ScrollText } from "lucide-react"
import { useNavigate } from "react-router-dom"
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
  useCreateVacation,
  useDeleteVacation,
  useCancelVacation,
  useVacationEmployeesSummary,
  useEmployeeVacationHistory,
} from "@/entities/vacation"
import { useVacationPeriods, useClosePeriod, usePartialClosePeriod } from "@/entities/vacation-period"
import { useSearchEmployees, useEmployees, useUpdateEmployee } from "@/entities/employee/useEmployees"
import { useRecentOrders } from "@/entities/order/useOrders"
import { computeNextOrderNumber } from "@/entities/order/computeNextOrderNumber"
import { GlobalAuditLog } from "@/features/global-audit-log"
import type { Employee } from "@/entities/employee/types"

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

// Expandable history row
interface EmployeeHistoryRowProps {
  employeeId: number
  partialClosePeriodId: number | null
  setPartialClosePeriodId: (id: number | null) => void
  partialCloseRemaining: string
  setPartialCloseRemaining: (value: string) => void
  handlePartialClosePeriod: () => void
  closePeriodMutation: any
  setSuccessMessage: (msg: string | null) => void
}

function EmployeeHistoryRow({ 
  employeeId,
  partialClosePeriodId,
  setPartialClosePeriodId,
  partialCloseRemaining,
  setPartialCloseRemaining,
  handlePartialClosePeriod,
  closePeriodMutation,
  setSuccessMessage
}: EmployeeHistoryRowProps) {
  const { data: history, isLoading } = useEmployeeVacationHistory(employeeId)
  const { data: periods } = useVacationPeriods(employeeId)
  const deleteVacationMutation = useDeleteVacation()
  const cancelVacationMutation = useCancelVacation()

  const [cancelId, setCancelId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [showClosedPeriods, setShowClosedPeriods] = useState(false)

  const handleCancelConfirm = () => {
    if (cancelId) cancelVacationMutation.mutate(cancelId)
    setCancelId(null)
  }

  const handleDeleteConfirm = () => {
    if (deleteId) deleteVacationMutation.mutate(deleteId)
    setDeleteId(null)
  }

  if (isLoading) return <div className="px-4 py-3"><Skeleton className="h-20 w-full" /></div>
  if (!history || !periods) return <div className="px-4 py-3 text-sm text-muted-foreground">Нет данных</div>

  const allVacations = history.years.flatMap((yg) => yg.vacations)
  
  // Разделяем периоды на открытые и закрытые
  const openPeriods = periods.filter(p => p.remaining_days > 0)
  const closedPeriods = periods.filter(p => p.remaining_days === 0)
  const displayedPeriods = showClosedPeriods ? periods : openPeriods

  return (
    <>
    <div className="px-4 py-3 space-y-2 bg-muted/20">
      {/* Кнопка показа закрытых периодов - слева под ФИО */}
      {closedPeriods.length > 0 && (
        <div className="flex justify-start mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowClosedPeriods(!showClosedPeriods)}
          >
            {showClosedPeriods ? (
              <>Скрыть закрытые периоды ({closedPeriods.length})</>
            ) : (
              <>Показать закрытые периоды ({closedPeriods.length})</>
            )}
          </Button>
        </div>
      )}
      
      {displayedPeriods.map((p) => {
        const periodVacations = allVacations.filter((v) =>
          v.start_date >= p.period_start && v.start_date <= p.period_end
        )
        const isClosed = p.remaining_days === 0
        const isEnded = new Date(p.period_end) < new Date() // Период уже закончился
        
        return (
          <div key={p.period_id} className={`flex gap-3 border border-muted/30 rounded overflow-hidden ${isClosed ? 'opacity-60' : ''}`}>
            {/* Левая часть — период */}
            <div className="w-1/2 min-w-[280px] bg-card p-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 text-xs">
                  <span className="font-semibold bg-muted px-1.5 py-0.5 rounded text-[10px]">{p.year_number}-й г.</span>
                  <span className="text-muted-foreground">{formatDate(p.period_start)} — {formatDate(p.period_end)}</span>
                  {isClosed && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">Закрыт</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {p.main_days}+{p.additional_days}
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span className="font-medium text-blue-600 tabular-nums">{p.used_days} исп.</span>
                  <span className="text-muted-foreground">|</span>
                  <span className={`font-semibold ${p.remaining_days < 0 ? "text-red-600" : p.remaining_days < 7 ? "text-amber-600" : "text-green-600"}`}>
                    {p.remaining_days}
                  </span>
                </div>
              </div>
              {/* Кнопки управления периодом - только для завершенных периодов */}
              {isEnded && (
                <>
                  {isClosed ? (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 whitespace-nowrap"
                        onClick={() => {
                          setPartialClosePeriodId(p.period_id)
                          setPartialCloseRemaining(String(p.total_days - p.used_days))
                        }}
                      >
                        Восстановить период
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 whitespace-nowrap"
                        onClick={() => {
                          closePeriodMutation.mutate(p.period_id, {
                            onSuccess: () => {
                              setSuccessMessage("Период полностью закрыт")
                              setTimeout(() => setSuccessMessage(null), 3000)
                            }
                          })
                        }}
                      >
                        Закрыть период
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2 whitespace-nowrap"
                        onClick={() => {
                          setPartialClosePeriodId(p.period_id)
                          setPartialCloseRemaining(String(p.remaining_days))
                        }}
                      >
                        Частично закрыть
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Правая часть — отпуска за период */}
            <div className="flex-1 bg-muted/30">
              {periodVacations.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground py-4">Нет отпусков</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-muted/40">
                      <th className="text-left px-2 py-1 font-medium">Тип</th>
                      <th className="text-left px-2 py-1 font-medium">Начало</th>
                      <th className="text-left px-2 py-1 font-medium">Конец</th>
                      <th className="text-left px-2 py-1 font-medium">Дней</th>
                      <th className="text-left px-2 py-1 font-medium">Приказ</th>
                      <th className="w-[44px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodVacations.map((v) => (
                      <tr key={v.id} className={`border-b border-muted/30 ${v.is_cancelled ? "opacity-40" : ""}`}>
                        <td className="px-2 py-1">
                          <Badge variant={v.vacation_type === "Трудовой" ? "default" : "secondary"} className={`text-[10px] px-1 py-0 ${v.is_cancelled ? "line-through" : ""}`}>
                            {v.vacation_type}
                          </Badge>
                        </td>
                        <td className="px-2 py-1">{formatDate(v.start_date)}</td>
                        <td className="px-2 py-1">{formatDate(v.end_date)}</td>
                        <td className="px-2 py-1">{v.days_count}</td>
                        <td className="px-2 py-1 text-muted-foreground text-[10px]">{v.order_number ? `№${v.order_number}` : "—"}</td>
                        <td className="px-1 py-1">
                          <div className="flex gap-0.5">
                            {!v.is_cancelled && (
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-amber-500 hover:text-amber-700" onClick={() => setCancelId(v.id)} title="Отменить">
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={() => setDeleteId(v.id)} title="Удалить">
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
          </div>
        )
      })}
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


    {/* Диалог частичного закрытия периода */}
    <AlertDialog open={partialClosePeriodId !== null} onOpenChange={(open) => !open && setPartialClosePeriodId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Частично закрыть период</AlertDialogTitle>
          <AlertDialogDescription>
            Укажите сколько дней должно остаться в периоде. Остальные дни будут списаны.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium">Остаток дней</label>
          <Input
            type="number"
            min="0"
            value={partialCloseRemaining}
            onChange={(e) => setPartialCloseRemaining(e.target.value)}
            placeholder="Введите количество дней"
            className="mt-2"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handlePartialClosePeriod}>
            Применить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

export function VacationsPage() {
  const navigate = useNavigate()
  // --- Form state ---
  const [collapsed, setCollapsed] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  
  // Period management state
  const [partialClosePeriodId, setPartialClosePeriodId] = useState<number | null>(null)
  const [partialCloseRemaining, setPartialCloseRemaining] = useState("")

  const searchRef = useRef<HTMLDivElement>(null)
  const vacationTypeRef = useRef<HTMLDivElement>(null)

  const { data: searchResult } = useSearchEmployees(searchQuery)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000 })
  const { data: recentOrders } = useRecentOrders(100, new Date().getFullYear())
  const computedNextNumber = computeNextOrderNumber(recentOrders || [], new Date().getFullYear())
  const createMutation = useCreateVacation()

  // Получаем остаток дней выбранного сотрудника из summary
  const { data: employeesSummary } = useVacationEmployeesSummary()
  const selectedEmployeeSummary = selectedEmployee
    ? employeesSummary?.find((e) => e.id === selectedEmployee.id)
    : null

  useEffect(() => {
    if (computedNextNumber && !orderNumber) setOrderNumber(computedNextNumber)
    if (!orderDate) setOrderDate(new Date().toISOString().split("T")[0])
  }, [computedNextNumber])

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
    // Раскрываем выбранного сотрудника
    setExpandedRows(new Set([emp.id]))
  }

  const clearEmployee = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
    setErrors({})
    setExpandedRows(new Set())
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
    console.log("[VacationsPage] handleSubmit called")
    if (!validate()) {
      console.log("[VacationsPage] validation failed")
      return
    }
    
    const payload = {
      employee_id: selectedEmployee!.id,
      start_date: startDate,
      end_date: endDate,
      vacation_type: vacationType,
    }
    console.log("[VacationsPage] handleSubmit payload:", JSON.stringify(payload, null, 2))
    
    createMutation.mutate(
      payload,
      { 
        onSuccess: (data) => {
          console.log("[VacationsPage] mutation success:", data)
          setSuccessMessage("Отпуск успешно создан!")
          setTimeout(() => setSuccessMessage(null), 5000)
          resetForm()
        },
        onError: (error: any) => {
          console.error("[VacationsPage] mutation error:", error)
        }
      }
    )
  }

  // --- Vacation periods for selected employee ---
  const closePeriodMutation = useClosePeriod()
  const partialClosePeriodMutation = usePartialClosePeriod()

  const handlePartialClosePeriod = () => {
    if (partialClosePeriodId) {
      const remaining = parseInt(partialCloseRemaining, 10)
      if (!isNaN(remaining) && remaining >= 0) {
        partialClosePeriodMutation.mutate(
          { periodId: partialClosePeriodId, remainingDays: remaining },
          {
            onSuccess: () => {
              setSuccessMessage("Период частично закрыт")
              setTimeout(() => setSuccessMessage(null), 3000)
            }
          }
        )
      }
    }
    setPartialClosePeriodId(null)
    setPartialCloseRemaining("")
  }

  // --- Main table state ---
  const [searchName, setSearchName] = useState("")
  const debouncedSearch = useDebounce(searchName, 300)
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived" | "all">("active")
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [editingAddDays, setEditingAddDays] = useState<number | null>(null)
  const [editingAddDaysValue, setEditingAddDaysValue] = useState("")
  const updateAddDaysMutation = useUpdateEmployee()

  const { data: employees, isLoading: employeesLoading } = useVacationEmployeesSummary(
    debouncedSearch || undefined,
    archiveFilter
  )

  const toggleRow = (empId: number) => {
    // Переключаем только для выбранного сотрудника - все остальные схлопываем
    setExpandedRows((prev) => {
      const next = new Set<number>()
      if (!prev.has(empId)) {
        next.add(empId)
      }
      return next
    })
  }

  const filteredEmployees = employees?.filter((emp) => {
    // Если выбран сотрудник - показываем только его
    if (selectedEmployee) {
      return emp.id === selectedEmployee.id
    }
    // Иначе фильтруем по поиску
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      emp.name.toLowerCase().includes(q) ||
      (emp.tab_number && String(emp.tab_number).toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-4">
      {/* Success Alert */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-green-600 hover:text-green-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Отпуска</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAuditLogOpen(true)}>
            <ScrollText className="mr-2 h-4 w-4" />
            Журнал
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/vacation-calendar")}>
            <Calendar className="mr-2 h-4 w-4" />
            Календарь
          </Button>
        </div>
      </div>

{/* --- Vacation periods block removed --- */}
      {/* removed: periods now shown in employee table */}

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

            <div className="flex flex-col gap-2 mt-4">
              <div className="flex gap-2">
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
              {createMutation.isError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Ошибка: {(createMutation.error as any)?.response?.data?.detail || (createMutation.error as any)?.message || "Неизвестная ошибка"}
                </div>
              )}
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
        <EmptyState message="Нет сотрудников" description="Нет сотрудников, соответствующих фильтру" />
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
                <th className="text-left px-4 py-2 font-medium">Доп. дни</th>
                <th className="text-left px-4 py-2 font-medium">Начало контракта</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => {
                const isExpanded = expandedRows.has(emp.id)

                return (
                  <React.Fragment key={emp.id}>
                    <tr
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
                        {editingAddDays === emp.id ? (
                          <div className="w-16 h-8 rounded-md border border-input overflow-hidden">
                            <Input
                              autoFocus
                              value={editingAddDaysValue}
                              onChange={(e) => setEditingAddDaysValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  const num = parseInt(editingAddDaysValue, 10)
                                  if (!isNaN(num) && num >= 0) {
                                    updateAddDaysMutation.mutate({ employeeId: emp.id, data: { additional_vacation_days: num } })
                                  }
                                  setEditingAddDays(null)
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault()
                                  setEditingAddDays(null)
                                }
                              }}
                              onBlur={(e) => {
                                // Не закрываем если это вызвано фокусом на кнопках ✓/✗
                                if (!e.relatedTarget || !e.relatedTarget.closest('button')) {
                                  const num = parseInt(editingAddDaysValue, 10)
                                  if (!isNaN(num) && num >= 0) {
                                    updateAddDaysMutation.mutate({ employeeId: emp.id, data: { additional_vacation_days: num } })
                                  }
                                  setEditingAddDays(null)
                                }
                              }}
                              className="h-full w-full border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-center text-sm"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingAddDays(emp.id); setEditingAddDaysValue(String(emp.additional_vacation_days ?? 0)) }}
                            className="w-16 h-8 rounded-md border border-transparent hover:border-input text-sm font-semibold text-center hover:bg-muted/50 transition-colors"
                          >
                            {emp.additional_vacation_days ?? 0}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {formatDate(emp.contract_start)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${emp.id}-history`}>
                        <td colSpan={8} className="p-0">
                          <EmployeeHistoryRow 
                            employeeId={emp.id}
                            partialClosePeriodId={partialClosePeriodId}
                            setPartialClosePeriodId={setPartialClosePeriodId}
                            partialCloseRemaining={partialCloseRemaining}
                            setPartialCloseRemaining={setPartialCloseRemaining}
                            handlePartialClosePeriod={handlePartialClosePeriod}
                            closePeriodMutation={closePeriodMutation}
                            setSuccessMessage={setSuccessMessage}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <GlobalAuditLog open={auditLogOpen} onOpenChange={setAuditLogOpen} initialActionFilter="vacation" />
    </div>
  )
}
