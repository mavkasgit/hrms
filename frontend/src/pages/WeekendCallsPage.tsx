import { useEffect, useState, useMemo } from "react"
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
import { EmployeeSearch } from "@/features/employee-search"
import { useAllOrderTypes, useCreateWeekendCallGroupOrder, useDeleteOrder, useOrders } from "@/entities/order/useOrders"
import { useCommitOrderDraft, useCreateGroupDraft, useCommitGroupDraft, useCreateOrderDraft, useDeleteOrderDraft } from "@/entities/order/useOnlyOffice"
import { downloadOrderDocx, openOrderPrint, openOrderView } from "@/entities/order/orderActions"
import { OrderNumberField } from "@/features/OrderNumberField"
import type { Employee } from "@/entities/employee/types"
import type { Order, WeekendCallGroupEmployeeCreate } from "@/entities/order/types"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/tabs"

const WEEKEND_CALL_CODE = "weekend_call"

type CallMode = "single" | "range"

interface CallRange {
  start: string
  end: string
}

interface WeekendCallEntry {
  orderId: number
  employeeName: string
  range: CallRange
  isGroup: boolean
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

function toWeekendCallEntries(order: Order): WeekendCallEntry[] {
  if (order.is_group) {
    return (order.group_employees || []).flatMap((employee) => {
      const range = parseCallRange({
        call_date_start: employee.vacation_start,
        call_date_end: employee.vacation_end,
      })
      if (!range) return []
      return [{
        orderId: order.id,
        employeeName: employee.employee_full_name || "Неизвестный сотрудник",
        range,
        isGroup: true,
      }]
    })
  }

  const extra = (order.extra_fields || {}) as Record<string, unknown>
  const range = parseCallRange(extra)
  if (!range) return []

  return [{
    orderId: order.id,
    employeeName: order.employee_name || "Неизвестный сотрудник",
    range,
    isGroup: false,
  }]
}

interface GroupEmployeeRow extends WeekendCallGroupEmployeeCreate {
  employee: Employee
}

type SortField = "order_number" | "employee_name" | "order_date" | "call_date"

export function WeekendCallsPage() {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
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
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [showEmployeesTable, setShowEmployeesTable] = useState(true)

  const { data: orderTypes = [] } = useAllOrderTypes()
  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()
  const deleteDraftMutation = useDeleteOrderDraft()
  const createGroupDraftMutation = useCreateGroupDraft()
  const commitGroupDraftMutation = useCommitGroupDraft()
  const deleteMutation = useDeleteOrder()
  const createGroupOrderMutation = useCreateWeekendCallGroupOrder()
  const [draftId, setDraftId] = useState<string | null>(null)
  const [groupDraftId, setGroupDraftId] = useState<string | null>(null)
  const [orderMode, setOrderMode] = useState<"single" | "group">("single")
  const [groupEmployees, setGroupEmployees] = useState<GroupEmployeeRow[]>([])
  const [groupCallMode, setGroupCallMode] = useState<CallMode>("single")
  const [groupCallDate, setGroupCallDate] = useState("")
  const [groupCallDateStart, setGroupCallDateStart] = useState("")
  const [groupCallDateEnd, setGroupCallDateEnd] = useState("")
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({})
  const { data, isLoading } = useOrders({
    page: 1,
    per_page: 1000,
    order_type_code: WEEKEND_CALL_CODE,
  })

  const weekendCallType = orderTypes.find((item) => item.code === WEEKEND_CALL_CODE) ?? null

  const resetForm = () => {
    if (draftId) {
      deleteDraftMutation.mutate(draftId)
    }
    setSelectedEmployee(null)
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setMode("single")
    setCallDate("")
    setCallDateStart("")
    setCallDateEnd("")
    setDraftId(null)
    setErrors({})
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

  const handleEditBeforeCreate = () => {
    if (!validate() || !weekendCallType || !selectedEmployee) return

    const extraFields: Record<string, string> = {}
    if (mode === "single") {
      extraFields.call_date = callDate
    } else {
      extraFields.call_date_start = callDateStart
      extraFields.call_date_end = callDateEnd
    }

    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(
      {
        employee_id: selectedEmployee.id,
        order_type_id: weekendCallType.id,
        order_date: orderDate,
        order_number: orderNumber,
        extra_fields: extraFields,
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
    if (!draftId || !validate() || !weekendCallType || !selectedEmployee) return

    const extraFields: Record<string, string> = {}
    if (mode === "single") {
      extraFields.call_date = callDate
    } else {
      extraFields.call_date_start = callDateStart
      extraFields.call_date_end = callDateEnd
    }

    commitDraftMutation.mutate(
      {
        draftId,
        order: {
          employee_id: selectedEmployee.id,
          order_type_id: weekendCallType.id,
          order_date: orderDate,
          order_number: orderNumber,
          extra_fields: extraFields,
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
  }, [draftId, selectedEmployee, orderDate, orderNumber, callDate, callDateStart, callDateEnd, mode])

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

  const addGroupEmployee = (employee: Employee) => {
    if (groupEmployees.some((e) => e.employee_id === employee.id)) return
    setGroupEmployees((prev) => [
      ...prev,
      {
        employee_id: employee.id,
        vacation_days: 1,
        employee,
      },
    ])
  }

  const removeGroupEmployee = (employeeId: number) => {
    setGroupEmployees((prev) => prev.filter((e) => e.employee_id !== employeeId))
  }

  const resetGroupForm = () => {
    setGroupEmployees([])
    setGroupCallMode("single")
    setGroupCallDate("")
    setGroupCallDateStart("")
    setGroupCallDateEnd("")
    setOrderNumber("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setGroupDraftId(null)
    setGroupErrors({})
  }

  const validateGroup = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!orderDate) nextErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) nextErrors.orderNumber = "Укажите номер приказа"
    if (groupCallMode === "single" && !groupCallDate) nextErrors.callDate = "Укажите дату вызова"
    if (groupCallMode === "range") {
      if (!groupCallDateStart) nextErrors.callDateStart = "Укажите дату начала"
      if (!groupCallDateEnd) nextErrors.callDateEnd = "Укажите дату окончания"
      if (groupCallDateStart && groupCallDateEnd && groupCallDateEnd < groupCallDateStart) {
        nextErrors.callDateEnd = "Дата окончания раньше даты начала"
      }
    }
    if (groupEmployees.length === 0) nextErrors.employees = "Добавьте хотя бы одного сотрудника"
    setGroupErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleCreateGroupDraft = () => {
    if (!validateGroup()) return
    const editorWindow = window.open("about:blank", "_blank")
    const callDays = groupCallMode === "single"
      ? 1
      : groupCallDateStart && groupCallDateEnd
        ? daysInclusive(groupCallDateStart, groupCallDateEnd)
        : 1

    createGroupDraftMutation.mutate(
      {
        order_type_code: "weekend_call_group",
        order_date: orderDate,
        order_number: orderNumber,
        mode: groupCallMode,
        call_date: groupCallMode === "single" ? groupCallDate : undefined,
        call_date_start: groupCallMode === "range" ? groupCallDateStart : undefined,
        call_date_end: groupCallMode === "range" ? groupCallDateEnd : undefined,
        employees: groupEmployees.map((e) => ({
          employee_id: e.employee_id,
          vacation_days: callDays,
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
  const weekendEntries = orders.flatMap((order) => toWeekendCallEntries(order))
  const filteredEntries = weekendEntries.filter((entry) => {
    if (normalizedEmployeeFilter && !entry.employeeName.toLowerCase().includes(normalizedEmployeeFilter)) return false
    return intersectsPeriod(entry.range, periodStart, periodEnd)
  })
  const filteredOrderIds = new Set(filteredEntries.map((entry) => entry.orderId))
  const filteredOrders = orders.filter((order) => filteredOrderIds.has(order.id))

  const [sortConfigs, setSortConfigs] = useState<SortConfig<SortField>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<SortField, Set<string>>>({
    order_number: new Set(),
    employee_name: new Set(),
    call_date: new Set(),
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
      field: "call_date", 
      getSortValue: (order) => {
        if (order.is_group && order.group_employees && order.group_employees.length > 0) {
          const starts = order.group_employees.map(e => e.vacation_start).filter(Boolean)
          if (starts.length > 0) {
            starts.sort()
            return starts[0]
          }
        }
        const extra = (order.extra_fields || {}) as Record<string, unknown>
        const range = parseCallRange(extra)
        return range ? range.start : ""
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
          } else if (field === "call_date") {
            if (order.is_group && order.group_employees) {
              const hasMatchingEmployee = order.group_employees.some(e => {
                const label = formatDate(e.vacation_start) === formatDate(e.vacation_end)
                  ? formatDate(e.vacation_start)
                  : `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
                return selected.has(label)
              })
              if (!hasMatchingEmployee) return false
            } else {
              const extra = (order.extra_fields || {}) as Record<string, unknown>
              const val = callPeriodLabel(extra)
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
    const callDates = new Set<string>()
    items.forEach(o => {
      if (o.is_group && o.group_employees) {
        o.group_employees.forEach(e => {
          if (e.employee_full_name) employeeNames.add(e.employee_full_name)
          const label = formatDate(e.vacation_start) === formatDate(e.vacation_end)
            ? formatDate(e.vacation_start)
            : `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
          callDates.add(label)
        })
      } else {
        if (o.employee_name) employeeNames.add(o.employee_name)
        const extra = (o.extra_fields || {}) as Record<string, unknown>
        const label = callPeriodLabel(extra)
        if (label !== "—") callDates.add(label)
      }
    })
    return {
      order_number: [...new Set(items.map(o => o.order_number ?? "—"))].sort(),
      employee_name: [...employeeNames].sort((a, b) => a.localeCompare(b, "ru")),
      call_date: [...callDates].sort(),
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

    // 2. Filter by call_date if active
    const selectedCallDates = columnFilters.call_date
    if (selectedCallDates && selectedCallDates.size > 0) {
      filtered = filtered.filter(e => {
        const label = formatDate(e.vacation_start) === formatDate(e.vacation_end)
          ? formatDate(e.vacation_start)
          : `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
        return selectedCallDates.has(label)
      })
    }
    
    // Sort by employee_name or call_date
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

    const callSort = sortConfigs.find(s => s.field === "call_date")
    if (callSort) {
      const sorted = [...filtered].sort((a, b) => {
        const pA = a.vacation_start ?? ""
        const pB = b.vacation_start ?? ""
        return pA.localeCompare(pB, "ru")
      })
      if (callSort.order === "desc") {
        sorted.reverse()
      }
      return sorted
    }
    
    return filtered
  }

  const totalCalls = filteredEntries.length
  const totalDays = filteredEntries.reduce((sum, entry) => sum + overlapDays(entry.range, periodStart, periodEnd), 0)

  const employeesMap = new Map<string, { name: string; calls: number; days: number }>()
  for (const entry of filteredEntries) {
    const current = employeesMap.get(entry.employeeName) || { name: entry.employeeName, calls: 0, days: 0 }
    current.calls += 1
    current.days += overlapDays(entry.range, periodStart, periodEnd)
    employeesMap.set(entry.employeeName, current)
  }
  const employeesSummary = Array.from(employeesMap.values()).sort((a, b) => b.calls - a.calls)

  type SummarySortField = "name" | "calls" | "days"
  const [summarySortConfigs, setSummarySortConfigs] = useState<SortConfig<SummarySortField>[]>([])
  const [summaryColumnFilters, setSummaryColumnFilters] = useState<Record<SummarySortField, Set<string>>>({
    name: new Set(),
    calls: new Set(),
    days: new Set(),
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
    calls: [...new Set(employeesSummary.map((e) => String(e.calls)))].sort((a, b) => Number(b) - Number(a)),
    days: [...new Set(employeesSummary.map((e) => String(e.days)))].sort((a, b) => Number(b) - Number(a)),
  }

  const displayedEmployeesSummary = useMemo(() => {
    let rows = employeesSummary
    if (summaryColumnFilters.name.size > 0) rows = rows.filter((e) => summaryColumnFilters.name.has(e.name))
    if (summaryColumnFilters.calls.size > 0) rows = rows.filter((e) => summaryColumnFilters.calls.has(String(e.calls)))
    if (summaryColumnFilters.days.size > 0) rows = rows.filter((e) => summaryColumnFilters.days.has(String(e.days)))
    if (summarySortConfigs.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const sc of summarySortConfigs) {
          let cmp = 0
          if (sc.field === "name") cmp = a.name.localeCompare(b.name, "ru")
          else if (sc.field === "calls") cmp = a.calls - b.calls
          else if (sc.field === "days") cmp = a.days - b.days
          if (sc.order === "desc") cmp = -cmp
          if (cmp !== 0) return cmp
        }
        return 0
      })
    }
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesSummary, summarySortConfigs, summaryColumnFilters])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Вызовы в выходные дни</h1>
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
                  <Button size="sm" onClick={handleEditBeforeCreate} disabled={createDraftMutation.isPending || !weekendCallType}>
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
                  orderTypeId={weekendCallType?.id}
                  orderTypes={orderTypes}
                  required
                  error={groupErrors.orderNumber}
                />
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">Режим</label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={groupCallMode === "single" ? "default" : "outline"}
                      onClick={() => {
                        setGroupCallMode("single")
                        setGroupCallDateStart("")
                        setGroupCallDateEnd("")
                      }}
                    >
                      Один день
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={groupCallMode === "range" ? "default" : "outline"}
                      onClick={() => {
                        setGroupCallMode("range")
                        setGroupCallDate("")
                      }}
                    >
                      Период
                    </Button>
                  </div>
                </div>
                {groupCallMode === "single" ? (
                  <div className="w-[130px]">
                    <DatePicker label="Дата вызова *" value={groupCallDate} onChange={setGroupCallDate} />
                    {groupErrors.callDate && <p className="text-xs text-red-500 mt-1">{groupErrors.callDate}</p>}
                  </div>
                ) : (
                  <>
                    <div className="w-[130px]">
                      <DatePicker label="Дата начала *" value={groupCallDateStart} onChange={setGroupCallDateStart} />
                      {groupErrors.callDateStart && <p className="text-xs text-red-500 mt-1">{groupErrors.callDateStart}</p>}
                    </div>
                    <div className="w-[130px]">
                      <DatePicker label="Дата конца *" value={groupCallDateEnd} onChange={setGroupCallDateEnd} />
                      {groupErrors.callDateEnd && <p className="text-xs text-red-500 mt-1">{groupErrors.callDateEnd}</p>}
                    </div>
                  </>
                )}
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
                <Button variant="outline" size="sm" onClick={resetGroupForm} disabled={createGroupDraftMutation.isPending || commitGroupDraftMutation.isPending}>
                  Очистить
                </Button>
                {!groupDraftId ? (
                  <Button size="sm" onClick={handleCreateGroupDraft} disabled={createGroupDraftMutation.isPending}>
                    <FilePen className="mr-2 h-4 w-4" />
                    {createGroupDraftMutation.isPending ? "Подготовка..." : "Создать групповой приказ"}
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

          {employeesSummary.length > 0 && (
            <div className="w-fit">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-28 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => setShowEmployeesTable(!showEmployeesTable)}
                  >
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      {showEmployeesTable ? "▾ Скрыть" : "▸ Показать"}
                    </span>
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
                      field="calls"
                      label="Вызовов"
                      currentSorts={summarySortConfigs}
                      onSortChange={handleSummarySort}
                      values={summaryUniqueValues.calls}
                      selectedValues={summaryColumnFilters.calls}
                      onFilterChange={handleSummaryFilter}
                    />
                  </TableHead>
                  <TableHead className="p-0">
                    <SortableFilterHeader
                      field="days"
                      label="Дней вызова"
                      currentSorts={summarySortConfigs}
                      onSortChange={handleSummarySort}
                      values={summaryUniqueValues.days}
                      selectedValues={summaryColumnFilters.days}
                      onFilterChange={handleSummaryFilter}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              {showEmployeesTable && (
                <TableBody>
                  {displayedEmployeesSummary.map((employee) => (
                    <TableRow key={employee.name}>
                      <TableCell className="w-10" />
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.calls}</TableCell>
                      <TableCell>{employee.days}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
            </div>
          )}

          {displayOrders.length === 0 ? (
            <EmptyState message="Нет вызовов за выбранный период" description="Измените период или создайте новый приказ" />
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
                      field="call_date"
                      label="Дата вызова"
                      currentSorts={sortConfigs}
                      onSortChange={handleSort}
                      values={uniqueValues.call_date}
                      selectedValues={columnFilters.call_date}
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
                  const extra = (order.extra_fields || {}) as Record<string, unknown>
                  const isGroup = order.is_group

                  return (
                    <>
                      <TableRow key={order.id}>
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
                            callPeriodLabel(extra)
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
                          type="weekend"
                          orderNumber={order.order_number}
                        />
                      )}
                    </>
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
