import { Fragment, useEffect, useState, useMemo } from "react"
import { Download, Eye, FilePen, Printer, Trash2, X } from "lucide-react"
import { SortableFilterHeader } from "@/shared/ui/SortableFilterHeader"
import { GroupOrderEmployeesRows } from "@/entities/order/ui/GroupOrderEmployeesRows"
import { useTableQueryEngine, type ColumnSortDef, type SortConfig } from "@/shared/hooks/useTableQueryEngine"
import { nextMultiSortConfigs } from "@/shared/lib/multiSort"
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
import type { Order, VacationUnpaidGroupEmployeeCreate } from "@/entities/order/types"
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

type SortField = "order_number" | "employee_name" | "order_date" | "vacation_period" | "vacation_days"

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

  const [sortConfigs, setSortConfigs] = useState<SortConfig<SortField>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<SortField, Set<string>>>({
    order_number: new Set(),
    employee_name: new Set(),
    vacation_period: new Set(),
    vacation_days: new Set(),
    order_date: new Set(),
  })

  const handleSort = (field: SortField) => {
    const defaultOrder = field === "employee_name" ? "asc" : "desc"
    setSortConfigs((prev) => nextMultiSortConfigs(prev, field, defaultOrder))
  }

  const sortDefs: ColumnSortDef<Order, SortField>[] = useMemo(() => [
    { field: "order_number", getSortValue: (order) => order.order_number ?? "" },
    {
      field: "employee_name",
      getSortValue: (order) => {
        if (order.is_group && order.group_employees && order.group_employees.length > 0) {
          const names = order.group_employees.map(e => e.employee_full_name).filter(Boolean)
          if (names.length > 0) {
            names.sort((a, b) => a.localeCompare(b, "ru"))
            return names[0]
          }
        }
        return order.employee_name ?? ""
      }
    },
    {
      field: "vacation_period",
      getSortValue: (order) => {
        if (order.is_group && order.group_employees && order.group_employees.length > 0) {
          const starts = order.group_employees.map(e => e.vacation_start).filter(Boolean)
          if (starts.length > 0) {
            starts.sort()
            return starts[0]
          }
        }
        const extra = order.extra_fields || {}
        return String(extra.vacation_start || "")
      }
    },
    {
      field: "vacation_days",
      getSortValue: (order) => {
        if (order.is_group && order.group_employees && order.group_employees.length > 0) {
          const days = order.group_employees.map(e => e.vacation_days).filter(Boolean)
          if (days.length > 0) {
            return Math.max(...days)
          }
        }
        const extra = order.extra_fields || {}
        return Number(extra.vacation_days || 0)
      }
    },
    { field: "order_date", getSortValue: (order) => order.order_date ?? "" },
  ], [])

  const localFilterPredicate = useMemo(() => {
    const hasFilters = Object.values(columnFilters).some((s) => s && s.size > 0)
    if (!hasFilters) return null
    return (order: Order) => {
      for (const [field, selected] of Object.entries(columnFilters)) {
        if (selected && selected.size > 0) {
          if (field === "order_number") {
            const val = order.order_number ?? "—"
            if (!selected.has(val)) return false
          } else if (field === "employee_name") {
            if (order.is_group && order.group_employees) {
              const hasMatchingEmployee = order.group_employees.some(e => selected.has(e.employee_full_name))
              if (!hasMatchingEmployee) return false
            } else {
              const val = order.employee_name ?? "—"
              if (!selected.has(val)) return false
            }
          } else if (field === "vacation_period") {
            if (order.is_group && order.group_employees) {
              const hasMatchingEmployee = order.group_employees.some(e => {
                const label = `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
                return selected.has(label)
              })
              if (!hasMatchingEmployee) return false
            } else {
              const extra = order.extra_fields || {}
              const val = extra.vacation_start ? `${formatDate(String(extra.vacation_start))} — ${formatDate(String(extra.vacation_end || extra.vacation_start))}` : "—"
              if (!selected.has(val)) return false
            }
          } else if (field === "vacation_days") {
            if (order.is_group && order.group_employees) {
              const hasMatchingEmployee = order.group_employees.some(e => selected.has(String(e.vacation_days)))
              if (!hasMatchingEmployee) return false
            } else {
              const extra = order.extra_fields || {}
              const val = extra.vacation_days ? String(extra.vacation_days) : "—"
              if (!selected.has(val)) return false
            }
          } else if (field === "order_date") {
            const val = formatDate(order.order_date)
            if (!selected.has(val)) return false
          }
        }
      }
      return true
    }
  }, [columnFilters])

  const uniqueValues = useMemo(() => {
    const items = filteredOrders ?? []
    const employeeNames = new Set<string>()
    const periods = new Set<string>()
    const days = new Set<string>()
    items.forEach(o => {
      if (o.is_group && o.group_employees) {
        o.group_employees.forEach(e => {
          if (e.employee_full_name) employeeNames.add(e.employee_full_name)
          periods.add(`${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`)
          days.add(String(e.vacation_days))
        })
      } else {
        if (o.employee_name) employeeNames.add(o.employee_name)
        const extra = o.extra_fields || {}
        if (extra.vacation_start) {
          periods.add(`${formatDate(String(extra.vacation_start))} — ${formatDate(String(extra.vacation_end || extra.vacation_start))}`)
        }
        if (extra.vacation_days) days.add(String(extra.vacation_days))
      }
    })
    return {
      order_number: [...new Set(items.map(o => o.order_number ?? "—"))].sort(),
      employee_name: [...employeeNames].sort((a, b) => a.localeCompare(b, "ru")),
      vacation_period: [...periods].sort(),
      vacation_days: [...days].sort((a, b) => Number(a) - Number(b)),
      order_date: [...new Set(items.map(o => formatDate(o.order_date)))].sort(),
    }
  }, [filteredOrders])

  const engineResult = useTableQueryEngine({
    rows: filteredOrders ?? [],
    getId: (order) => order.id,
    searchQuery: "",
    filterPredicate: localFilterPredicate,
    sortConfigs,
    sortDefs,
  })
  const displayOrders = engineResult.rows

  const getDisplayGroupEmployees = (order: Order) => {
    if (!order.group_employees) return []
    
    let filtered = order.group_employees

    // 1. Filter by employee_name if active
    const selectedNames = columnFilters.employee_name
    if (selectedNames && selectedNames.size > 0) {
      filtered = filtered.filter(e => selectedNames.has(e.employee_full_name))
    }

    // 2. Filter by vacation_period if active
    const selectedPeriods = columnFilters.vacation_period
    if (selectedPeriods && selectedPeriods.size > 0) {
      filtered = filtered.filter(e => {
        const label = `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
        return selectedPeriods.has(label)
      })
    }

    // 3. Filter by vacation_days if active
    const selectedDays = columnFilters.vacation_days
    if (selectedDays && selectedDays.size > 0) {
      filtered = filtered.filter(e => selectedDays.has(String(e.vacation_days)))
    }
    
    // Sort by employee_name, vacation_period, or vacation_days
    const nameSort = sortConfigs.find(s => s.field === "employee_name")
    if (nameSort) {
      const sorted = [...filtered].sort((a, b) => {
        const nameA = a.employee_full_name ?? ""
        const nameB = b.employee_full_name ?? ""
        return nameA.localeCompare(nameB, "ru")
      })
      if (nameSort.order === "desc") {
        sorted.reverse()
      }
      return sorted
    }

    const periodSort = sortConfigs.find(s => s.field === "vacation_period")
    if (periodSort) {
      const sorted = [...filtered].sort((a, b) => {
        const pA = a.vacation_start ?? ""
        const pB = b.vacation_start ?? ""
        return pA.localeCompare(pB, "ru")
      })
      if (periodSort.order === "desc") {
        sorted.reverse()
      }
      return sorted
    }

    const daysSort = sortConfigs.find(s => s.field === "vacation_days")
    if (daysSort) {
      const sorted = [...filtered].sort((a, b) => a.vacation_days - b.vacation_days)
      if (daysSort.order === "desc") {
        sorted.reverse()
      }
      return sorted
    }
    
    return filtered
  }

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

  type SummarySortField = "name" | "days" | "orders"
  const [summarySortConfigs, setSummarySortConfigs] = useState<SortConfig<SummarySortField>[]>([])
  const [summaryColumnFilters, setSummaryColumnFilters] = useState<Record<SummarySortField, Set<string>>>({
    name: new Set(),
    days: new Set(),
    orders: new Set(),
  })

  const handleSummarySort = (field: SummarySortField) => {
    const defaultOrder = field === "name" ? "asc" : "desc"
    setSummarySortConfigs((prev) => nextMultiSortConfigs(prev, field, defaultOrder))
  }
  const handleSummaryFilter = (field: SummarySortField, selected: Set<string>) => {
    setSummaryColumnFilters((prev) => ({ ...prev, [field]: selected }))
  }

  const summaryUniqueValues = {
    name: [...new Set(employeesSummary.map((e) => e.name))].sort(),
    days: [...new Set(employeesSummary.map((e) => String(e.days)))].sort((a, b) => Number(b) - Number(a)),
    orders: [...new Set(employeesSummary.map((e) => String(e.orders)))].sort((a, b) => Number(b) - Number(a)),
  }

  const displayedEmployeesSummary = useMemo(() => {
    let rows = employeesSummary
    if (summaryColumnFilters.name.size > 0) rows = rows.filter((e) => summaryColumnFilters.name.has(e.name))
    if (summaryColumnFilters.days.size > 0) rows = rows.filter((e) => summaryColumnFilters.days.has(String(e.days)))
    if (summaryColumnFilters.orders.size > 0) rows = rows.filter((e) => summaryColumnFilters.orders.has(String(e.orders)))
    if (summarySortConfigs.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const sc of summarySortConfigs) {
          let cmp = 0
          if (sc.field === "name") cmp = a.name.localeCompare(b.name, "ru")
          else if (sc.field === "days") cmp = a.days - b.days
          else if (sc.field === "orders") cmp = a.orders - b.orders
          if (sc.order === "desc") cmp = -cmp
          if (cmp !== 0) return cmp
        }
        return 0
      })
    }
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesSummary, summarySortConfigs, summaryColumnFilters])

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

          <div className="w-fit">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="w-28 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => employeesSummary.length > 0 && setShowEmployeesTable(!showEmployeesTable)}
                >
                  {employeesSummary.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {showEmployeesTable ? "▾ Скрыть" : "▸ Показать"}
                    </span>
                  )}
                </TableHead>
                <TableHead className="p-0">
                  <SortableFilterHeader
                    field="name"
                    label="Сотрудник"
                    currentSorts={summarySortConfigs}
                    onSortChange={handleSummarySort}
                    values={summaryUniqueValues.name}
                    selectedValues={summaryColumnFilters.name}
                    onFilterChange={handleSummaryFilter}
                  />
                </TableHead>
                <TableHead className="p-0">
                  <SortableFilterHeader
                    field="days"
                    label="Дней отпуска"
                    currentSorts={summarySortConfigs}
                    onSortChange={handleSummarySort}
                    values={summaryUniqueValues.days}
                    selectedValues={summaryColumnFilters.days}
                    onFilterChange={handleSummaryFilter}
                  />
                </TableHead>
                <TableHead className="p-0">
                  <SortableFilterHeader
                    field="orders"
                    label="Отпусков"
                    currentSorts={summarySortConfigs}
                    onSortChange={handleSummarySort}
                    values={summaryUniqueValues.orders}
                    selectedValues={summaryColumnFilters.orders}
                    onFilterChange={handleSummaryFilter}
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            {showEmployeesTable && (
              <TableBody>
                {displayedEmployeesSummary.length > 0 ? (
                  displayedEmployeesSummary.map((employee) => (
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
          </div>

          {displayOrders.length === 0 ? (
            <EmptyState message="Нет отпусков за выбранный период" description="Измените фильтры периода или сотрудника" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="order_number"
                      label="№"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.order_number}
                      selectedValues={columnFilters.order_number}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="employee_name"
                      label="Сотрудник"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.employee_name}
                      selectedValues={columnFilters.employee_name}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="vacation_period"
                      label="Период"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.vacation_period}
                      selectedValues={columnFilters.vacation_period}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="vacation_days"
                      label="Дней"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.vacation_days}
                      selectedValues={columnFilters.vacation_days}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="order_date"
                      label="Дата приказа"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.order_date}
                      selectedValues={columnFilters.order_date}
                      onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    />
                  </TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayOrders.map((order) => {
                  const extra = order.extra_fields || {}
                  const isGroup = order.is_group

                  return (
                    <Fragment key={order.id}>
                      <TableRow>
                        <TableCell className="font-mono">{order.order_number}</TableCell>
                        <TableCell>
                          {isGroup ? (
                            <span className="font-medium">Групповой приказ — {order.group_employee_count || 0} сотрудников</span>
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
                      {isGroup && order.group_employees && (
                        <GroupOrderEmployeesRows
                          employees={getDisplayGroupEmployees(order)}
                          type="unpaid"
                          orderNumber={order.order_number}
                        />
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
