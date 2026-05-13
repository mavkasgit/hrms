import { Fragment, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Download, Eye, FilePen, Printer, Trash2, X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { EmptyState } from "@/shared/ui/empty-state"
import { Input } from "@/shared/ui/input"
import { Skeleton } from "@/shared/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table"
import { EmployeeSearch } from "@/features/employee-search"
import { useAllOrderTypes, useCreateVacationUnpaidGroupOrder, useDeleteOrder, useOrders } from "@/entities/order/useOrders"
import { useCommitGroupDraft, useCommitOrderDraft, useCreateGroupDraft, useCreateOrderDraft, useDeleteOrderDraft } from "@/entities/order/useOnlyOffice"
import { downloadOrderDocx, openOrderPrint, openOrderView } from "@/entities/order/orderActions"
import { OrderNumberField } from "@/features/OrderNumberField"
import type { Employee } from "@/entities/employee/types"
import type { GroupEmployeeInfo, Order, VacationUnpaidGroupEmployeeCreate } from "@/entities/order/types"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/tabs"
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

interface GroupEmployeeRow extends VacationUnpaidGroupEmployeeCreate {
  employee: Employee
  vacation_end_calculated?: string
}

interface UnpaidLeaveEntry {
  orderId: number
  employeeName: string
  range: DateRange
  explicitDays: number | null
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

function toUnpaidLeaveEntries(order: Order): UnpaidLeaveEntry[] {
  if (order.is_group) {
    return (order.group_employees || []).flatMap((employee) => {
      const range = parseUnpaidRange({
        vacation_start: employee.vacation_start,
        vacation_end: employee.vacation_end,
      })
      if (!range) return []
      return [{
        orderId: order.id,
        employeeName: employee.employee_full_name || "Неизвестный сотрудник",
        range,
        explicitDays: employee.vacation_days > 0 ? employee.vacation_days : null,
      }]
    })
  }

  const extra = (order.extra_fields || {}) as Record<string, unknown>
  const range = parseUnpaidRange(extra)
  if (!range) return []
  const explicitDaysRaw = typeof extra.vacation_days === "number" ? extra.vacation_days : Number(extra.vacation_days)
  const explicitDays = Number.isNaN(explicitDaysRaw) || explicitDaysRaw <= 0 ? null : explicitDaysRaw

  return [{
    orderId: order.id,
    employeeName: order.employee_name || "Неизвестный сотрудник",
    range,
    explicitDays,
  }]
}

export function UnpaidLeavesPage() {
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
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(new Set())

  const { data: orderTypes = [] } = useAllOrderTypes()
  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()
  const deleteDraftMutation = useDeleteOrderDraft()
  const createGroupDraftMutation = useCreateGroupDraft()
  const commitGroupDraftMutation = useCommitGroupDraft()
  const deleteMutation = useDeleteOrder()
  const createGroupOrderMutation = useCreateVacationUnpaidGroupOrder()
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [showEmployeesTable, setShowEmployeesTable] = useState(true)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [groupDraftId, setGroupDraftId] = useState<string | null>(null)
  const [orderMode, setOrderMode] = useState<"single" | "group">("single")
  const [groupEmployees, setGroupEmployees] = useState<GroupEmployeeRow[]>([])
  const [groupVacationStart, setGroupVacationStart] = useState("")
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({})
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

  const handleCommitDraft = (openPrint = false, printTarget?: string) => {
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
        onSuccess: (order) => {
          if (openPrint && order?.id) {
            openOrderPrint(order.id, printTarget || "_blank")
          }
          resetForm()
        },
      }
    )
  }

  useEffect(() => {
    const handleDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string; openPrint?: boolean; printWindowName?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== draftId) return
      handleCommitDraft(Boolean(message.openPrint), message.printWindowName)
    }

    window.addEventListener("message", handleDraftSave)
    return () => window.removeEventListener("message", handleDraftSave)
  }, [draftId, selectedEmployee, orderDate, orderNumber, vacationStart, vacationEnd, vacationDays])

  useEffect(() => {
    const handleGroupDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== groupDraftId) return
      handleCommitGroupDraft()
    }

    window.addEventListener("message", handleGroupDraftSave)
    return () => window.removeEventListener("message", handleGroupDraftSave)
  }, [groupDraftId])

  const handleDeleteOrderConfirm = () => {
    if (deleteOrderId) deleteMutation.mutate(deleteOrderId)
    setDeleteOrderId(null)
  }

  const toggleGroupExpand = (orderId: number) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }

  const calculateVacationEnd = (start: string, days: number): string => {
    if (!start || days <= 0) return ""
    const [y, m, d] = start.split("-")
    if (!y || !m || !d) return ""
    const end = new Date(Number(y), Number(m) - 1, Number(d))
    if (Number.isNaN(end.getTime())) return ""
    end.setDate(end.getDate() + days - 1)
    const ey = end.getFullYear()
    const em = String(end.getMonth() + 1).padStart(2, "0")
    const ed = String(end.getDate()).padStart(2, "0")
    return `${ey}-${em}-${ed}`
  }

  const addGroupEmployee = (employee: Employee) => {
    if (groupEmployees.some((e) => e.employee_id === employee.id)) return
    const defaultDays = vacationDays ? Number(vacationDays) : 1
    setGroupEmployees((prev) => [
      ...prev,
      {
        employee_id: employee.id,
        vacation_days: defaultDays,
        employee,
        vacation_end_calculated: groupVacationStart ? calculateVacationEnd(groupVacationStart, defaultDays) : "",
      },
    ])
  }

  const removeGroupEmployee = (employeeId: number) => {
    setGroupEmployees((prev) => prev.filter((e) => e.employee_id !== employeeId))
  }

  const updateGroupEmployeeDays = (employeeId: number, rawValue: string) => {
    const days = rawValue ? Number(rawValue) : 0
    setGroupEmployees((prev) =>
      prev.map((e) =>
        e.employee_id === employeeId
          ? {
              ...e,
              vacation_days: days > 0 ? days : 0,
              vacation_end_calculated: groupVacationStart && days > 0 ? calculateVacationEnd(groupVacationStart, days) : "",
            }
          : e
      )
    )
  }


  const setGroupVacationStartAndRecalc = (value: string) => {
    setGroupVacationStart(value)
    if (value) {
      setGroupEmployees((prev) =>
        prev.map((e) => ({
          ...e,
          vacation_end_calculated: calculateVacationEnd(value, e.vacation_days),
        }))
      )
    } else {
      setGroupEmployees((prev) =>
        prev.map((e) => ({
          ...e,
          vacation_end_calculated: "",
        }))
      )
    }
  }

  const resetGroupForm = () => {
    setGroupEmployees([])
    setGroupVacationStart("")
    setOrderNumber("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setGroupErrors({})
  }

  const validateGroup = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!unpaidLeaveType) nextErrors.orderType = "Тип приказа не найден"
    if (!orderDate) nextErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) nextErrors.orderNumber = "Укажите номер приказа"
    if (!groupVacationStart) nextErrors.vacationStart = "Укажите дату начала отпуска"
    if (groupEmployees.length === 0) nextErrors.employees = "Добавьте хотя бы одного сотрудника"
    for (const emp of groupEmployees) {
      if (emp.vacation_days <= 0) {
        nextErrors[`employee_${emp.employee_id}`] = "Количество дней должно быть больше 0"
      }
    }
    setGroupErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleCreateGroupDraft = () => {
    if (!validateGroup() || !unpaidLeaveType) return
    const editorWindow = window.open("about:blank", "_blank")
    createGroupDraftMutation.mutate(
      {
        order_type_code: "vacation_unpaid_group",
        order_date: orderDate,
        order_number: orderNumber,
        vacation_start: groupVacationStart,
        employees: groupEmployees.map((e) => ({
          employee_id: e.employee_id,
          vacation_days: e.vacation_days,
        })),
      },
      {
        onSuccess: (draft) => {
          setGroupDraftId(draft.draft_id)
          const url = draft.edit_url
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

  const handleCommitGroupDraft = () => {
    if (!groupDraftId) return
    commitGroupDraftMutation.mutate(groupDraftId, {
      onSuccess: () => {
        setGroupDraftId(null)
        resetGroupForm()
      },
    })
  }

  const orders = data?.items ?? []
  const periodError = periodStart && periodEnd && periodEnd < periodStart ? "Дата конца раньше даты начала" : ""

  const normalizedEmployeeFilter = employeeFilter.trim().toLowerCase()
  const unpaidEntries = orders.flatMap((order) => toUnpaidLeaveEntries(order))
  const filteredEntries = unpaidEntries.filter((entry) => {
    if (normalizedEmployeeFilter && !entry.employeeName.toLowerCase().includes(normalizedEmployeeFilter)) return false
    return intersectsPeriod(entry.range, periodStart, periodEnd)
  })
  const filteredOrderIds = new Set(filteredEntries.map((entry) => entry.orderId))
  const filteredOrders = orders.filter((order) => filteredOrderIds.has(order.id))

  const totalOrders = filteredEntries.length
  const totalUnpaidDays = filteredEntries.reduce((sum, entry) => {
    if (entry.explicitDays && !periodStart && !periodEnd) return sum + entry.explicitDays
    return sum + overlapDays(entry.range, periodStart, periodEnd)
  }, 0)

  const employeesMap = new Map<string, { name: string; orders: number; days: number }>()
  for (const entry of filteredEntries) {
    const current = employeesMap.get(entry.employeeName) || { name: entry.employeeName, orders: 0, days: 0 }
    current.orders += 1
    current.days += entry.explicitDays && !periodStart && !periodEnd
      ? entry.explicitDays
      : overlapDays(entry.range, periodStart, periodEnd)
    employeesMap.set(entry.employeeName, current)
  }
  const employeesSummary = Array.from(employeesMap.values()).sort((a, b) => b.days - a.days)

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
        <Tabs value={orderMode} onValueChange={(v) => setOrderMode(v as "single" | "group")}>
          <div className="px-4 py-3 border-b">
            <TabsList>
              <TabsTrigger value="single">Один сотрудник</TabsTrigger>
              <TabsTrigger value="group">Групповой приказ</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="single" className="px-4 py-4 m-0">
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
                  <Button size="sm" onClick={() => handleCommitDraft()} disabled={commitDraftMutation.isPending}>
                    {commitDraftMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="group" className="px-4 py-4 m-0">
            <div className="grid gap-4">
              <div className="flex gap-4">
                <div className="w-[130px]">
                  <DatePicker label="Дата приказа *" value={orderDate} onChange={setOrderDate} />
                  {groupErrors.orderDate && <p className="text-xs text-red-500 mt-1">{groupErrors.orderDate}</p>}
                </div>
                <OrderNumberField
                  value={orderNumber}
                  onChange={setOrderNumber}
                  orderTypeId={unpaidLeaveType?.id}
                  orderTypes={orderTypes}
                  required
                  error={groupErrors.orderNumber}
                />
                <div className="w-[130px]">
                  <DatePicker label="Дата начала отпуска *" value={groupVacationStart} onChange={setGroupVacationStartAndRecalc} />
                  {groupErrors.vacationStart && <p className="text-xs text-red-500 mt-1">{groupErrors.vacationStart}</p>}
                </div>
              </div>

              <div className="space-y-2">
                {groupErrors.employees && <p className="text-xs text-red-500">{groupErrors.employees}</p>}
                
                <div className="flex gap-2 items-center">
                  <EmployeeSearch
                    value={null}
                    onChange={(emp) => {
                      if (emp) {
                        addGroupEmployee(emp)
                      }
                    }}
                    placeholder="Добавить сотрудника..."
                  />
                </div>

                {groupEmployees.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Сотрудник</TableHead>
                        <TableHead>Должность</TableHead>
                        <TableHead>Подразделение</TableHead>
                        <TableHead className="w-[120px]">Дней</TableHead>
                        <TableHead className="w-[150px]">Дата окончания</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupEmployees.map((emp) => (
                        <TableRow key={emp.employee_id}>
                          <TableCell>{emp.employee.name}</TableCell>
                          <TableCell>{emp.employee.position?.name || "—"}</TableCell>
                          <TableCell>{emp.employee.department?.name || "—"}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={emp.vacation_days > 0 ? emp.vacation_days : ""}
                              onChange={(e) => updateGroupEmployeeDays(emp.employee_id, e.target.value)}
                            />
                            {groupErrors[`employee_${emp.employee_id}`] && (
                              <p className="text-xs text-red-500 mt-1">{groupErrors[`employee_${emp.employee_id}`]}</p>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(emp.vacation_end_calculated || "")}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeGroupEmployee(emp.employee_id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {groupErrors.orderType && <p className="text-sm text-red-600">{groupErrors.orderType}</p>}
              {createGroupOrderMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createGroupOrderMutation.error as any)?.response?.data?.detail || (createGroupOrderMutation.error as any)?.message || "Ошибка создания группового приказа"}
                </p>
              )}
              {createGroupDraftMutation.isError && (
                <p className="text-sm text-red-600">
                  {(createGroupDraftMutation.error as any)?.response?.data?.detail || (createGroupDraftMutation.error as any)?.message || "Ошибка подготовки группового приказа"}
                </p>
              )}
              {commitGroupDraftMutation.isError && (
                <p className="text-sm text-red-600">
                  {(commitGroupDraftMutation.error as any)?.response?.data?.detail || (commitGroupDraftMutation.error as any)?.message || "Ошибка создания группового приказа"}
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={resetGroupForm} disabled={createGroupOrderMutation.isPending || createGroupDraftMutation.isPending || commitGroupDraftMutation.isPending}>
                  Очистить
                </Button>
                {!groupDraftId ? (
                  <Button size="sm" onClick={handleCreateGroupDraft} disabled={createGroupDraftMutation.isPending || !unpaidLeaveType}>
                    <FilePen className="mr-2 h-4 w-4" />
                    {createGroupDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleCommitGroupDraft} disabled={commitGroupDraftMutation.isPending}>
                    {commitGroupDraftMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
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

          <Table>
            <TableHeader>
              <TableRow
                className="cursor-pointer select-none"
                onClick={() => employeesSummary.length > 0 && setShowEmployeesTable(!showEmployeesTable)}
              >
                <TableHead className="w-10">
                  {employeesSummary.length > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {showEmployeesTable ? "▾" : "▸"}
                    </span>
                  )}
                </TableHead>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Дней отпуска</TableHead>
                <TableHead>Отпусков</TableHead>
              </TableRow>
            </TableHeader>
            {showEmployeesTable && (
              <TableBody>
                {employeesSummary.length > 0 ? (
                  employeesSummary.map((employee) => (
                    <TableRow key={employee.name}>
                      <TableCell className="w-10" />
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.days}</TableCell>
                      <TableCell>{employee.orders}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-4">
                      Нет сотрудников с отпусками за выбранный период
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            )}
          </Table>

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
                  const isGroup = order.is_group
                  const isExpanded = expandedGroupIds.has(order.id)

                  return (
                    <Fragment key={order.id}>
                      <TableRow>
                        <TableCell className="font-mono">{order.order_number}</TableCell>
                        <TableCell>
                          {isGroup ? (
                            <button
                              className="flex items-center gap-1 hover:underline"
                              onClick={() => toggleGroupExpand(order.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              <span>Групповой приказ — {order.group_employee_count || 0} сотрудников</span>
                            </button>
                          ) : (
                            order.employee_name || "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {isGroup ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {formatDate(String(extra.vacation_start || ""))} — {formatDate(String(extra.vacation_end || ""))}
                            </>
                          )}
                        </TableCell>
                        <TableCell>
                          {isGroup ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            extra.vacation_days ? String(extra.vacation_days) : "—"
                          )}
                        </TableCell>
                        <TableCell>{formatDate(order.order_date)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Просмотр DOCX" onClick={() => openOrderView(order.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Печать" onClick={() => openOrderPrint(order.id)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Скачать приказ" onClick={() => downloadOrderDocx(order.id)}>
                              <Download className="h-4 w-4" />
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
                      {isGroup && isExpanded && order.group_employees && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30 p-4">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Сотрудник</TableHead>
                                  <TableHead>Должность</TableHead>
                                  <TableHead>Подразделение</TableHead>
                                  <TableHead>Дата начала</TableHead>
                                  <TableHead>Дата окончания</TableHead>
                                  <TableHead>Дней</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.group_employees.map((emp: GroupEmployeeInfo) => (
                                  <TableRow key={emp.employee_id}>
                                    <TableCell className="font-medium">{emp.employee_full_name}</TableCell>
                                    <TableCell>{emp.position || "—"}</TableCell>
                                    <TableCell>{emp.department || "—"}</TableCell>
                                    <TableCell>{formatDate(emp.vacation_start)}</TableCell>
                                    <TableCell>{formatDate(emp.vacation_end)}</TableCell>
                                    <TableCell>{emp.vacation_days}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

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
