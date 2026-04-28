import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, ChevronRight, Download, Eye, Trash2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table"
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
import { useEmployees, useSearchEmployees } from "@/entities/employee/useEmployees"
import { useAllOrderTypes, useCancelOrder, useCreateOrder, useCreateOrderPreview, useDeleteOrder, useOrders } from "@/entities/order/useOrders"
import { OrderNumberField } from "@/features/OrderNumberField"
import { OrderPreviewDialog } from "@/features/order-preview/OrderPreviewDialog"
import type { Employee } from "@/entities/employee/types"
import type { OrderCreate } from "@/entities/order/types"

const WEEKEND_CALL_CODE = "weekend_call"

type CallMode = "single" | "range"

interface CallRange {
  start: string
  end: string
}

interface OrderWithRange {
  order: {
    id: number
    order_number: string
    employee_name: string | null
    order_date: string
    extra_fields: Record<string, unknown> | null
  }
  callRange: CallRange
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const value = dateStr.slice(0, 10)
  const parts = value.split("-")
  if (parts.length !== 3) return dateStr
  return `${parts[2]}.${parts[1]}.${parts[0]}`
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

function parseCallRange(extra: Record<string, unknown>): CallRange | null {
  const single = typeof extra.call_date === "string" ? normalizeIsoDate(extra.call_date) : ""
  if (single) return { start: single, end: single }

  const start = typeof extra.call_date_start === "string" ? normalizeIsoDate(extra.call_date_start) : ""
  const end = typeof extra.call_date_end === "string" ? normalizeIsoDate(extra.call_date_end) : ""

  if (start && end) return start <= end ? { start, end } : { start: end, end: start }
  if (start) return { start, end: start }
  if (end) return { start: end, end }
  return null
}

function intersectsPeriod(range: CallRange, periodStart: string, periodEnd: string): boolean {
  if (!periodStart && !periodEnd) return true
  if (periodStart && range.end < periodStart) return false
  if (periodEnd && range.start > periodEnd) return false
  return true
}

function daysInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

function overlapDays(range: CallRange, periodStart: string, periodEnd: string): number {
  const effectiveStart = periodStart && periodStart > range.start ? periodStart : range.start
  const effectiveEnd = periodEnd && periodEnd < range.end ? periodEnd : range.end
  if (effectiveEnd < effectiveStart) return 0
  return daysInclusive(effectiveStart, effectiveEnd)
}

function callPeriodLabel(extra: Record<string, unknown>): string {
  const singleDate = typeof extra.call_date === "string" ? extra.call_date : ""
  const rangeStart = typeof extra.call_date_start === "string" ? extra.call_date_start : ""
  const rangeEnd = typeof extra.call_date_end === "string" ? extra.call_date_end : ""
  if (singleDate) return formatDate(singleDate)
  if (rangeStart || rangeEnd) return `${formatDate(rangeStart)} — ${formatDate(rangeEnd)}`
  return "—"
}

export function WeekendCallsPage() {
  const [collapsed, setCollapsed] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Employee[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [mode, setMode] = useState<CallMode>("single")
  const [callDate, setCallDate] = useState("")
  const [callDateStart, setCallDateStart] = useState("")
  const [callDateEnd, setCallDateEnd] = useState("")
  const [employeeFilter, setEmployeeFilter] = useState("")
  const [periodMode, setPeriodMode] = useState<"calendarYear" | "all">("calendarYear")
  const [periodStart, setPeriodStart] = useState(defaultPeriodStartIso())
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEndIso())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)

  const searchRef = useRef<HTMLDivElement>(null)

  const { data: searchResult } = useSearchEmployees(searchQuery)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000 })
  const { data: orderTypes = [] } = useAllOrderTypes()
  const createMutation = useCreateOrder()
  const previewMutation = useCreateOrderPreview()
  const cancelMutation = useCancelOrder()
  const deleteMutation = useDeleteOrder()
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState("")
  const [pendingPayload, setPendingPayload] = useState<OrderCreate | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const { data, isLoading } = useOrders({
    page: 1,
    per_page: 1000,
    order_type_code: WEEKEND_CALL_CODE,
  })

  const weekendCallType = orderTypes.find((item) => item.code === WEEKEND_CALL_CODE) ?? null

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

  const resetForm = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setMode("single")
    setCallDate("")
    setCallDateStart("")
    setCallDateEnd("")
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

  const setLastYearPeriod = () => {
    setPeriodMode("calendarYear")
    setPeriodStart(defaultPeriodStartIso())
    setPeriodEnd(defaultPeriodEndIso())
  }

  const setAllPeriod = () => {
    setPeriodMode("all")
    setPeriodStart("")
    setPeriodEnd("")
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!weekendCallType) nextErrors.orderType = "Тип приказа не найден"
    if (!selectedEmployee) nextErrors.employee = "Выберите сотрудника"
    if (!orderDate) nextErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) nextErrors.orderNumber = "Укажите номер приказа"

    if (mode === "single") {
      if (!callDate) nextErrors.callDate = "Укажите дату вызова"
    } else {
      if (!callDateStart) nextErrors.callDateStart = "Укажите дату начала"
      if (!callDateEnd) nextErrors.callDateEnd = "Укажите дату окончания"
      if (callDateStart && callDateEnd && callDateEnd < callDateStart) {
        nextErrors.callDateEnd = "Дата окончания раньше даты начала"
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate() || !weekendCallType || !selectedEmployee) return

    const extraFields: Record<string, string> = {}
    if (mode === "single") {
      extraFields.call_date = callDate
    } else {
      extraFields.call_date_start = callDateStart
      extraFields.call_date_end = callDateEnd
    }

    const payload: OrderCreate = {
      employee_id: selectedEmployee.id,
      order_type_id: weekendCallType.id,
      order_date: orderDate,
      order_number: orderNumber,
      extra_fields: extraFields,
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
    window.open(`/orders/${orderId}/view-docx`, "_blank", "noopener,noreferrer")
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

  const accountedOrders: OrderWithRange[] = orders
    .map((order) => {
      const extra = (order.extra_fields || {}) as Record<string, unknown>
      const callRange = parseCallRange(extra)
      return callRange
        ? {
            order: {
              id: order.id,
              order_number: order.order_number,
              employee_name: order.employee_name,
              order_date: order.order_date,
              extra_fields: order.extra_fields as Record<string, unknown> | null,
            },
            callRange,
          }
        : null
    })
    .filter((item): item is OrderWithRange => item !== null)
    .filter((item) => {
      if (!employeeFilter.trim()) return true
      return (item.order.employee_name || "").toLowerCase().includes(employeeFilter.trim().toLowerCase())
    })
    .filter((item) => intersectsPeriod(item.callRange, periodStart, periodEnd))

  const totalCalls = accountedOrders.length
  const totalDays = accountedOrders.reduce((sum, item) => sum + overlapDays(item.callRange, periodStart, periodEnd), 0)

  const employeesMap = new Map<string, { name: string; calls: number; days: number }>()
  for (const item of accountedOrders) {
    const name = item.order.employee_name || "Неизвестный сотрудник"
    const current = employeesMap.get(name) || { name, calls: 0, days: 0 }
    current.calls += 1
    current.days += overlapDays(item.callRange, periodStart, periodEnd)
    employeesMap.set(name, current)
  }
  const employeesSummary = Array.from(employeesMap.values()).sort((a, b) => b.calls - a.calls)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Вызовы в выходные дни</h1>
      </div>

      <div className="border rounded-lg bg-card">
        <div className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold">Создать приказ</h2>
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
                <OrderNumberField
                  value={orderNumber}
                  onChange={setOrderNumber}
                  orderTypeId={weekendCallType?.id}
                  orderTypes={orderTypes}
                  required
                  error={errors.orderNumber}
                />
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Режим</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "single" ? "default" : "outline"}
                      onClick={() => {
                        setMode("single")
                        setCallDateStart("")
                        setCallDateEnd("")
                      }}
                    >
                      Один день
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "range" ? "default" : "outline"}
                      onClick={() => {
                        setMode("range")
                        setCallDate("")
                      }}
                    >
                      Период
                    </Button>
                  </div>
                </div>
                {mode === "single" ? (
                  <div className="w-[130px]">
                    <DatePicker label="Дата вызова *" value={callDate} onChange={setCallDate} />
                    {errors.callDate && <p className="text-xs text-red-500 mt-1">{errors.callDate}</p>}
                  </div>
                ) : (
                  <>
                    <div className="w-[130px]">
                      <DatePicker label="Дата начала *" value={callDateStart} onChange={setCallDateStart} />
                      {errors.callDateStart && <p className="text-xs text-red-500 mt-1">{errors.callDateStart}</p>}
                    </div>
                    <div className="w-[130px]">
                      <DatePicker label="Дата конца *" value={callDateEnd} onChange={setCallDateEnd} />
                      {errors.callDateEnd && <p className="text-xs text-red-500 mt-1">{errors.callDateEnd}</p>}
                    </div>
                  </>
                )}
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
                <Button size="sm" onClick={handleSubmit} disabled={createMutation.isPending || previewMutation.isPending || !weekendCallType}>
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
        <EmptyState message="Нет приказов" description="Создайте первый приказ на вызов в выходной" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant={periodMode === "calendarYear" ? "default" : "outline"} onClick={setLastYearPeriod}>
              Календарный год
            </Button>
            <Button size="sm" variant={periodMode === "all" ? "default" : "outline"} onClick={setAllPeriod}>
              Весь период
            </Button>
            <div className="w-[220px]">
              <Input
                placeholder="Поиск сотрудника"
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap lg:flex-nowrap items-end gap-2">
            <div data-testid="weekend-period-from" className="w-[132px]">
              <DatePicker
                placeholder="Период с"
                value={periodStart}
                onChange={(value) => {
                  setPeriodMode("all")
                  setPeriodStart(value)
                }}
              />
            </div>
            <div data-testid="weekend-period-to" className="w-[132px]">
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
              <p data-testid="weekend-total-calls" className="text-sm font-medium">Всего вызовов за период: {totalCalls}</p>
            </div>
            <div className="px-3 h-10 border rounded-md bg-card flex items-center min-w-[220px]">
              <p data-testid="weekend-total-days" className="text-sm font-medium">Всего дней вызова: {totalDays}</p>
            </div>
          </div>

          {periodError && <p className="text-xs text-red-500">{periodError}</p>}

          {employeesSummary.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Вызовов</TableHead>
                  <TableHead>Дней вызова</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeesSummary.map((employee) => (
                  <TableRow key={employee.name}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.calls}</TableCell>
                    <TableCell>{employee.days}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState message="Нет сотрудников с вызовами" description="За выбранный период вызовы отсутствуют" />
          )}

          {accountedOrders.length === 0 ? (
            <EmptyState message="Нет вызовов за выбранный период" description="Измените период или создайте новый приказ" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>№</TableHead>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Дата вызова</TableHead>
                  <TableHead>Дата приказа</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountedOrders.map(({ order }) => {
                  const extra = (order.extra_fields || {}) as Record<string, unknown>
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono">{order.order_number}</TableCell>
                      <TableCell>{order.employee_name || "—"}</TableCell>
                      <TableCell>{callPeriodLabel(extra)}</TableCell>
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
              Приказ на вызов в выходной будет отменен. Это действие можно использовать вместо удаления.
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
