import { useCallback, useEffect, useMemo, useState } from "react"
import type { Dispatch, ReactElement, SetStateAction } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { Employee } from "@/entities/employee/types"
import type { GroupEmployeeInfo, Order, OrderType } from "@/entities/order/types"
import {
  useAllOrderTypes,
  useDeleteOrder,
  useOrders,
} from "@/entities/order/useOrders"
import {
  useCommitGroupDraft,
  useCommitOrderDraft,
  useCreateGroupDraft,
  useCreateOrderDraft,
  useDeleteOrderDraft,
} from "@/entities/order/useOnlyOffice"
import {
  openDraftEditorWindow,
  subscribeDraftOrderSave,
} from "@/entities/order/draftOrderSaveChannel"
import { openOrderPrint } from "@/entities/order/orderActions"
import { failPrintPlaceholder } from "@/shared/utils/print-window"
import {
  useTableQueryEngine,
  type SortConfig,
} from "@/shared/hooks/useTableQueryEngine"
import { nextMultiSortConfigs } from "@/shared/lib/multiSort"
import { draftEditorUrl } from "@/entities/draft"
import {
  fetchDraftEmployee,
  toDraftEmployeeRefs,
  useDraftRecoveryFor,
  useFillDraftIdRestore,
} from "@/entities/form-draft"
import {
  buildMainSortDefs,
  buildMainUniqueValues,
  buildSummaryRows,
  calcDays,
  calculateVacationEnd,
  defaultPeriodEndIso,
  defaultPeriodStartIso,
  displayGroupEmployees,
  getApiErrorDetail,
  intersectsPeriod,
  mainFilterPredicate,
  totalDaysOf,
  type MainField,
} from "./lib"
import type {
  AbsencePageConfig,
  CallMode,
  GroupEmployeeRow,
  GroupFormDraft,
  GroupFormValues,
  MutationUiState,
  SingleFormDraft,
  SingleFormValues,
  SummaryDisplayRow,
} from "./types"

type SummaryField = "name" | "second" | "third"

export interface AbsenceOrdersApi {
  config: AbsencePageConfig
  orderTypes: OrderType[]
  orderType: OrderType | null
  orders: Order[]
  isLoading: boolean

  // Одиночная форма
  selectedEmployee: Employee | null
  setSelectedEmployee: Dispatch<SetStateAction<Employee | null>>
  orderDate: string
  setOrderDate: (value: string) => void
  orderNumber: string
  setOrderNumber: (value: string) => void
  mode: CallMode
  setMode: (value: CallMode) => void
  vacationStart: string
  setVacationStart: (value: string) => void
  vacationEnd: string
  setVacationEnd: (value: string) => void
  vacationDays: string
  setVacationDays: (value: string) => void
  callDate: string
  setCallDate: (value: string) => void
  callDateStart: string
  setCallDateStart: (value: string) => void
  callDateEnd: string
  setCallDateEnd: (value: string) => void
  errors: Record<string, string>
  setErrors: Dispatch<SetStateAction<Record<string, string>>>
  draftId: string | null
  createDraftMutation: MutationUiState
  commitDraftMutation: MutationUiState
  deleteDraftMutation: MutationUiState
  resetForm: () => void
  handleEditBeforeCreate: () => void
  handleCommitDraft: (openPrint?: boolean, printTarget?: string) => void
  recoveryOverwriteDialog: ReactElement

  // Групповая форма
  orderMode: "single" | "group"
  setOrderMode: (value: "single" | "group") => void
  groupEmployees: GroupEmployeeRow[]
  groupVacationStart: string
  setGroupVacationStartAndRecalc: (value: string) => void
  groupCallMode: CallMode
  setGroupCallMode: (value: CallMode) => void
  groupCallDate: string
  setGroupCallDate: (value: string) => void
  groupCallDateStart: string
  setGroupCallDateStart: (value: string) => void
  groupCallDateEnd: string
  setGroupCallDateEnd: (value: string) => void
  groupErrors: Record<string, string>
  groupDraftId: string | null
  createGroupOrderMutation: MutationUiState
  createGroupDraftMutation: MutationUiState
  commitGroupDraftMutation: MutationUiState
  addGroupEmployee: (employee: Employee) => void
  removeGroupEmployee: (employeeId: number) => void
  updateGroupEmployeeDays: (employeeId: number, rawValue: string) => void
  resetGroupForm: () => void
  handleCreateGroupDraft: () => void
  handleCommitGroupDraft: () => void
  groupRecoveryOverwriteDialog: ReactElement

  // Список приказов
  employeeFilter: string
  setEmployeeFilter: (value: string) => void
  periodMode: "calendarYear" | "all"
  setPeriodMode: (value: "calendarYear" | "all") => void
  periodStart: string
  setPeriodStart: (value: string) => void
  periodEnd: string
  setPeriodEnd: (value: string) => void
  setCalendarYearPeriod: () => void
  setAllPeriod: () => void
  periodError: string
  totalOrders: number
  totalDays: number
  employeesSummary: SummaryDisplayRow[]
  displayedEmployeesSummary: SummaryDisplayRow[]
  summaryUniqueValues: Record<SummaryField, string[]>
  summarySortConfigs: SortConfig<SummaryField>[]
  summaryColumnFilters: Record<SummaryField, Set<string>>
  handleSummarySort: (field: SummaryField) => void
  handleSummaryFilter: (field: SummaryField, selected: Set<string>) => void
  displayOrders: Order[]
  uniqueValues: Record<string, string[]>
  columnFilters: Record<MainField, Set<string>>
  setColumnFilters: Dispatch<SetStateAction<Record<MainField, Set<string>>>>
  sortConfigs: SortConfig<MainField>[]
  handleSort: (field: MainField) => void
  getDisplayGroupEmployees: (order: Order) => GroupEmployeeInfo[]
  deleteOrderId: number | null
  setDeleteOrderId: (value: number | null) => void
  handleDeleteOrderConfirm: () => void
  showEmployeesTable: boolean
  setShowEmployeesTable: (value: boolean) => void
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0]
}

export function useAbsenceOrdersPage(config: AbsencePageConfig): AbsenceOrdersApi {
  const queryClient = useQueryClient()

  // ==== Данные ====
  const { data: orderTypesData = [] } = useAllOrderTypes()
  const orderTypes = orderTypesData
  const orderType = orderTypes.find((item) => item.code === config.orderTypeCode) ?? null

  const { data, isLoading } = useOrders({
    page: 1,
    per_page: 1000,
    order_type_code: config.orderTypeCode,
  })

  // ==== Одиночная форма ====
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [orderDate, setOrderDate] = useState(todayIso())
  const [orderNumber, setOrderNumber] = useState("")
  const [mode, setMode] = useState<CallMode>("single")
  const [vacationStart, setVacationStart] = useState("")
  const [vacationEnd, setVacationEnd] = useState("")
  const [vacationDays, setVacationDays] = useState("")
  const [callDate, setCallDate] = useState("")
  const [callDateStart, setCallDateStart] = useState("")
  const [callDateEnd, setCallDateEnd] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draftId, setDraftId] = useState<string | null>(null)

  const singleValues: SingleFormValues = useMemo(() => ({
    employee_id: selectedEmployee?.id ?? null,
    order_date: orderDate,
    order_number: orderNumber,
    mode,
    vacation_start: vacationStart,
    vacation_end: vacationEnd,
    vacation_days: vacationDays,
    call_date: callDate,
    call_date_start: callDateStart,
    call_date_end: callDateEnd,
  }), [
    selectedEmployee, orderDate, orderNumber, mode,
    vacationStart, vacationEnd, vacationDays,
    callDate, callDateStart, callDateEnd,
  ])

  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()
  const deleteDraftMutation = useDeleteOrderDraft()
  const deleteMutation = useDeleteOrder()

  // Автоподсчёт дней из диапазона (только «Отпуск за свой счёт»).
  useEffect(() => {
    if (config.single.kind !== "vacation") return
    if (!vacationStart || !vacationEnd) return
    const computed = calcDays(vacationStart, vacationEnd)
    if (computed) setVacationDays(computed)
  }, [vacationStart, vacationEnd, config.single.kind])

  // Восстановление несохранённого заполнения одиночной формы (#28)
  const handleSingleRecoveryRestore = useCallback((draft: SingleFormDraft) => {
    if (draft.employee_id) {
      fetchDraftEmployee(queryClient, draft.employee_id).then((employee) => {
        if (employee) setSelectedEmployee(employee)
      })
    }
    if (draft.order_date) setOrderDate(draft.order_date)
    if (draft.order_number) setOrderNumber(draft.order_number)
    if (draft.mode === "single" || draft.mode === "range") setMode(draft.mode)
    if (draft.vacation_start) setVacationStart(draft.vacation_start)
    if (draft.vacation_end) setVacationEnd(draft.vacation_end)
    if (draft.vacation_days) setVacationDays(draft.vacation_days)
    if (draft.call_date) setCallDate(draft.call_date)
    if (draft.call_date_start) setCallDateStart(draft.call_date_start)
    if (draft.call_date_end) setCallDateEnd(draft.call_date_end)
  }, [queryClient])

  const {
    clear: recoveryClear,
    overwriteDialog: recoveryOverwriteDialog,
  } = useDraftRecoveryFor<SingleFormDraft>({
    slot: config.recoverySlot,
    formState: singleValues,
    hasContent: config.single.hasContent,
    onRestore: handleSingleRecoveryRestore,
  })

  const resetForm = useCallback(() => {
    if (draftId) {
      deleteDraftMutation.mutate(draftId)
    }
    setSelectedEmployee(null)
    setOrderDate(todayIso())
    setOrderNumber("")
    setMode("single")
    setVacationStart("")
    setVacationEnd("")
    setVacationDays("")
    setCallDate("")
    setCallDateStart("")
    setCallDateEnd("")
    setDraftId(null)
    setErrors({})
    recoveryClear()
  }, [draftId, deleteDraftMutation, recoveryClear])

  const validate = useCallback((): boolean => {
    const nextErrors = config.single.validate(singleValues, orderType !== null)
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }, [config.single.validate, singleValues, orderType])

  const handleEditBeforeCreate = useCallback(() => {
    if (!validate() || !orderType || !selectedEmployee) return
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(
      {
        employee_id: selectedEmployee.id,
        order_type_id: orderType.id,
        order_date: orderDate,
        order_number: orderNumber,
        extra_fields: config.single.buildExtraFields(singleValues),
      },
      {
        onSuccess: (draft) => {
          setDraftId(draft.draft_id)
          if (config.single.clearLocalDraftOnCreate) {
            recoveryClear()
          }
          const url = draftEditorUrl(draft.draft_id)
          if (editorWindow && !editorWindow.closed) {
            editorWindow.location.href = url
          } else {
            openDraftEditorWindow(url)
          }
        },
        onError: () => {
          editorWindow?.close()
        },
      },
    )
  }, [validate, orderType, selectedEmployee, createDraftMutation, orderDate, orderNumber, config, singleValues, recoveryClear])

  const handleCommitDraft = useCallback((openPrint = false, printTarget?: string) => {
    if (!draftId || commitDraftMutation.isPending) return
    if (!validate() || !orderType || !selectedEmployee) {
      failPrintPlaceholder(printTarget, "Не заполнены обязательные поля формы. Проверьте страницу и повторите.")
      return
    }
    commitDraftMutation.mutate(
      draftId,
      {
        onSuccess: (order) => {
          if (openPrint && order?.id) {
            openOrderPrint(order.id, printTarget || "_blank")
          } else if (openPrint) {
            failPrintPlaceholder(printTarget, "Приказ создан, но не получен ID для печати.")
          }
          resetForm()
        },
        onError: (err) => {
          failPrintPlaceholder(printTarget, getApiErrorDetail(err, "Ошибка создания приказа"))
        },
      },
    )
  }, [draftId, commitDraftMutation, validate, orderType, selectedEmployee, resetForm])

  useEffect(() => {
    return subscribeDraftOrderSave(draftId, (message) => {
      handleCommitDraft(Boolean(message.openPrint), message.printWindowName)
    })
  }, [draftId, handleCommitDraft])

  // ==== Групповая форма ====
  const [groupDraftId, setGroupDraftId] = useState<string | null>(null)
  const [orderMode, setOrderMode] = useState<"single" | "group">("single")
  const [groupEmployees, setGroupEmployees] = useState<GroupEmployeeRow[]>([])
  const [groupVacationStart, setGroupVacationStart] = useState("")
  const [groupCallMode, setGroupCallMode] = useState<CallMode>("single")
  const [groupCallDate, setGroupCallDate] = useState("")
  const [groupCallDateStart, setGroupCallDateStart] = useState("")
  const [groupCallDateEnd, setGroupCallDateEnd] = useState("")
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({})

  const createGroupDraftMutation = useCreateGroupDraft()
  const commitGroupDraftMutation = useCommitGroupDraft()
  const createGroupOrderMutation = config.useCreateGroupOrder()

  const groupFormValues: GroupFormValues = useMemo(() => ({
    order_date: orderDate,
    order_number: orderNumber,
    mode: groupCallMode,
    group_vacation_start: groupVacationStart,
    call_date: groupCallDate,
    call_date_start: groupCallDateStart,
    call_date_end: groupCallDateEnd,
  }), [orderDate, orderNumber, groupCallMode, groupVacationStart, groupCallDate, groupCallDateStart, groupCallDateEnd])

  const groupFormState: Omit<GroupFormDraft, "saved_at"> = useMemo(() => ({
    ...groupFormValues,
    employees: toDraftEmployeeRefs(groupEmployees),
  }), [groupFormValues, groupEmployees])

  const handleGroupRecoveryRestore = useCallback((draft: GroupFormDraft) => {
    setOrderMode("group")
    if (draft.order_date) setOrderDate(draft.order_date)
    if (draft.order_number) setOrderNumber(draft.order_number)
    if (draft.mode === "single" || draft.mode === "range") setGroupCallMode(draft.mode)
    if (draft.group_vacation_start) setGroupVacationStart(draft.group_vacation_start)
    if (draft.call_date) setGroupCallDate(draft.call_date)
    if (draft.call_date_start) setGroupCallDateStart(draft.call_date_start)
    if (draft.call_date_end) setGroupCallDateEnd(draft.call_date_end)
    if (draft.employees && draft.employees.length > 0) {
      config.group.hydrateEmployees(queryClient, draft.employees, draft)
        .then(setGroupEmployees)
        .catch(() => {})
    }
  }, [queryClient, config.group.hydrateEmployees])

  const {
    clear: groupRecoveryClear,
    overwriteDialog: groupRecoveryOverwriteDialog,
  } = useDraftRecoveryFor<GroupFormDraft>({
    slot: config.groupRecoverySlot,
    formState: groupFormState,
    hasContent: config.group.hasContent,
    onRestore: handleGroupRecoveryRestore,
  })

  // «Заполнить поля» из попапа черновиков: /unpaid-leaves?fillDraftId=… (тот же
  // общий хендлер восстановления, что и для локального черновика).
  useFillDraftIdRestore(handleGroupRecoveryRestore, config.group.mapFillDraft, config.fillDraftRoute)

  const addGroupEmployee = useCallback((employee: Employee) => {
    if (groupEmployees.some((e) => e.employee_id === employee.id)) return
    const defaultDays = config.group.defaultEmployeeDays(singleValues)
    setGroupEmployees((prev) => [
      ...prev,
      {
        employee_id: employee.id,
        vacation_days: defaultDays,
        employee,
        vacation_end_calculated:
          config.group.kind === "vacation" && groupVacationStart
            ? calculateVacationEnd(groupVacationStart, defaultDays)
            : "",
      },
    ])
  }, [groupEmployees, config.group, groupVacationStart, singleValues])

  const removeGroupEmployee = useCallback((employeeId: number) => {
    setGroupEmployees((prev) => prev.filter((e) => e.employee_id !== employeeId))
  }, [])

  const updateGroupEmployeeDays = useCallback((employeeId: number, rawValue: string) => {
    const days = rawValue ? Number(rawValue) : 0
    setGroupEmployees((prev) =>
      prev.map((e) =>
        e.employee_id === employeeId
          ? {
              ...e,
              vacation_days: days > 0 ? days : 0,
              vacation_end_calculated: groupVacationStart && days > 0
                ? calculateVacationEnd(groupVacationStart, days)
                : "",
            }
          : e
      )
    )
  }, [groupVacationStart])

  const setGroupVacationStartAndRecalc = useCallback((value: string) => {
    setGroupVacationStart(value)
    setGroupEmployees((prev) =>
      prev.map((e) => ({
        ...e,
        vacation_end_calculated: value ? calculateVacationEnd(value, e.vacation_days) : "",
      }))
    )
  }, [])

  const resetGroupForm = useCallback(() => {
    setGroupEmployees([])
    setGroupVacationStart("")
    setGroupCallMode("single")
    setGroupCallDate("")
    setGroupCallDateStart("")
    setGroupCallDateEnd("")
    setOrderNumber("")
    setOrderDate(todayIso())
    if (config.group.resetClearsDraftId) {
      setGroupDraftId(null)
    }
    setGroupErrors({})
    groupRecoveryClear()
  }, [config.group.resetClearsDraftId, groupRecoveryClear])

  const validateGroup = useCallback((): boolean => {
    const nextErrors = config.group.validate(groupFormValues, groupEmployees, orderType !== null)
    setGroupErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }, [config.group.validate, groupFormValues, groupEmployees, orderType])

  const handleCreateGroupDraft = useCallback(() => {
    if (!validateGroup()) return
    if (config.group.requireOrderType && !orderType) return
    const editorWindow = window.open("about:blank", "_blank")
    createGroupDraftMutation.mutate(
      config.group.buildGroupDraft(groupFormValues, groupEmployees),
      {
        onSuccess: (draft) => {
          setGroupDraftId(draft.draft_id)
          groupRecoveryClear()
          const url = draft.edit_url
          if (editorWindow && !editorWindow.closed) {
            editorWindow.location.href = url
          } else {
            openDraftEditorWindow(url)
          }
        },
        onError: () => {
          editorWindow?.close()
        },
      },
    )
  }, [validateGroup, config.group, orderType, createGroupDraftMutation, groupFormValues, groupEmployees, groupRecoveryClear])

  const handleCommitGroupDraft = useCallback(() => {
    if (!groupDraftId) return
    commitGroupDraftMutation.mutate(groupDraftId, {
      onSuccess: () => {
        setGroupDraftId(null)
        resetGroupForm()
      },
    })
  }, [groupDraftId, commitGroupDraftMutation, resetGroupForm])

  useEffect(() => {
    return subscribeDraftOrderSave(groupDraftId, () => {
      handleCommitGroupDraft()
    })
  }, [groupDraftId, handleCommitGroupDraft])

  // ==== Список и сводка ====
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [showEmployeesTable, setShowEmployeesTable] = useState(true)

  const [employeeFilter, setEmployeeFilter] = useState("")
  const [periodMode, setPeriodMode] = useState<"calendarYear" | "all">("calendarYear")
  const [periodStart, setPeriodStart] = useState(defaultPeriodStartIso())
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEndIso())

  const orders = data?.items ?? []
  const periodError = periodStart && periodEnd && periodEnd < periodStart
    ? "Дата конца раньше даты начала"
    : ""

  const entries = useMemo(
    () => orders.flatMap((order) => config.toEntries(order)),
    [orders, config.toEntries],
  )

  const normalizedEmployeeFilter = employeeFilter.trim().toLowerCase()

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (normalizedEmployeeFilter && !entry.employeeName.toLowerCase().includes(normalizedEmployeeFilter)) return false
      return intersectsPeriod(entry.range, periodStart, periodEnd)
    })
  }, [entries, normalizedEmployeeFilter, periodStart, periodEnd])

  const filteredOrderIds = useMemo(() => new Set(filteredEntries.map((entry) => entry.orderId)), [filteredEntries])
  const filteredOrders = useMemo(() => orders.filter((order) => filteredOrderIds.has(order.id)), [orders, filteredOrderIds])

  const [sortConfigs, setSortConfigs] = useState<SortConfig<MainField>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<MainField, Set<string>>>({
    order_number: new Set(),
    employee_name: new Set(),
    order_date: new Set(),
    period: new Set(),
    days: new Set(),
    call_date: new Set(),
  })

  const handleSort = useCallback((field: MainField) => {
    const defaultOrder = field === "employee_name" ? "asc" : "desc"
    setSortConfigs((prev) => nextMultiSortConfigs(prev, field, defaultOrder))
  }, [])

  const sortDefs = useMemo(() => buildMainSortDefs(config.kind), [config.kind])
  const localFilterPredicate = useMemo(
    () => mainFilterPredicate(config.kind, columnFilters),
    [config.kind, columnFilters],
  )
  const uniqueValues = useMemo(
    () => buildMainUniqueValues(config.kind, filteredOrders),
    [config.kind, filteredOrders],
  )

  const engineResult = useTableQueryEngine({
    rows: filteredOrders ?? [],
    getId: (order) => order.id,
    searchQuery: "",
    filterPredicate: localFilterPredicate,
    sortConfigs,
    sortDefs,
  })
  const displayOrders = engineResult.rows

  const getDisplayGroupEmployees = useCallback(
    (order: Order) => displayGroupEmployees(config.kind, order, columnFilters, sortConfigs),
    [config.kind, columnFilters, sortConfigs],
  )

  const totalOrders = filteredEntries.length
  const totalDays = totalDaysOf(filteredEntries, periodStart, periodEnd)

  const summaryRows = useMemo(
    () => buildSummaryRows(filteredEntries, periodStart, periodEnd),
    [filteredEntries, periodStart, periodEnd],
  )

  const employeesSummary: SummaryDisplayRow[] = useMemo(() => {
    const rows = summaryRows.map((r) => ({
      name: r.name,
      second: config.kind === "vacation" ? r.days : r.count,
      third: config.kind === "vacation" ? r.count : r.days,
    }))
    // Исходная сортировка — по второму столбцу (unpaid: дней, weekend: вызовов).
    rows.sort((a, b) => b.second - a.second)
    return rows
  }, [summaryRows, config.kind])

  const [summarySortConfigs, setSummarySortConfigs] = useState<SortConfig<SummaryField>[]>([])
  const [summaryColumnFilters, setSummaryColumnFilters] = useState<Record<SummaryField, Set<string>>>({
    name: new Set(),
    second: new Set(),
    third: new Set(),
  })

  const handleSummarySort = useCallback((field: SummaryField) => {
    const defaultOrder = field === "name" ? "asc" : "desc"
    setSummarySortConfigs((prev) => nextMultiSortConfigs(prev, field, defaultOrder))
  }, [])
  const handleSummaryFilter = useCallback((field: SummaryField, selected: Set<string>) => {
    setSummaryColumnFilters((prev) => ({ ...prev, [field]: selected }))
  }, [])

  const summaryUniqueValues: Record<SummaryField, string[]> = {
    name: [...new Set(employeesSummary.map((e) => e.name))].sort(),
    second: [...new Set(employeesSummary.map((e) => String(e.second)))].sort((a, b) => Number(b) - Number(a)),
    third: [...new Set(employeesSummary.map((e) => String(e.third)))].sort((a, b) => Number(b) - Number(a)),
  }

  const displayedEmployeesSummary: SummaryDisplayRow[] = useMemo(() => {
    let rows = employeesSummary
    if (summaryColumnFilters.name.size > 0) rows = rows.filter((e) => summaryColumnFilters.name.has(e.name))
    if (summaryColumnFilters.second.size > 0) rows = rows.filter((e) => summaryColumnFilters.second.has(String(e.second)))
    if (summaryColumnFilters.third.size > 0) rows = rows.filter((e) => summaryColumnFilters.third.has(String(e.third)))
    if (summarySortConfigs.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const sc of summarySortConfigs) {
          let cmp = 0
          if (sc.field === "name") cmp = a.name.localeCompare(b.name, "ru")
          else if (sc.field === "second") cmp = a.second - b.second
          else if (sc.field === "third") cmp = a.third - b.third
          if (sc.order === "desc") cmp = -cmp
          if (cmp !== 0) return cmp
        }
        return 0
      })
    }
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesSummary, summarySortConfigs, summaryColumnFilters])

  const setCalendarYearPeriod = useCallback(() => {
    setPeriodMode("calendarYear")
    setPeriodStart(defaultPeriodStartIso())
    setPeriodEnd(defaultPeriodEndIso())
  }, [])

  const setAllPeriod = useCallback(() => {
    setPeriodMode("all")
    setPeriodStart("")
    setPeriodEnd("")
  }, [])

  const handleDeleteOrderConfirm = useCallback(() => {
    if (deleteOrderId) deleteMutation.mutate(deleteOrderId)
    setDeleteOrderId(null)
  }, [deleteOrderId, deleteMutation])

  return {
    config,
    orderTypes,
    orderType,
    orders,
    isLoading,

    selectedEmployee,
    setSelectedEmployee,
    orderDate,
    setOrderDate,
    orderNumber,
    setOrderNumber,
    mode,
    setMode,
    vacationStart,
    setVacationStart,
    vacationEnd,
    setVacationEnd,
    vacationDays,
    setVacationDays,
    callDate,
    setCallDate,
    callDateStart,
    setCallDateStart,
    callDateEnd,
    setCallDateEnd,
    errors,
    setErrors,
    draftId,
    createDraftMutation,
    commitDraftMutation,
    deleteDraftMutation,
    resetForm,
    handleEditBeforeCreate,
    handleCommitDraft,
    recoveryOverwriteDialog,

    orderMode,
    setOrderMode,
    groupEmployees,
    groupVacationStart,
    setGroupVacationStartAndRecalc,
    groupCallMode,
    setGroupCallMode,
    groupCallDate,
    setGroupCallDate,
    groupCallDateStart,
    setGroupCallDateStart,
    groupCallDateEnd,
    setGroupCallDateEnd,
    groupErrors,
    groupDraftId,
    createGroupOrderMutation,
    createGroupDraftMutation,
    commitGroupDraftMutation,
    addGroupEmployee,
    removeGroupEmployee,
    updateGroupEmployeeDays,
    resetGroupForm,
    handleCreateGroupDraft,
    handleCommitGroupDraft,
    groupRecoveryOverwriteDialog,

    employeeFilter,
    setEmployeeFilter,
    periodMode,
    setPeriodMode,
    periodStart,
    setPeriodStart,
    periodEnd,
    setPeriodEnd,
    setCalendarYearPeriod,
    setAllPeriod,
    periodError,
    totalOrders,
    totalDays,
    employeesSummary,
    displayedEmployeesSummary,
    summaryUniqueValues,
    summarySortConfigs,
    summaryColumnFilters,
    handleSummarySort,
    handleSummaryFilter,
    displayOrders,
    uniqueValues,
    columnFilters,
    setColumnFilters,
    sortConfigs,
    handleSort,
    getDisplayGroupEmployees,
    deleteOrderId,
    setDeleteOrderId,
    handleDeleteOrderConfirm,
    showEmployeesTable,
    setShowEmployeesTable,
  }
}
