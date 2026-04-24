import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, Download, Eye, Trash2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table"
import { useEmployees, useSearchEmployees } from "@/entities/employee/useEmployees"
import { useAllOrderTypes, useCancelOrder, useCreateOrder, useCreateOrderPreview, useDeleteOrder, useOrders } from "@/entities/order/useOrders"
import { OrderNumberField } from "@/features/OrderNumberField"
import { OrderPreviewDialog } from "@/features/order-preview/OrderPreviewDialog"
import type { Employee } from "@/entities/employee/types"
import type { OrderCreate } from "@/entities/order/types"
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

const UNPAID_LEAVE_CODE = "vacation_unpaid"

interface DateRange {
  start: string
  end: string
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const dateValue = dateStr.slice(0, 10)
  const parts = dateValue.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

function calcDays(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return ""
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return ""
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  return String(days)
}

function defaultPeriodStartIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-01-01`
}

function defaultPeriodEndIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-12-31`
}

function normalizeIsoDate(value: string): string {
  return value.slice(0, 10)
}

function parseUnpaidRange(extra: Record<string, unknown>): DateRange | null {
  const start = typeof extra.vacation_start === "string" ? normalizeIsoDate(extra.vacation_start) : ""
  const endRaw = typeof extra.vacation_end === "string" ? normalizeIsoDate(extra.vacation_end) : ""
  const end = endRaw || start
  if (!start && !end) return null
  if (!start) return { start: end, end }
  if (!end) return { start, end: start }
  return start <= end ? { start, end } : { start: end, end: start }
}

function intersectsPeriod(range: DateRange, periodStart: string, periodEnd: string): boolean {
  if (!periodStart && !periodEnd) return true
  if (periodStart && range.end < periodStart) return false
  if (periodEnd && range.start > periodEnd) return false
  return true
}

function overlapDays(range: DateRange, periodStart: string, periodEnd: string): number {
  const effectiveStart = periodStart && periodStart > range.start ? periodStart : range.start
  const effectiveEnd = periodEnd && periodEnd < range.end ? periodEnd : range.end
  if (effectiveEnd < effectiveStart) return 0
  const startDate = new Date(`${effectiveStart}T00:00:00`)
  const endDate = new Date(`${effectiveEnd}T00:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

export function UnpaidLeavesPage() {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Employee[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [vacationStart, setVacationStart] = useState("")
  const [vacationEnd, setVacationEnd] = useState("")
  const [vacationDays, setVacationDays] = useState("")
  const [employeeFilter, setEmployeeFilter] = useState("")
  const [periodMode, setPeriodMode] = useState<"calendarYear" | "all">("calendarYear")
  const [periodStart, setPeriodStart] = useState(defaultPeriodStartIso())
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEndIso())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const searchRef = useRef<HTMLDivElement>(null)

  const { data: searchResult } = useSearchEmployees(searchQuery)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000 })
  const { data: orderTypes = [] } = useAllOrderTypes()
  const createMutation = useCreateOrder()
  const previewMutation = useCreateOrderPreview()
  const cancelMutation = useCancelOrder()
  const deleteMutation = useDeleteOrder()
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState("")
  const [pendingPayload, setPendingPayload] = useState<OrderCreate | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const { data, isLoading } = useOrders({
    page: 1,
    per_page: 1000,
    order_type_code: UNPAID_LEAVE_CODE,
  })

  const unpaidLeaveType = orderTypes.find((item) => item.code === UNPAID_LEAVE_CODE) ?? null

  useEffect(() => {
    if (searchResult?.items) setSearchResults(searchResult.items)
  }, [searchResult])

  useEffect(() => {
    if (searchOpen && !searchQuery && allEmployees?.items) setSearchResults(allEmployees.items)
  }, [searchOpen, searchQuery, allEmployees])

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchResults([])
        setSearchOpen(false)
      }
    }

    document.addEventListener("mousedown", onDocumentClick)
    return () => document.removeEventListener("mousedown", onDocumentClick)
  }, [])

  useEffect(() => {
    if (!vacationStart || !vacationEnd) return
    const computed = calcDays(vacationStart, vacationEnd)
    if (computed) setVacationDays(computed)
  }, [vacationStart, vacationEnd])

  const resetForm = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setVacationStart("")
    setVacationEnd("")
    setVacationDays("")
    setErrors({})
  }

  const resetPreviewState = () => {
    setPreviewDialogOpen(false)
    setPreviewId(null)
    setPreviewHtml("")
    setPendingPayload(null)
    setPreviewError(null)
  }

  const selectEmployee = (employee: Employee) => {
    setSelectedEmployee(employee)
    setSearchQuery("")
    setSearchResults([])
    setSearchOpen(false)
    setErrors((prev) => ({ ...prev, employee: "" }))
  }

  const clearEmployee = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!unpaidLeaveType) nextErrors.orderType = "Тип приказа не найден"
    if (!selectedEmployee) nextErrors.employee = "Выберите сотрудника"
    if (!orderDate) nextErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) nextErrors.orderNumber = "Укажите номер приказа"
    if (!vacationStart) nextErrors.vacationStart = "Укажите дату начала"
    if (!vacationEnd) nextErrors.vacationEnd = "Укажите дату окончания"
    if (vacationStart && vacationEnd && vacationEnd < vacationStart) {
      nextErrors.vacationEnd = "Дата окончания раньше даты начала"
    }
    if (!vacationDays || Number(vacationDays) <= 0) nextErrors.vacationDays = "Укажите количество дней"
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate() || !unpaidLeaveType || !selectedEmployee) return

    const payload: OrderCreate = {
      employee_id: selectedEmployee.id,
      order_type_id: unpaidLeaveType.id,
      order_date: orderDate,
      order_number: orderNumber,
      extra_fields: {
        vacation_start: vacationStart,
        vacation_end: vacationEnd,
        vacation_days: Number(vacationDays),
      },
    }
    setPendingPayload(payload)
    setPreviewError(null)
    previewMutation.mutate(payload, {
      onSuccess: (preview) => {
        setPreviewId(preview.preview_id)
        setPreviewHtml(preview.html)
        setPreviewDialogOpen(true)
      },
      onError: (err: any) => {
        setPreviewError(err?.response?.data?.detail || err?.message || "Ошибка при формировании предпросмотра")
      },
    })
  }

  const handlePreviewConfirm = (editedHtml: string) => {
    if (!pendingPayload || !previewId) return
    createMutation.mutate(
      {
        ...pendingPayload,
        preview_id: previewId,
        edited_html: editedHtml,
      },
      {
        onSuccess: () => {
          resetForm()
          resetPreviewState()
        },
      }
    )
  }

  const handleDownload = (orderId: number) => {
    window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/download`, "_blank")
  }

  const handlePreview = (orderId: number) => {
    window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/print`, "_blank")
  }

  const handleCancelOrderConfirm = () => {
    if (cancelOrderId) cancelMutation.mutate(cancelOrderId)
    setCancelOrderId(null)
  }

  const handleDeleteOrderConfirm = () => {
    if (deleteOrderId) deleteMutation.mutate(deleteOrderId)
    setDeleteOrderId(null)
  }

  const orders = data?.items ?? []
  const periodError = periodStart && periodEnd && periodEnd < periodStart ? "Дата конца раньше даты начала" : ""

  const filteredOrders = orders
    .filter((order) => {
      if (!employeeFilter.trim()) return true
      return (order.employee_name || "").toLowerCase().includes(employeeFilter.trim().toLowerCase())
    })
    .filter((order) => {
      const extra = (order.extra_fields || {}) as Record<string, unknown>
      const range = parseUnpaidRange(extra)
      if (!range) return false
      return intersectsPeriod(range, periodStart, periodEnd)
    })

  const totalUnpaidDays = filteredOrders.reduce((sum, order) => {
    const extra = (order.extra_fields || {}) as Record<string, unknown>
    const range = parseUnpaidRange(extra)
    if (!range) return sum
    const explicitDays = typeof extra.vacation_days === "number" ? extra.vacation_days : Number(extra.vacation_days)
    if (!Number.isNaN(explicitDays) && explicitDays > 0 && !periodStart && !periodEnd) return sum + explicitDays
    return sum + overlapDays(range, periodStart, periodEnd)
  }, 0)

  const setCalendarYearPeriod = () => {
    setPeriodMode("calendarYear")
    setPeriodStart(defaultPeriodStartIso())
    setPeriodEnd(defaultPeriodEndIso())
  }

  const setAllPeriod = () => {
    setPeriodMode("all")
    setPeriodStart("")
    setPeriodEnd("")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Отпуск за свой счет</h1>
      </div>

      <div className="border rounded-lg bg-card">
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold">Создать отпуск за свой счет</h2>
        </div>

        {!collapsed && (
          <div className="border-t px-4 py-4">
            <div className="grid gap-4">
              <div className="flex gap-4">
                <div className="w-[29%]" ref={searchRef}>
                  <label className="text-sm font-medium">Сотрудник *</label>
                  {selectedEmployee ? (
                    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm flex-1 truncate">{selectedEmployee.name}</span>
                      <button type="button" onClick={clearEmployee} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Поиск по ФИО..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onFocus={() => {
                          setSearchOpen(true)
                          if (!searchQuery && allEmployees?.items) setSearchResults(allEmployees.items)
                        }}
                        className={errors.employee ? "border-red-500" : ""}
                      />
                      {searchResults.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                          {searchResults.map((employee) => (
                            <button
                              key={employee.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                              onClick={() => selectEmployee(employee)}
                            >
                              <span className="font-medium">{employee.name}</span>
                              {employee.tab_number && <span className="text-muted-foreground ml-2">таб. {employee.tab_number}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {errors.employee && <p className="text-xs text-red-500 mt-1">{errors.employee}</p>}
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-[130px]">
                  <DatePicker label="Дата приказа *" value={orderDate} onChange={setOrderDate} />
                  {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}
                </div>
                <OrderNumberField value={orderNumber} onChange={setOrderNumber} required error={errors.orderNumber} />
                <div className="w-[130px]">
                  <DatePicker label="Дата начала *" value={vacationStart} onChange={setVacationStart} />
                  {errors.vacationStart && <p className="text-xs text-red-500 mt-1">{errors.vacationStart}</p>}
                </div>
                <div className="w-[130px]">
                  <DatePicker label="Дата конца *" value={vacationEnd} onChange={setVacationEnd} />
                  {errors.vacationEnd && <p className="text-xs text-red-500 mt-1">{errors.vacationEnd}</p>}
                </div>
                <div className="w-[110px]">
                  <label className="text-sm font-medium">Дней *</label>
                  <Input
                    type="number"
                    min="1"
                    value={vacationDays}
                    onChange={(event) => setVacationDays(event.target.value)}
                    className={errors.vacationDays ? "border-red-500" : ""}
                  />
                  {errors.vacationDays && <p className="text-xs text-red-500 mt-1">{errors.vacationDays}</p>}
                </div>
              </div>

              {errors.orderType && <p className="text-sm text-red-600">{errors.orderType}</p>}
              {previewError && <p className="text-sm text-red-600">{previewError}</p>}
              {createMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createMutation.error as any)?.response?.data?.detail || (createMutation.error as any)?.message || "Ошибка создания приказа"}
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetForm} disabled={createMutation.isPending || previewMutation.isPending}>
                  Очистить
                </Button>
                <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || previewMutation.isPending || !unpaidLeaveType}>
                  {previewMutation.isPending ? "Формирование..." : createMutation.isPending ? "Создание..." : "Создать"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState message="Нет приказов" description="Создайте первый приказ на отпуск за свой счет" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant={periodMode === "calendarYear" ? "default" : "outline"} onClick={setCalendarYearPeriod}>
              Календарный год
            </Button>
            <Button size="sm" variant={periodMode === "all" ? "default" : "outline"} onClick={setAllPeriod}>
              Весь период
            </Button>
            <div className="w-[200px]">
              <Input
                placeholder="Поиск сотрудника"
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(event.target.value)}
              />
            </div>
            <div className="w-[132px]">
              <DatePicker
                placeholder="Период с"
                value={periodStart}
                onChange={(value) => {
                  setPeriodMode("all")
                  setPeriodStart(value)
                }}
              />
            </div>
            <div className="w-[132px]">
              <DatePicker
                placeholder="Период по"
                value={periodEnd}
                onChange={(value) => {
                  setPeriodMode("all")
                  setPeriodEnd(value)
                }}
              />
            </div>
            <div className="px-3 h-10 border rounded-md bg-card flex items-center min-w-[250px]">
              <p className="text-sm font-medium">Дней отпуска за период: {totalUnpaidDays}</p>
            </div>
          </div>

          {periodError && <p className="text-xs text-red-500">{periodError}</p>}

          {filteredOrders.length === 0 ? (
            <EmptyState message="Нет отпусков за выбранный период" description="Измените фильтры периода или сотрудника" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>№</TableHead>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Период</TableHead>
                  <TableHead>Дней</TableHead>
                  <TableHead>Дата приказа</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const extra = order.extra_fields || {}
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono">{order.order_number}</TableCell>
                      <TableCell>{order.employee_name || "—"}</TableCell>
                      <TableCell>
                        {formatDate(String(extra.vacation_start || ""))} — {formatDate(String(extra.vacation_end || ""))}
                      </TableCell>
                      <TableCell>{extra.vacation_days ? String(extra.vacation_days) : "—"}</TableCell>
                      <TableCell>{formatDate(order.order_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Быстрый просмотр" onClick={() => handlePreview(order.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Скачать приказ" onClick={() => handleDownload(order.id)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Отменить приказ"
                            onClick={() => setCancelOrderId(order.id)}
                            className="text-amber-500 hover:text-amber-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Удалить приказ"
                            onClick={() => setDeleteOrderId(order.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <AlertDialog open={cancelOrderId !== null} onOpenChange={(open) => !open && setCancelOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить приказ?</AlertDialogTitle>
            <AlertDialogDescription>
              Приказ на отпуск за свой счет будет отменен. Это действие можно использовать вместо удаления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelOrderConfirm} className="bg-amber-600 hover:bg-amber-700">
              Отменить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOrderId !== null} onOpenChange={(open) => !open && setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить приказ безвозвратно?</AlertDialogTitle>
            <AlertDialogDescription>
              Приказ будет удален безвозвратно. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrderConfirm} className="bg-red-600 hover:bg-red-700">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OrderPreviewDialog
        open={previewDialogOpen}
        html={previewHtml}
        isSubmitting={createMutation.isPending}
        onOpenChange={(open) => {
          if (!open) resetPreviewState()
          else setPreviewDialogOpen(true)
        }}
        onConfirm={handlePreviewConfirm}
      />
    </div>
  )
}
