import { useState, useEffect, useRef, useMemo, Fragment } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Download, X, Check, ChevronDown, ChevronRight, Settings, Eye, Trash2, ScrollText, FilePen, Search, Filter, Printer, FileText } from "lucide-react"
import { GroupOrderEmployeesRows } from "@/entities/order/ui/GroupOrderEmployeesRows"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { YearFilter } from "@/shared/ui/year-filter"
import { Badge } from "@/shared/ui/badge"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import { GlobalAuditLog } from "@/features/global-audit-log"
import {
  Tabs,
  TabsList,
  TabsTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import {
  useOrders,
  useOrderYears,
  useOrderTypes,
  useAllOrderTypes,
  useCreateOrder,
  useDeleteOrder,
  useOrderDeletionPreview,
} from "@/entities/order/useOrders"
import { useEmployee } from "@/entities/employee/useEmployees"
import { useCommitOrderDraft, useCreateOrderDraft } from "@/entities/order/useOnlyOffice"
import { downloadOrderDocx, openOrderEdit, openOrderPrint, openOrderView } from "@/entities/order/orderActions"
import { OrderNumberField } from "@/features/OrderNumberField"
import { EmployeeSearch } from "@/features/employee-search"
import { DocumentModal } from "@/features/document-modal/DocumentModal"
import { ContractRegistryModal } from "@/pages/ContractRegistryPage"
import type { Employee } from "@/entities/employee/types"
import type { Order, OrderType } from "@/entities/order/types"
import { SortableFilterHeader } from "@/shared/ui/SortableFilterHeader"
import { getUserAccessLevel } from "@/shared/api/axios"
import { useTableQueryEngine, type ColumnSortDef, type SortConfig } from "@/shared/hooks/useTableQueryEngine"
import { nextMultiSortConfigs } from "@/shared/lib/multiSort"
import {
  useAutoFillFields,
  FieldRenderer,
  FieldGroup,
  type FieldSchema,
} from "@/features/dynamic-form"
import { getOrderTypeLayout } from "@/entities/order/orderTypeLayouts"

const ORDER_TYPE_BADGE_COLORS: Record<string, string> = {
  "Прием на работу": "bg-green-100 text-green-800 border-green-200",
  "Увольнение": "bg-red-100 text-red-800 border-red-200",
  "Отпуск трудовой": "bg-blue-100 text-blue-800 border-blue-200",
  "Отпуск за свой счет": "bg-orange-100 text-orange-800 border-orange-200",
  "Вызов в выходной": "bg-pink-100 text-pink-800 border-pink-200",
  "Больничный": "bg-purple-100 text-purple-800 border-purple-200",
  "Перевод": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Продление контракта": "bg-yellow-100 text-yellow-800 border-yellow-200",
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function OrderDeletePreview({ orderId }: { orderId: number | null }) {
  const { data: preview, isLoading } = useOrderDeletionPreview(orderId)

  if (isLoading || !preview) {
    return <div className="text-sm text-muted-foreground">Загрузка...</div>
  }

  return (
    <div className="space-y-2">
      <div className="text-sm">
        <span className="text-muted-foreground">Приказ:</span> {preview.order_number} ({preview.order_type_name})
      </div>
      {preview.employee_name && (
        <div className="text-sm">
          <span className="text-muted-foreground">Сотрудник:</span> {preview.employee_name}
        </div>
      )}
      <div className="text-sm">
        <span className="text-muted-foreground">Дата:</span> {preview.order_date}
      </div>
      {preview.warnings.length > 0 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md space-y-1">
          <div className="text-sm font-medium text-amber-800">⚠ Будут удалены связанные данные:</div>
          {preview.warnings.map((w, i) => (
            <div key={i} className="text-sm text-amber-700">• {w}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OrdersPage() {
  const isViewer = getUserAccessLevel() === "viewer"
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Load active filters from localStorage helper
  const getSavedFilter = <T,>(key: string, defaultValue: T): T => {
    const saved = localStorage.getItem("hrms_active_filters")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed[key] !== undefined) return parsed[key]
      } catch (e) {
        console.error(`Failed to parse filter key ${key}`, e)
      }
    }
    return defaultValue
  }

  const [year, setYear] = useState<number | undefined>(() => getSavedFilter("year", new Date().getFullYear()))
  const [collapsed, setCollapsed] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [filterCollapsed, setFilterCollapsed] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "general">("all")
  const [contractsOpen, setContractsOpen] = useState(false)
  const [contractRegistryOpen, setContractRegistryOpen] = useState(false)

  // Filter state
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(() => getSavedFilter("employee", null))
  const [filterOrderTypes, setFilterOrderTypes] = useState<OrderType[]>(() => getSavedFilter("orderTypes", []))
  const [filterOrderTypeSearch, setFilterOrderTypeSearch] = useState("")
  const [filterOrderTypeOpen, setFilterOrderTypeOpen] = useState(false)
  const [filterOrderNumber, setFilterOrderNumber] = useState(() => getSavedFilter("orderNumber", ""))
  const [filterDateFrom, setFilterDateFrom] = useState(() => getSavedFilter("dateFrom", ""))
  const [filterDateTo, setFilterDateTo] = useState(() => getSavedFilter("dateTo", ""))
  const [filterLetter, setFilterLetter] = useState<string | undefined>(() => getSavedFilter("letter", undefined))
  const [filterLS, setFilterLS] = useState<boolean>(() => getSavedFilter("ls", false))
  const [filterShowGeneral, setFilterShowGeneral] = useState<boolean>(() => getSavedFilter("showGeneral", false))
  const filterOrderTypeRef = useRef<HTMLDivElement>(null)

  const [sortConfigs, setSortConfigs] = useState<SortConfig<string>[]>([])
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({})

  interface FilterPreset {
    id: string
    name: string
    filters: {
      year?: number
      employee: Employee | null
      orderTypes: OrderType[]
      orderNumber: string
      dateFrom: string
      dateTo: string
      letter?: string
      ls: boolean
      showGeneral: boolean
    }
  }

  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [isSavingPreset, setIsSavingPreset] = useState(false)
  const [newPresetName, setNewPresetName] = useState("")
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(() => {
    return localStorage.getItem("hrms_active_preset_id")
  })
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null)

  // Load presets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("hrms_order_filter_presets")
    if (saved) {
      try {
        setPresets(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse filter presets", e)
      }
    }
  }, [])

  // Save presets to localStorage
  const savePresetsToStorage = (newPresets: FilterPreset[]) => {
    setPresets(newPresets)
    localStorage.setItem("hrms_order_filter_presets", JSON.stringify(newPresets))
  }

  // Save active filters to localStorage on change
  useEffect(() => {
    const activeFilters = {
      year,
      employee: filterEmployee,
      orderTypes: filterOrderTypes,
      orderNumber: filterOrderNumber,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      letter: filterLetter,
      ls: filterLS,
      showGeneral: filterShowGeneral,
    }
    localStorage.setItem("hrms_active_filters", JSON.stringify(activeFilters))
  }, [
    year,
    filterEmployee,
    filterOrderTypes,
    filterOrderNumber,
    filterDateFrom,
    filterDateTo,
    filterLetter,
    filterLS,
    filterShowGeneral,
  ])

  const handleSavePresetConfirm = () => {
    if (!newPresetName.trim()) return

    const newPresetId = Date.now().toString()
    const newPreset: FilterPreset = {
      id: newPresetId,
      name: newPresetName.trim(),
      filters: {
        year,
        employee: filterEmployee,
        orderTypes: filterOrderTypes,
        orderNumber: filterOrderNumber,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        letter: filterLetter,
        ls: filterLS,
        showGeneral: filterShowGeneral,
      },
    }

    savePresetsToStorage([...presets, newPreset])
    setNewPresetName("")
    setIsSavingPreset(false)
    setAppliedPresetId(newPresetId)
    localStorage.setItem("hrms_active_preset_id", newPresetId)
  }

  const handleSavePresetCancel = () => {
    setNewPresetName("")
    setIsSavingPreset(false)
  }

  const handleApplyPreset = (preset: FilterPreset) => {
    setYear(preset.filters.year)
    setFilterEmployee(preset.filters.employee)
    setFilterOrderTypes(preset.filters.orderTypes || [])
    setFilterOrderNumber(preset.filters.orderNumber || "")
    setFilterDateFrom(preset.filters.dateFrom || "")
    setFilterDateTo(preset.filters.dateTo || "")
    setFilterLetter(preset.filters.letter)
    setFilterLS(preset.filters.ls || false)
    setFilterShowGeneral(preset.filters.showGeneral || false)
    setAppliedPresetId(preset.id)
    localStorage.setItem("hrms_active_preset_id", preset.id)
  }

  const handleDeletePresetClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletePresetId(id)
  }

  const handleConfirmDeletePreset = () => {
    if (!deletePresetId) return
    const filtered = presets.filter((p) => p.id !== deletePresetId)
    savePresetsToStorage(filtered)
    if (appliedPresetId === deletePresetId) {
      setAppliedPresetId(null)
      localStorage.removeItem("hrms_active_preset_id")
    }
    setDeletePresetId(null)
  }

  const toggleFilterOrderType = (type: OrderType) => {
    setFilterOrderTypes((prev) =>
      prev.some((t) => t.id === type.id)
        ? prev.filter((t) => t.id !== type.id)
        : [...prev, type]
    )
  }

  const presetFiltersMatch = (preset: FilterPreset) => {
    return (
      year === preset.filters.year &&
      filterEmployee?.id === preset.filters.employee?.id &&
      filterOrderNumber === preset.filters.orderNumber &&
      filterDateFrom === preset.filters.dateFrom &&
      filterDateTo === preset.filters.dateTo &&
      filterLetter === preset.filters.letter &&
      filterLS === preset.filters.ls &&
      filterShowGeneral === preset.filters.showGeneral &&
      filterOrderTypes.length === (preset.filters.orderTypes || []).length &&
      filterOrderTypes.every((t) =>
        (preset.filters.orderTypes || []).some((pt) => pt.id === t.id)
      )
    )
  }

  const isPresetActive = (preset: FilterPreset) => {
    return appliedPresetId === preset.id && presetFiltersMatch(preset)
  }

  // Auto reset appliedPresetId if filters change manually
  useEffect(() => {
    if (!appliedPresetId) return
    const activePreset = presets.find((p) => p.id === appliedPresetId)
    if (!activePreset || !presetFiltersMatch(activePreset)) {
      setAppliedPresetId(null)
      localStorage.removeItem("hrms_active_preset_id")
    }
  }, [
    year,
    filterEmployee,
    filterOrderTypes,
    filterOrderNumber,
    filterDateFrom,
    filterDateTo,
    filterLetter,
    filterLS,
    filterShowGeneral,
    presets,
    appliedPresetId,
  ])

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<number | null>(null)
  const [orderTypeSearch, setOrderTypeSearch] = useState("")
  const [orderTypeOpen, setOrderTypeOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [extraFields, setExtraFields] = useState<Record<string, string | number>>({})
  const [extraFieldErrors, setExtraFieldErrors] = useState<Record<string, string>>({})

  const orderTypeRef = useRef<HTMLDivElement>(null)

  // Debounce text search fields
  const debouncedOrderNumber = useDebounce(filterOrderNumber, 300)
  const debouncedFilterEmployeeId = useDebounce(filterEmployee?.id ?? null, 300)

  const { data, isLoading, error } = useOrders({
    page: 1,
    per_page: 1000,
    year,
    order_type_code: filterOrderTypes.length > 0 ? filterOrderTypes.map((t) => t.code).join(",") : undefined,
    order_letter: filterLetter,
    employee_id: debouncedFilterEmployeeId ?? undefined,
    date_from: filterDateFrom || undefined,
    date_to: filterDateTo || undefined,
    order_number: debouncedOrderNumber || undefined,
  })

  const LS_ORDER_CODES = ["hire", "dismissal", "contract_extension"]

  // General orders query
  const { data: generalOrdersData, isLoading: generalOrdersLoading } = useOrders({
    page: 1,
    per_page: 1000,
    year,
    order_type_code: "general_order",
    date_from: filterDateFrom || undefined,
    date_to: filterDateTo || undefined,
    order_number: debouncedOrderNumber || undefined,
  })

  // General order form state
  const [generalOrderDate, setGeneralOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [generalOrderNumber, setGeneralOrderNumber] = useState("")
  const [generalOrderErrors, setGeneralOrderErrors] = useState<Record<string, string>>({})
  const [generalDraftId, setGeneralDraftId] = useState<string | null>(null)

  // Apply client-side filters for the "all" tab list.
  const filteredData = useMemo(() => {
    if (!data?.items) return data
    let items = data.items
    if (!filterShowGeneral) {
      items = items.filter((order) => order.order_type_code !== "general_order")
    }
    if (filterLS) {
      items = items.filter((order) => LS_ORDER_CODES.includes(order.order_type_code))
    }
    return {
      ...data,
      items,
      total: items.length,
    }
  }, [data, filterLS, filterShowGeneral])

  const sortDefs: ColumnSortDef<Order, string>[] = useMemo(() => [
    { field: "order_number", getSortValue: (o) => o.order_number },
    { field: "order_type_name", getSortValue: (o) => o.order_type_name },
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
    { field: "order_date", getSortValue: (o) => o.order_date },
    { field: "created_date", getSortValue: (o) => o.created_date ?? "" },
  ], [])

  const localFilterPredicate = useMemo(() => {
    const hasFilters = Object.values(columnFilters).some((s) => s && s.size > 0)
    if (!hasFilters) return null
    return (row: Order) => {
      for (const [field, selected] of Object.entries(columnFilters)) {
        if (selected && selected.size > 0) {
          let val = ""
          if (field === "order_number") val = row.order_number
          else if (field === "order_type_name") val = row.order_type_name
          else if (field === "employee_name") {
            if (row.is_group && row.group_employees) {
              const hasMatchingEmployee = row.group_employees.some(e => selected.has(e.employee_full_name))
              if (!hasMatchingEmployee) return false
              continue
            } else {
              val = row.employee_name ?? "—"
            }
          }
          else if (field === "order_date") val = row.order_date ? new Date(row.order_date).toISOString().split("T")[0] : ""
          else if (field === "created_date") val = row.created_date ? new Date(row.created_date).toISOString().split("T")[0] : ""
          
          if (!selected.has(val)) return false
        }
      }
      return true
    }
  }, [columnFilters])

  const engineResult = useTableQueryEngine({
    rows: filteredData?.items ?? [],
    getId: (o) => o.id,
    searchQuery: "",
    filterPredicate: localFilterPredicate,
    sortConfigs,
    sortDefs,
  })
  const displayOrders = engineResult.rows

  const getDisplayGroupEmployees = (order: Order) => {
    if (!order.group_employees) return []
    
    // 1. Filter by employee_name if active
    const selectedNames = columnFilters.employee_name
    let filtered = order.group_employees
    if (selectedNames && selectedNames.size > 0) {
      filtered = filtered.filter(e => selectedNames.has(e.employee_full_name))
    }
    
    // 2. Sort by employee_name if active
    const empSort = sortConfigs.find(s => s.field === "employee_name")
    if (empSort) {
      const sorted = [...filtered].sort((a, b) => {
        const nameA = a.employee_full_name ?? ""
        const nameB = b.employee_full_name ?? ""
        return nameA.localeCompare(nameB, "ru")
      })
      if (empSort.order === "desc") {
        sorted.reverse()
      }
      return sorted
    }
    
    return filtered
  }

  const uniqueValues = useMemo(() => {
    const items = filteredData?.items ?? []
    const employeeNames = new Set<string>()
    items.forEach(o => {
      if (o.is_group && o.group_employees) {
        o.group_employees.forEach(e => {
          if (e.employee_full_name) employeeNames.add(e.employee_full_name)
        })
      } else if (o.employee_name) {
        employeeNames.add(o.employee_name)
      }
    })
    return {
      order_number: [...new Set(items.map(o => o.order_number))],
      order_type_name: [...new Set(items.map(o => o.order_type_name))],
      employee_name: [...employeeNames].sort((a, b) => a.localeCompare(b, "ru")),
      order_date: [...new Set(items.map(o => o.order_date ? new Date(o.order_date).toISOString().split("T")[0] : ""))].filter(Boolean),
      created_date: [...new Set(items.map(o => o.created_date ? new Date(o.created_date).toISOString().split("T")[0] : ""))].filter(Boolean),
    }
  }, [filteredData])

  const { data: years } = useOrderYears()
  const { data: orderTypes = [] } = useOrderTypes(true)
  const { data: allOrderTypes = [] } = useAllOrderTypes()
  const generalOrderType = orderTypes.find(t => t.code === "general_order") ?? null

  const availableTypes = useMemo(() => {
    return allOrderTypes.filter((t) => t.code !== "general_order" && t.show_in_orders_page)
  }, [allOrderTypes])

  const otherTypes = useMemo(() => {
    return allOrderTypes.filter((t) => t.code !== "general_order" && !t.show_in_orders_page)
  }, [allOrderTypes])

  const filteredAvailable = useMemo(() => {
    return availableTypes.filter((t) =>
      t.name.toLowerCase().includes(filterOrderTypeSearch.toLowerCase())
    )
  }, [availableTypes, filterOrderTypeSearch])

  const filteredOther = useMemo(() => {
    return otherTypes.filter((t) =>
      t.name.toLowerCase().includes(filterOrderTypeSearch.toLowerCase())
    )
  }, [otherTypes, filterOrderTypeSearch])
  const createMutation = useCreateOrder()
  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()
  const deleteMutation = useDeleteOrder()

  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)
  const [showDismissalDialog, setShowDismissalDialog] = useState(false)

  const [draftId, setDraftId] = useState<string | null>(null)

  // Read query params for pre-filtering
  const employeeIdParam = searchParams.get("employeeId")
  const orderTypeParam = searchParams.get("orderType")
  const { data: preselectedEmployeeData } = useEmployee(
    employeeIdParam ? Number.parseInt(employeeIdParam, 10) : 0
  )
  const selectedOrderType = orderTypes.find(item => item.id === selectedOrderTypeId) ?? null

  // Initialize from query params on mount
  useEffect(() => {
    if (preselectedEmployeeData) {
      setSelectedEmployee(preselectedEmployeeData)
    }
    if (orderTypeParam && orderTypes.length > 0) {
      const found = orderTypes.find(t => t.code === orderTypeParam)
      if (found) {
        setSelectedOrderTypeId(found.id)
        setOrderTypeSearch(found.name)
      }
    }
  }, [preselectedEmployeeData, orderTypeParam, orderTypes])

  useEffect(() => {
    const tabParam = searchParams.get("tab")
    if (tabParam === "general") {
      setActiveTab("general")
      return
    }
    setActiveTab("all")
  }, [searchParams])

  const handleDeleteOrderConfirm = () => {
    if (deleteOrderId) deleteMutation.mutate(deleteOrderId)
    setDeleteOrderId(null)
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orderTypeRef.current && !orderTypeRef.current.contains(e.target as Node)) {
        setOrderTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Reset extra fields when order type changes
  useEffect(() => {
    setExtraFields({})
    setExtraFieldErrors({})
  }, [selectedOrderTypeId])

  useAutoFillFields(selectedEmployee, selectedOrderType?.code, extraFields, setExtraFields)

  const filteredTypes = orderTypes.filter((t) =>
    t.code !== "general_order" && t.name.toLowerCase().includes(orderTypeSearch.toLowerCase())
  )

  const selectOrderType = (type: OrderType) => {
    setSelectedOrderTypeId(type.id)
    setOrderTypeSearch(type.name)
    setOrderTypeOpen(false)
  }

  const clearOrderType = () => {
    setSelectedOrderTypeId(null)
    setOrderTypeSearch("")
    setOrderNumber("")
  }

  const handleOrderTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && filteredTypes.length > 0 && orderTypeOpen) {
      e.preventDefault()
      selectOrderType(filteredTypes[0])
    }
  }

  const resetForm = () => {
    setSelectedEmployee(null)
    setSelectedOrderTypeId(null)
    setOrderTypeSearch("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setErrors({})
    setExtraFieldErrors({})
    setExtraFields({})
    setDraftId(null)
  }

  const resetGeneralForm = () => {
    setGeneralOrderDate(new Date().toISOString().split("T")[0])
    setGeneralOrderNumber("")
    setGeneralOrderErrors({})
    setGeneralDraftId(null)
  }

  const validateGeneralOrder = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!generalOrderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!generalOrderNumber) newErrors.orderNumber = "Укажите номер приказа"
    setGeneralOrderErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildGeneralOrderPayload = () => ({
    employee_id: null,
    order_type_id: generalOrderType?.id ?? 0,
    order_date: generalOrderDate,
    order_number: generalOrderNumber || undefined,
  })

  const handleGeneralEditBeforeCreate = () => {
    if (!validateGeneralOrder()) return
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(buildGeneralOrderPayload(), {
      onSuccess: (draft) => {
        setGeneralDraftId(draft.draft_id)
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
    })
  }

  const handleGeneralCommitDraft = () => {
    if (!generalDraftId || !validateGeneralOrder()) return
    commitDraftMutation.mutate(
      { draftId: generalDraftId, order: buildGeneralOrderPayload() },
      {
        onSuccess: () => {
          resetGeneralForm()
        },
      }
    )
  }

  useEffect(() => {
    const handleGeneralDraftSave = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const message = event.data as { type?: string; draftId?: string; openPrint?: boolean; printWindowName?: string }
      if (message.type !== "hrms:draft-order-save" || !message.draftId || message.draftId !== generalDraftId) return
      handleGeneralCommitDraft()
    }

    window.addEventListener("message", handleGeneralDraftSave)
    return () => window.removeEventListener("message", handleGeneralDraftSave)
  }, [generalDraftId, generalOrderDate, generalOrderNumber])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedEmployee) newErrors.employee = "Выберите сотрудника"
    if (!selectedOrderTypeId) newErrors.orderType = "Выберите тип приказа"
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"

    for (const field of selectedOrderType?.field_schema ?? []) {
      if (field.required && !extraFields[field.key]) {
        newErrors[`extra_${field.key}`] = `${field.label} обязательно`
      }
    }

    setErrors(newErrors)
    setExtraFieldErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildOrderPayload = () => {
    const cleanedExtraFields = Object.fromEntries(
      Object.entries(extraFields).filter(
        ([, value]) => value !== "" && value !== null && value !== undefined
      )
    )
    return {
      employee_id: selectedEmployee!.id,
      order_type_id: selectedOrderTypeId!,
      order_date: orderDate,
      order_number: orderNumber || undefined,
      extra_fields: Object.keys(cleanedExtraFields).length > 0 ? cleanedExtraFields : undefined,
    }
  }

  const handleEditBeforeCreate = () => {
    if (!validate()) return
    if (selectedOrderType?.name === "Увольнение") {
      setShowDismissalDialog(true)
      return
    }
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(buildOrderPayload(), {
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
    })
  }

  const handleConfirmDismissal = () => {
    setShowDismissalDialog(false)
    const editorWindow = window.open("about:blank", "_blank")
    createDraftMutation.mutate(buildOrderPayload(), {
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
    })
  }

  const handleCommitDraft = (openPrint = false, printTarget?: string) => {
    if (!draftId || !validate()) return
    commitDraftMutation.mutate(
      { draftId, order: buildOrderPayload() },
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
  }, [draftId, selectedEmployee, selectedOrderTypeId, orderDate, orderNumber])

  const isPending = createMutation.isPending || createDraftMutation.isPending || commitDraftMutation.isPending

  // Compute active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterEmployee) count++
    if (filterOrderTypes.length > 0) count++
    if (filterOrderNumber) count++
    if (filterDateFrom) count++
    if (filterDateTo) count++
    if (year) count++
    if (filterLetter) count++
    if (filterLS) count++
    return count
  }, [filterEmployee, filterOrderTypes, filterOrderNumber, filterDateFrom, filterDateTo, year, filterLetter, filterLS])

  const clearFilters = () => {
    setFilterEmployee(null)
    setFilterOrderTypes([])
    setFilterOrderTypeSearch("")
    setFilterOrderNumber("")
    setFilterDateFrom("")
    setFilterDateTo("")
    setYear(new Date().getFullYear())
    setFilterLetter(undefined)
    setFilterLS(false)
    setFilterShowGeneral(false)
    setAppliedPresetId(null)
    localStorage.removeItem("hrms_active_preset_id")
  }

  // Close filter type dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterOrderTypeRef.current && !filterOrderTypeRef.current.contains(e.target as Node)) {
        setFilterOrderTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleTabsChange = (value: string) => {
    if (value === "all" || value === "general") {
      setActiveTab(value)
      navigate(value === "general" ? "/orders?tab=general" : "/orders")
      return
    }
    if (value === "notifications") {
      navigate("/orders/notifications")
      return
    }
    if (value === "statements") {
      navigate("/orders/statements")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Приказы</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setContractsOpen(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Контракты
          </Button>
          <Button variant="outline" size="sm" onClick={() => setContractRegistryOpen(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Реестр контрактов
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/templates")}>
            <Settings className="mr-2 h-4 w-4" />
            Типы и шаблоны
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAuditLogOpen(true)}>
            <ScrollText className="mr-2 h-4 w-4" />
            Журнал
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border rounded-lg bg-card">
        <div className="px-4 py-3 border-b">
          <Tabs value={activeTab} onValueChange={handleTabsChange}>
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
              <TabsTrigger className="shrink-0" value="all">Все приказы</TabsTrigger>
              <TabsTrigger className="shrink-0" value="general">По основной деятельности</TabsTrigger>
              <TabsTrigger className="shrink-0" value="notifications">Уведомления</TabsTrigger>
              <TabsTrigger className="shrink-0" value="statements">Заявления</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {activeTab === "all" && !isViewer && (
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
          <h2 className="text-lg font-semibold">Создать приказ</h2>
        </div>

        {!collapsed && (
          <div className="border-t px-4 py-4">
            <div className="flex flex-col lg:flex-row">
              {/* Left column — Основные данные */}
              <div className="space-y-4 lg:w-[400px] lg:shrink-0 lg:pr-6 lg:border-r">
                <div>
                  <label className="text-sm font-medium">Сотрудник <span className="text-red-500">*</span></label>
                  <div className="mt-1">
                    <EmployeeSearch
                      value={selectedEmployee}
                      onChange={setSelectedEmployee}
                      error={errors.employee}
                      label=" "
                      width="w-96"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-[130px]">
                    <DatePicker
                      label="Дата приказа"
                      value={orderDate}
                      onChange={setOrderDate}
                      required
                    />
                    {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}
                  </div>

                  <OrderNumberField
                    value={orderNumber}
                    onChange={setOrderNumber}
                    orderTypeId={selectedOrderTypeId ?? undefined}
                    orderTypes={orderTypes}
                    required
                    error={errors.orderNumber}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={(e) => { e.stopPropagation(); resetForm(); }} disabled={isPending}>
                    Очистить
                  </Button>
                  {!draftId ? (
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleEditBeforeCreate(); }}
                      disabled={isPending}
                    >
                      {createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                    </Button>
                  ) : (
                    <Button onClick={(e) => { e.stopPropagation(); handleCommitDraft(); }} disabled={isPending}>
                      {commitDraftMutation.isPending ? "Создание..." : "Создать приказ"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Right column — Детали приказа */}
              <div className="space-y-4 flex-1 min-w-0 max-w-[700px] lg:pl-6">
                <div ref={orderTypeRef} className="w-[350px]">
                  <label className="text-sm font-medium">Тип приказа <span className="text-red-500">*</span></label>
                  <div className="mt-1 relative">
                    {selectedOrderType ? (
                      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 h-10">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm flex-1 truncate">{selectedOrderType.name}</span>
                        <button
                          type="button"
                          onClick={clearOrderType}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <Input
                        placeholder="Выберите тип..."
                        value={orderTypeSearch}
                        onChange={(e) => {
                          setOrderTypeSearch(e.target.value)
                          setOrderTypeOpen(true)
                        }}
                        onKeyDown={handleOrderTypeKeyDown}
                        onFocus={() => setOrderTypeOpen(true)}
                        className={`h-10 ${errors.orderType ? "border-red-500" : ""}`}
                      />
                    )}
                    {orderTypeOpen && filteredTypes.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                        {filteredTypes.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                            onClick={() => selectOrderType(t)}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {errors.orderType && <p className="text-xs text-red-500 mt-1">{errors.orderType}</p>}
                </div>

                {/* Dynamic extra fields from layout config */}
                {selectedOrderType && (() => {
                  const layout = getOrderTypeLayout(selectedOrderType.code)
                  if (!layout) return null

                  const handleLayoutFieldChange = (key: string, value: string | number) => {
                    setExtraFields((prev) => {
                      const next = { ...prev, [key]: value }
                      // Для приёма: contract_start дублирует hire_date (это одна и та же дата)
                      if (selectedOrderType.code === "hire" && key === "hire_date" && value) {
                        next["contract_start"] = value
                      }
                      return next
                    })
                  }

                  return (
                    <div className="space-y-4">
                      {layout.groups.map((group, idx) => (
                        <FieldGroup key={`${selectedOrderType.code}-group-${idx}`} title={group.title}>
                          <div className="flex gap-2 items-end flex-wrap">
                            {group.fields.filter(f => f.enabled !== false).map((field) => (
                              <div key={field.key} className="flex flex-col min-w-0">
                                <FieldRenderer
                                  field={field as FieldSchema}
                                  value={extraFields[field.key]}
                                  error={extraFieldErrors[`extra_${field.key}`]}
                                  onChange={handleLayoutFieldChange}
                                  extraFields={extraFields}
                                />
                              </div>
                            ))}
                          </div>
                        </FieldGroup>
                      ))}

                      {layout.standaloneFields?.filter(f => f.enabled !== false).map((field) => (
                        <div key={field.key} className="pl-2 -mt-2">
                          <FieldRenderer
                            field={field as FieldSchema}
                            value={extraFields[field.key]}
                            error={extraFieldErrors[`extra_${field.key}`]}
                            onChange={handleLayoutFieldChange}
                            extraFields={extraFields}
                          />
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* General order create form */}
      {activeTab === "general" && !isViewer && (
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
          <h2 className="text-lg font-semibold">Создать приказ по основной деятельности</h2>
        </div>

        {!collapsed && (
          <div className="border-t px-4 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="w-[130px]">
                <DatePicker
                  label="Дата приказа"
                  value={generalOrderDate}
                  onChange={setGeneralOrderDate}
                  required
                />
                {generalOrderErrors.orderDate && <p className="text-xs text-red-500 mt-1">{generalOrderErrors.orderDate}</p>}
              </div>

              <OrderNumberField
                value={generalOrderNumber}
                onChange={setGeneralOrderNumber}
                orderTypeId={generalOrderType?.id}
                orderTypes={orderTypes}
                required
                error={generalOrderErrors.orderNumber}
                isGeneralOrder
              />

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={(e) => { e.stopPropagation(); resetGeneralForm(); }} disabled={isPending}>
                  Очистить
                </Button>
                {!generalDraftId ? (
                  <Button
                    onClick={(e) => { e.stopPropagation(); handleGeneralEditBeforeCreate(); }}
                    disabled={isPending}
                  >
                    {createDraftMutation.isPending ? "Подготовка..." : "Создать приказ"}
                  </Button>
                ) : (
                  <Button onClick={(e) => { e.stopPropagation(); handleGeneralCommitDraft(); }} disabled={isPending}>
                    {commitDraftMutation.isPending ? "Создание..." : "Создать приказ"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Filter panel for "all" tab */}
      {activeTab === "all" && (
      <div className="border rounded-lg bg-card">
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none flex-wrap gap-4"
          onClick={() => setFilterCollapsed(!filterCollapsed)}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Фильтры</h2>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs">{activeFilterCount}</Badge>
              )}
            </div>

            {/* Filter Presets in header */}
            <div className="flex items-center gap-2 text-xs flex-wrap" onClick={(e) => e.stopPropagation()}>
              <span className="text-muted-foreground font-medium hidden sm:inline">Шаблоны:</span>
              {presets.map((preset) => (
                <Badge
                  key={preset.id}
                  variant={isPresetActive(preset) ? "default" : "outline"}
                  className="cursor-pointer hover:opacity-90 py-0.5 px-2 flex items-center gap-1 border-dashed"
                  onClick={() => {
                    if (isPresetActive(preset)) {
                      clearFilters()
                    } else {
                      handleApplyPreset(preset)
                    }
                  }}
                >
                  <span>{preset.name}</span>
                  <button
                    type="button"
                    onClick={(e) => handleDeletePresetClick(preset.id, e)}
                    className="text-muted-foreground hover:text-destructive rounded-full p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
              {isSavingPreset ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    placeholder="Название..."
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSavePresetConfirm()
                      if (e.key === "Escape") handleSavePresetCancel()
                    }}
                    className="h-6 w-28 text-[10px] px-1.5 focus-visible:ring-1 focus-visible:ring-offset-0"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50 p-0"
                    onClick={handleSavePresetConfirm}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50 p-0"
                    onClick={handleSavePresetCancel}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 border-dashed text-[10px] px-2 flex items-center gap-0.5"
                  onClick={() => setIsSavingPreset(true)}
                >
                  Сохранить
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center">
            {filterCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {!filterCollapsed && (
          <div className="border-t px-4 py-4 space-y-4">
            {/* Row 1: Order number, Employee, Order type */}
            <div className="flex flex-wrap gap-6 items-end">
              <div className="w-[130px]">
                <label className="text-sm font-medium">Номер приказа</label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск..."
                    value={filterOrderNumber}
                    onChange={(e) => setFilterOrderNumber(e.target.value)}
                    className="pl-8 h-10 text-sm"
                  />
                </div>
              </div>

              <div className="w-[280px]">
                <label className="text-sm font-medium">Сотрудник</label>
                <div className="mt-1">
                  <EmployeeSearch
                    value={filterEmployee}
                    onChange={(v) => { setFilterEmployee(v); }}
                    placeholder="Выберите сотрудника"
                    label=" "
                    width="w-full"
                  />
                </div>
              </div>

              <div className="flex items-end gap-3 flex-wrap" ref={filterOrderTypeRef}>
                <div className="w-[220px]">
                  <label className="text-sm font-medium">Тип приказа</label>
                  <div className="mt-1 relative">
                    <Input
                      placeholder={filterOrderTypes.length > 0 ? `Выбрано: ${filterOrderTypes.length}` : "Выберите тип..."}
                      value={filterOrderTypeSearch}
                      onChange={(e) => { setFilterOrderTypeSearch(e.target.value); setFilterOrderTypeOpen(true); }}
                      onFocus={() => setFilterOrderTypeOpen(true)}
                      className="h-10 text-sm pr-8"
                    />
                    {filterOrderTypes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setFilterOrderTypes([]); setFilterOrderTypeSearch(""); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {filterOrderTypeOpen && (filteredAvailable.length > 0 || filteredOther.length > 0) && (
                      <div className="absolute z-50 mt-1 w-[220px] border rounded-md bg-popover shadow-md max-h-60 overflow-y-auto">
                        {filteredAvailable.length > 0 && (
                          <>
                            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30">
                              Основные (доступные на странице)
                            </div>
                            {filteredAvailable.map((t) => {
                              const isSelected = filterOrderTypes.some((item) => item.id === t.id)
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0 flex items-center justify-between"
                                  onClick={() => toggleFilterOrderType(t)}
                                >
                                  <span>{t.name}</span>
                                  {isSelected && <Check className="h-4 w-4 text-green-600 shrink-0 ml-2" />}
                                </button>
                              )
                            })}
                          </>
                        )}
                        {filteredOther.length > 0 && (
                          <>
                            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 border-t">
                              Другие типы (создаются в других разделах)
                            </div>
                            {filteredOther.map((t) => {
                              const isSelected = filterOrderTypes.some((item) => item.id === t.id)
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0 flex items-center justify-between"
                                  onClick={() => toggleFilterOrderType(t)}
                                >
                                  <span>{t.name}</span>
                                  {isSelected && <Check className="h-4 w-4 text-green-600 shrink-0 ml-2" />}
                                </button>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {filterOrderTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1 items-center max-w-[400px] mb-1">
                    {filterOrderTypes.map((type) => (
                      <Badge key={type.id} variant="secondary" className="flex items-center gap-1 pr-1.5 py-0.5 text-xs whitespace-nowrap">
                        {type.name}
                        <button
                          type="button"
                          onClick={() => toggleFilterOrderType(type)}
                          className="text-muted-foreground hover:text-foreground rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Date range */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-[130px]">
                <DatePicker label="Дата с" value={filterDateFrom} onChange={setFilterDateFrom} />
              </div>
              <div className="w-[130px]">
                <DatePicker label="Дата по" value={filterDateTo} onChange={setFilterDateTo} />
              </div>
            </div>

            {/* Row 3: Year buttons, Letter buttons + Clear */}
            <div className="flex flex-wrap gap-3 items-center">
              <YearFilter value={year} onChange={setYear} years={years} />

              <div className="flex gap-1">
                <Button variant={!filterLetter ? "default" : "outline"} size="sm" onClick={() => setFilterLetter(undefined)}>Все литеры</Button>
                <Button variant={filterLetter === "к" ? "default" : "outline"} size="sm" onClick={() => setFilterLetter("к")}>-к</Button>
                <Button variant={filterLetter === "л" ? "default" : "outline"} size="sm" onClick={() => setFilterLetter("л")}>-л</Button>
              </div>

              <div className="flex gap-1">
                <Button variant={!filterLS ? "default" : "outline"} size="sm" onClick={() => setFilterLS(false)}>Все типы</Button>
                <Button variant={filterLS ? "default" : "outline"} size="sm" onClick={() => setFilterLS(true)}>ЛС</Button>
              </div>

              <div className="flex gap-1">
                <Button variant={filterShowGeneral ? "default" : "outline"} size="sm" onClick={() => setFilterShowGeneral(true)}>
                  Показывать ОД
                </Button>
                <Button variant={!filterShowGeneral ? "default" : "outline"} size="sm" onClick={() => setFilterShowGeneral(false)}>
                  Скрыть ОД
                </Button>
              </div>

              <Button variant="outline" size="sm" onClick={clearFilters} className="ml-auto">Сбросить фильтры</Button>
            </div>

          </div>
        )}
      </div>
      )}

      {/* Simplified filter for "general" tab */}
      {activeTab === "general" && (
      <div className="border rounded-lg bg-card">
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={() => setFilterCollapsed(!filterCollapsed)}
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Фильтры</h2>
          </div>
          {filterCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        {!filterCollapsed && (
          <div className="border-t px-4 py-4 space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-[130px]">
                <label className="text-sm font-medium">Номер приказа</label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск..."
                    value={filterOrderNumber}
                    onChange={(e) => setFilterOrderNumber(e.target.value)}
                    className="pl-8 h-10 text-sm"
                  />
                </div>
              </div>
              <div className="w-[130px]">
                <DatePicker label="Дата с" value={filterDateFrom} onChange={setFilterDateFrom} />
              </div>
              <div className="w-[130px]">
                <DatePicker label="Дата по" value={filterDateTo} onChange={setFilterDateTo} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <YearFilter value={year} onChange={setYear} years={years} />
            </div>
          </div>
        )}
      </div>
      )}

      {error && activeTab === "all" && (
        <Alert variant="destructive">
          <AlertDescription>
            {(error as Error).message || "Ошибка загрузки данных"}
          </AlertDescription>
        </Alert>
      )}

      {/* Orders table for "all" tab */}
      {activeTab === "all" && (
        isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !displayOrders?.length ? (
          <EmptyState
            message="Приказы не найдены"
            description="Создайте первый приказ или измените фильтры"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableFilterHeader
                    field="order_number"
                    label="№"
                    currentSorts={sortConfigs}
                    onSortChange={(field) => setSortConfigs(prev => nextMultiSortConfigs(prev, field, "desc"))}
                    values={uniqueValues.order_number}
                    selectedValues={columnFilters.order_number ?? new Set()}
                    onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="order_type_name"
                    label="Тип"
                    currentSorts={sortConfigs}
                    onSortChange={(field) => setSortConfigs(prev => nextMultiSortConfigs(prev, field, "asc"))}
                    values={uniqueValues.order_type_name}
                    selectedValues={columnFilters.order_type_name ?? new Set()}
                    onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="employee_name"
                    label="Сотрудник"
                    currentSorts={sortConfigs}
                    onSortChange={(field) => setSortConfigs(prev => nextMultiSortConfigs(prev, field, "asc"))}
                    values={uniqueValues.employee_name}
                    selectedValues={columnFilters.employee_name ?? new Set()}
                    onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="order_date"
                    label="Дата приказа"
                    currentSorts={sortConfigs}
                    onSortChange={(field) => setSortConfigs(prev => nextMultiSortConfigs(prev, field, "desc"))}
                    values={uniqueValues.order_date}
                    selectedValues={columnFilters.order_date ?? new Set()}
                    onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    valueLabel={(val) => {
                      if (!val) return "—"
                      const parts = val.split("-")
                      if (parts.length !== 3) return val
                      const [y, m, d] = parts
                      return `${d}.${m}.${y}`
                    }}
                  />
                </TableHead>
                <TableHead>
                  <SortableFilterHeader
                    field="created_date"
                    label="Дата создания"
                    currentSorts={sortConfigs}
                    onSortChange={(field) => setSortConfigs(prev => nextMultiSortConfigs(prev, field, "desc"))}
                    values={uniqueValues.created_date}
                    selectedValues={columnFilters.created_date ?? new Set()}
                    onFilterChange={(field, selected) => setColumnFilters(prev => ({ ...prev, [field]: selected }))}
                    valueLabel={(val) => {
                      if (!val) return "—"
                      const parts = val.split("-")
                      if (parts.length !== 3) return val
                      const [y, m, d] = parts
                      return `${d}.${m}.${y}`
                    }}
                  />
                </TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayOrders.map((order) => {
                const isGroup = order.is_group
                return (
                  <Fragment key={order.id}>
                    <TableRow>
                      <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={ORDER_TYPE_BADGE_COLORS[order.order_type_name] || ""}
                        >
                          {order.order_type_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {isGroup ? (
                          <span className="font-medium">Групповой приказ — {order.group_employee_count || 0} сотрудников</span>
                        ) : (
                          order.employee_name || "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {order.order_date ? (() => { const d = new Date(order.order_date); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` })() : "—"}
                      </TableCell>
                      <TableCell>
                        {order.created_date ? (() => { const d = new Date(order.created_date); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` })() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Просмотр DOCX" onClick={() => openOrderView(order.id)}><Eye className="h-4 w-4" /></Button>
                          {!isViewer && (
                            <Button variant="ghost" size="icon" title="Редактировать DOCX" onClick={() => openOrderEdit(order.id)}><FilePen className="h-4 w-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" title="Печать" onClick={() => openOrderPrint(order.id)}><Printer className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Скачать приказ" onClick={() => downloadOrderDocx(order.id)}><Download className="h-4 w-4" /></Button>
                          {!isViewer && (
                            <Button variant="ghost" size="icon" title="Удалить приказ" onClick={() => setDeleteOrderId(order.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isGroup && order.group_employees && (
                      <GroupOrderEmployeesRows
                        employees={getDisplayGroupEmployees(order)}
                        type="orders"
                        orderNumber={order.order_number}
                      />
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        )
      )}

      {/* Orders table for "general" tab */}
      {activeTab === "general" && (
        generalOrdersLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !generalOrdersData?.items?.length ? (
          <EmptyState
            message="Приказы по основной деятельности не найдены"
            description="Создайте первый приказ"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Дата приказа</TableHead>
                <TableHead>Дата создания</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {generalOrdersData.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {order.order_type_name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {order.order_date ? (() => { const d = new Date(order.order_date); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` })() : "—"}
                  </TableCell>
                  <TableCell>
                    {order.created_date ? (() => { const d = new Date(order.created_date); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` })() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Просмотр DOCX" onClick={() => openOrderView(order.id)}><Eye className="h-4 w-4" /></Button>
                      {!isViewer && (
                        <Button variant="ghost" size="icon" title="Редактировать DOCX" onClick={() => openOrderEdit(order.id)}><FilePen className="h-4 w-4" /></Button>
                      )}
                      <Button variant="ghost" size="icon" title="Печать" onClick={() => openOrderPrint(order.id)}><Printer className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Скачать приказ" onClick={() => downloadOrderDocx(order.id)}><Download className="h-4 w-4" /></Button>
                      {!isViewer && (
                        <Button variant="ghost" size="icon" title="Удалить приказ" onClick={() => setDeleteOrderId(order.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      )}

      <AlertDialog open={showDismissalDialog} onOpenChange={setShowDismissalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Уволить сотрудника?</AlertDialogTitle>
            <AlertDialogDescription>
              Сотрудник {selectedEmployee?.name} будет уволен. Приказ об увольнении будет создан.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDismissal} className="bg-amber-600 hover:bg-amber-700">
              Уволить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOrderId !== null} onOpenChange={(open) => !open && setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить приказ безвозвратно?</AlertDialogTitle>
            <OrderDeletePreview orderId={deleteOrderId} />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrderConfirm} className="bg-red-600 hover:bg-red-700">
              Удалить навсегда
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletePresetId !== null} onOpenChange={(open) => !open && setDeletePresetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон фильтров?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы действительно хотите удалить шаблон &quot;{presets.find(p => p.id === deletePresetId)?.name}&quot;? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeletePreset} className="bg-red-600 hover:bg-red-700">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GlobalAuditLog open={auditLogOpen} onOpenChange={setAuditLogOpen} initialActionFilter="order" />

      <DocumentModal docCode="contracts" title="Контракты" open={contractsOpen} onOpenChange={setContractsOpen} />

      <ContractRegistryModal open={contractRegistryOpen} onOpenChange={setContractRegistryOpen} />
    </div>
  )
}
