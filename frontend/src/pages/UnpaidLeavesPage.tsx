import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Download, Eye, FilePen, Trash2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table"
import { EmployeeSearch } from "@/features/employee-search"
import { useAllOrderTypes, useCancelOrder, useDeleteOrder, useOrders } from "@/entities/order/useOrders"
import { useCommitOrderDraft, useCreateOrderDraft, useDeleteOrderDraft } from "@/entities/order/useOnlyOffice"
import { OrderNumberField } from "@/features/OrderNumberField"
import type { Employee } from "@/entities/employee/types"
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

  const { data: orderTypes = [] } = useAllOrderTypes()
  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()
  const deleteDraftMutation = useDeleteOrderDraft()
  const cancelMutation = useCancelOrder()
  const deleteMutation = useDeleteOrder()
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const { data, isLoading } = useOrders({
    page: 1,
    per_page: 1000,
    order_type_code: UNPAID_LEAVE_CODE,
  })

  const unpaidLeaveType = orderTypes.find((item) => item.code === UNPAID_LEAVE_CODE) ?? null

  useEffect(() => {
    if (!vacationStart || !vacationEnd) return
    const computed = calcDays(vacationStart, vacationEnd)
    if (computed) setVacationDays(computed)
  }, [vacationStart, vacationEnd])

  const resetForm = () => {
    if (draftId) {
      deleteDraftMutation.mutate(draftId)
    }
    setSelectedEmployee(null)
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setVacationStart("")
    setVacationEnd("")
    setVacationDays("")
    setDraftId(null)
    setErrors({})
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

  const handleEditBeforeCreate = () => {
    if (!validate() || !unpaidLeaveType || !selectedEmployee) return
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(
      {
        employee_id: selectedEmployee.id,
        order_type_id: unpaidLeaveType.id,
        order_date: orderDate,
        order_number: orderNumber,
        extra_fields: {
          vacation_start: vacationStart,
          vacation_end: vacationEnd,
          vacation_days: Number(vacationDays),
        },
      },
      {
        onSuccess: (draft) => {
          setDraftId(draft.draft_id)
          const url = `/orders/drafts/${draft.draft_id}/edit-docx`
          if (editorWindow && !editorWindow.closed) {
            editorWindow.location.href = url
          } else {
            window.open(url, "_blank", "noopener,noreferrer")
          }
        },
        onError: () => {
          editorWindow?.close()
        },
      }
    )
  }

  const handleCommitDraft = () => {
    if (!draftId || !validate() || !unpaidLeaveType || !selectedEmployee) return
    commitDraftMutation.mutate(
      {
        draftId,
        order: {
          employee_id: selectedEmployee.id,
          order_type_id: unpaidLeaveType.id,
          order_date: orderDate,
          order_number: orderNumber,
          extra_fields: {
            vacation_start: vacationStart,
            vacation_end: vacationEnd,
            vacation_days: Number(vacationDays),
          },
        },
      },
      {
        onSuccess: () => resetForm(),
      }
    )
  }

  useEffect(() => {
    const handleDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== draftId) return
      handleCommitDraft()
    }

    window.addEventListener("message", handleDraftSave)
    return () => window.removeEventListener("message", handleDraftSave)
  }, [draftId, selectedEmployee, orderDate, orderNumber, vacationStart, vacationEnd, vacationDays])

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

  const totalOrders = filteredOrders.length

  const totalUnpaidDays = filteredOrders.reduce((sum, order) => {
    const extra = (order.extra_fields || {}) as Record<string, unknown>
    const range = parseUnpaidRange(extra)
    if (!range) return sum
    const explicitDays = typeof extra.vacation_days === "number" ? extra.vacation_days : Number(extra.vacation_days)
    if (!Number.isNaN(explicitDays) && explicitDays > 0 && !periodStart && !periodEnd) return sum + explicitDays
    return sum + overlapDays(range, periodStart, periodEnd)
  }, 0)

  const employeesMap = new Map<string, { name: string; orders: number; days: number }>()
  for (const order of filteredOrders) {
    const name = order.employee_name || "Неизвестный сотрудник"
    const extra = (order.extra_fields || {}) as Record<string, unknown>
    const range = parseUnpaidRange(extra)
    const current = employeesMap.get(name) || { name, orders: 0, days: 0 }
    current.orders += 1
    if (range) {
      const explicitDays = typeof extra.vacation_days === "number" ? extra.vacation_days : Number(extra.vacation_days)
      if (!Number.isNaN(explicitDays) && explicitDays > 0 && !periodStart && !periodEnd) {
        current.days += explicitDays
      } else {
        current.days += overlapDays(range, periodStart, periodEnd)
      }
    }
    employeesMap.set(name, current)
  }
  const employeesSummary = Array.from(employeesMap.values()).sort((a, b) => b.orders - a.orders)

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
                <EmployeeSearch
                  value={selectedEmployee}
                  onChange={(emp) => {
                    setSelectedEmployee(emp)
                    if (emp) setErrors((prev) => ({ ...prev, employee: "" }))
                  }}
                  error={errors.employee}
                  required
                />
              </div>

              <div className="flex gap-4">
                <div className="w-[130px]">
                  <DatePicker label="Дата приказа *" value={orderDate} onChange={setOrderDate} />
                  {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}
                </div>
                <OrderNumberField
                  value={orderNumber}
                  onChange={setOrderNumber}
                  orderTypeId={unpaidLeaveType?.id}
                  orderTypes={orderTypes}
                  required
                  error={errors.orderNumber}
                />
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
              {createDraftMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createDraftMutation.error as any)?.response?.data?.detail || (createDraftMutation.error as any)?.message || "Ошибка подготовки приказа"}
                </p>
              )}
              {commitDraftMutation.isError && (
                <p className="text-sm text-red-600">
                  {(commitDraftMutation.error as any)?.response?.data?.detail || (commitDraftMutation.error as any)?.message || "Ошибка создания приказа"}
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetForm} disabled={createDraftMutation.isPending || commitDraftMutation.isPending || deleteDraftMutation.isPending}>
                  Очистить
                </Button>
                {!draftId ? (
                  <Button size="sm" onClick={handleEditBeforeCreate} disabled={createDraftMutation.isPending || !unpaidLeaveType}>
                    <FilePen className="mr-2 h-4 w-4" />
                    {createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleCommitDraft} disabled={commitDraftMutation.isPending}>
                    {commitDraftMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                )}
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
            <div className="w-[220px]">
              <Input
                placeholder="Поиск сотрудника"
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap lg:flex-nowrap items-end gap-2">
            <div data-testid="unpaid-period-from" className="w-[132px]">
              <DatePicker
                placeholder="Период с"
                value={periodStart}
                onChange={(value) => {
                  setPeriodMode("all")
                  setPeriodStart(value)
                }}
              />
            </div>
            <div data-testid="unpaid-period-to" className="w-[132px]">
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
              <p data-testid="unpaid-total-orders" className="text-sm font-medium">Всего отпусков за период: {totalOrders}</p>
            </div>
            <div className="px-3 h-10 border rounded-md bg-card flex items-center min-w-[220px]">
              <p data-testid="unpaid-total-days" className="text-sm font-medium">Всего дней отпуска: {totalUnpaidDays}</p>
            </div>
          </div>

          {periodError && <p className="text-xs text-red-500">{periodError}</p>}

          {employeesSummary.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Отпусков</TableHead>
                  <TableHead>Дней отпуска</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeesSummary.map((employee) => (
                  <TableRow key={employee.name}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.orders}</TableCell>
                    <TableCell>{employee.days}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState message="Нет сотрудников с отпусками" description="За выбранный период отпуски отсутствуют" />
          )}

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


    </div>
  )
}
