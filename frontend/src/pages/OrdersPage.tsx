import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Download, X, Check, ChevronDown, ChevronRight, Settings, Eye, Trash2, ScrollText, FilePen, Search, Filter, Printer, FileText } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
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
import type { Employee } from "@/entities/employee/types"
import type { OrderType, OrderTypeFieldSchema } from "@/entities/order/types"

// ─── Quick Options Row ────────────────────────────────────────────────────────

type QuickOptionsRowProps = {
  field: OrderTypeFieldSchema
  extraFields: Record<string, string | number>
  onChange: (key: string, value: string | number) => void
}

function QuickOptionsRow({ field, extraFields, onChange }: QuickOptionsRowProps) {
  if (!field.quickOptions || field.quickOptions.length === 0) return null

  const countKey = field.key === "contract_end" ? "contract_end_years" : "trial_end_months"
  const unit = field.quickOptions[0]?.unit

  return (
    <div className="flex gap-2 items-center">
      {field.quickOptions.map((opt) => (
        <button
          key={opt.label}
          type="button"
          className="text-xs px-2 py-0.5 rounded border border-input bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={() => {
            const hireDateStr = extraFields["hire_date"] as string | undefined
            if (hireDateStr) {
              const d = new Date(hireDateStr + "T00:00:00")
              if (opt.years) {
                d.setFullYear(d.getFullYear() + opt.years)
                d.setDate(d.getDate() - 1)
              } else if (opt.months) {
                d.setMonth(d.getMonth() + opt.months)
                d.setDate(d.getDate() - 1)
              }
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
              onChange(field.key, iso)
              onChange(countKey, opt.years ?? opt.months ?? "")
            }
          }}
        >
          {opt.label}
        </button>
      ))}
      <label className="text-xs text-muted-foreground whitespace-nowrap">
        {unit === "years" ? "лет:" : "мес:"}
      </label>
      <input
        type="number"
        min="1"
        max="99"
        value={extraFields[countKey] !== undefined && extraFields[countKey] !== "" ? String(extraFields[countKey]) : ""}
        onChange={(e) => {
          const val = e.target.value
          onChange(countKey, val === "" ? "" : Number(val))
          if (val && Number(val) > 0) {
            const hireDateStr = extraFields["hire_date"] as string | undefined
            if (hireDateStr) {
              const d = new Date(hireDateStr + "T00:00:00")
              if (unit === "years") {
                d.setFullYear(d.getFullYear() + Number(val))
                d.setDate(d.getDate() - 1)
              } else {
                d.setMonth(d.getMonth() + Number(val))
                d.setDate(d.getDate() - 1)
              }
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
              onChange(field.key, iso)
            }
          }
        }}
        className="w-12 h-7 text-xs rounded border border-input bg-background px-1 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  )
}

// ─── Hire Order Fields Layout ──────────────────────────────────────────────────

type HireOrderFieldsProps = {
  fieldSchema: OrderTypeFieldSchema[]
  extraFields: Record<string, string | number>
  extraFieldErrors: Record<string, string | undefined>
  onFieldChange: (key: string, value: string | number) => void
}

function HireOrderFields({ fieldSchema, extraFields, extraFieldErrors, onFieldChange }: HireOrderFieldsProps) {
  const fields = fieldSchema.map((f) => {
    if (f.key === "trial_end") {
      return { ...f, quickOptions: [
        { label: "2 мес", months: 2, unit: "months" as const },
        { label: "3 мес", months: 3, unit: "months" as const },
      ]}
    }
    if (f.key === "contract_end") {
      return { ...f, quickOptions: [
        { label: "1 год", years: 1, unit: "years" as const },
        { label: "2 года", years: 2, unit: "years" as const },
        { label: "3 года", years: 3, unit: "years" as const },
      ]}
    }
    return f
  })

  const hireDate = fields.find(f => f.key === "hire_date")
  const contractEnd = fields.find(f => f.key === "contract_end")
  const trialEnd = fields.find(f => f.key === "trial_end")
  const otherFields = fields.filter(f => !["hire_date", "contract_end", "trial_end"].includes(f.key))

  return (
    <div className="space-y-3">
      {/* Row 1: hire_date + contract_end date pickers side by side */}
      <div className="flex gap-4 flex-wrap">
        {hireDate && (
          <DynamicField
            key="hire_date"
            field={{ ...hireDate, quickOptions: undefined }}
            value={extraFields[hireDate.key]}
            error={extraFieldErrors[`extra_${hireDate.key}`]}
            onChange={onFieldChange}
            extraFields={extraFields}
          />
        )}
        {contractEnd && (
          <DynamicField
            key="contract_end"
            field={{ ...contractEnd, quickOptions: undefined }}
            value={extraFields[contractEnd.key]}
            error={extraFieldErrors[`extra_${contractEnd.key}`]}
            onChange={onFieldChange}
            extraFields={extraFields}
          />
        )}
        {otherFields.filter(f => f.type === "date").map((field) => (
          <DynamicField
            key={field.key}
            field={field}
            value={extraFields[field.key]}
            error={extraFieldErrors[`extra_${field.key}`]}
            onChange={onFieldChange}
            extraFields={extraFields}
          />
        ))}
      </div>
      {/* contract_end quick options */}
      {contractEnd?.quickOptions && (
        <QuickOptionsRow field={contractEnd} extraFields={extraFields} onChange={onFieldChange} />
      )}
      {/* trial_end date picker */}
      {trialEnd && (
        <div className="flex gap-4 flex-wrap">
          <DynamicField
            key="trial_end"
            field={{ ...trialEnd, quickOptions: undefined }}
            value={extraFields[trialEnd.key]}
            error={extraFieldErrors[`extra_${trialEnd.key}`]}
            onChange={onFieldChange}
            extraFields={extraFields}
          />
        </div>
      )}
      {/* trial_end quick options */}
      {trialEnd?.quickOptions && (
        <QuickOptionsRow field={trialEnd} extraFields={extraFields} onChange={onFieldChange} />
      )}
      {/* Other non-date fields */}
      {otherFields.filter(f => f.type !== "date").map((field) => (
        <DynamicField
          key={field.key}
          field={field}
          value={extraFields[field.key]}
          error={extraFieldErrors[`extra_${field.key}`]}
          onChange={onFieldChange}
          extraFields={extraFields}
        />
      ))}
    </div>
  )
}

// ─── Dynamic Field Renderer ───────────────────────────────────────────────────

type DynamicFieldProps = {
  field: OrderTypeFieldSchema
  value: string | number | undefined
  error?: string
  onChange: (key: string, value: string | number) => void
  extraFields: Record<string, string | number>
}

function DynamicField({ field, value, error, onChange, extraFields }: DynamicFieldProps) {
  const displayValue = value !== undefined && value !== null ? String(value) : ""

  if (field.type === "date") {
    return (
      <div>
        <DatePicker
          label={field.label}
          value={displayValue}
          onChange={(v) => onChange(field.key, v)}
          required={field.required}
          className="w-[130px]"
        />
        {field.quickOptions && field.quickOptions.length > 0 && (
          <div className="flex gap-2 mt-1 items-end">
            {field.quickOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className="text-xs px-2 py-0.5 rounded border border-input bg-background hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                onClick={() => {
                  const hireDateStr = extraFields["hire_date"] as string | undefined
                  if (hireDateStr) {
                    const d = new Date(hireDateStr + "T00:00:00")
                    if (opt.years) {
                      d.setFullYear(d.getFullYear() + opt.years)
                    } else if (opt.months) {
                      d.setMonth(d.getMonth() + opt.months)
                      d.setDate(d.getDate() - 1)
                    }
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                    onChange(field.key, iso)
                    // Also set the count field
                    const countKey = field.key === "contract_end" ? "contract_end_years" : "trial_end_months"
                    onChange(countKey, opt.years ?? opt.months ?? "")
                  }
                }}
              >
                {opt.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground whitespace-nowrap">
                {field.quickOptions[0]?.unit === "years" ? "лет:" : "мес:"}
              </label>
              <input
                type="number"
                min="1"
                max="99"
                value={(() => {
                  const countKey = field.key === "contract_end" ? "contract_end_years" : "trial_end_months"
                  const v = extraFields[countKey]
                  return v !== undefined && v !== null && v !== "" ? String(v) : ""
                })()}
                onChange={(e) => {
                  const val = e.target.value
                  const countKey = field.key === "contract_end" ? "contract_end_years" : "trial_end_months"
                  onChange(countKey, val === "" ? "" : Number(val))
                  // Also recalculate the date
                  if (val && Number(val) > 0) {
                    const hireDateStr = extraFields["hire_date"] as string | undefined
                    if (hireDateStr) {
                      const d = new Date(hireDateStr + "T00:00:00")
                      const unit = field.quickOptions![0]?.unit
                      if (unit === "years") {
                        d.setFullYear(d.getFullYear() + Number(val))
                      } else {
                        d.setMonth(d.getMonth() + Number(val))
                        d.setDate(d.getDate() - 1)
                      }
                      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                      onChange(field.key, iso)
                    }
                  }
                }}
                className="w-12 h-7 text-xs rounded border border-input bg-background px-1 text-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  if (field.type === "textarea") {
    return (
      <div>
        <label className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-0 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
          placeholder={field.label}
          value={displayValue}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    )
  }

  // text / number
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{field.label}</label>
      <Input
        type={field.type === "number" ? "number" : "text"}
        placeholder={field.label}
        value={displayValue}
        onChange={(e) =>
          onChange(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)
        }
        required={field.required}
        className="w-[200px]"
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [collapsed, setCollapsed] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [filterCollapsed, setFilterCollapsed] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "general">("all")
  const [contractsOpen, setContractsOpen] = useState(false)

  // Filter state
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(null)
  const [filterOrderType, setFilterOrderType] = useState<OrderType | null>(null)
  const [filterOrderTypeSearch, setFilterOrderTypeSearch] = useState("")
  const [filterOrderTypeOpen, setFilterOrderTypeOpen] = useState(false)
  const [filterOrderNumber, setFilterOrderNumber] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterLetter, setFilterLetter] = useState<string | undefined>(undefined)
  const [filterLS, setFilterLS] = useState<boolean>(false)
  const [filterShowGeneral, setFilterShowGeneral] = useState<boolean>(false)
  const filterOrderTypeRef = useRef<HTMLDivElement>(null)

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
    order_type_code: filterOrderType?.code,
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

  const { data: years } = useOrderYears()
  const { data: orderTypes = [] } = useOrderTypes(true)
  const generalOrderType = orderTypes.find(t => t.code === "general_order") ?? null
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
    if (filterOrderType) count++
    if (filterOrderNumber) count++
    if (filterDateFrom) count++
    if (filterDateTo) count++
    if (year) count++
    if (filterLetter) count++
    if (filterLS) count++
    return count
  }, [filterEmployee, filterOrderType, filterOrderNumber, filterDateFrom, filterDateTo, year, filterLetter, filterLS])

  const clearFilters = () => {
    setFilterEmployee(null)
    setFilterOrderType(null)
    setFilterOrderTypeSearch("")
    setFilterOrderNumber("")
    setFilterDateFrom("")
    setFilterDateTo("")
    setYear(undefined)
    setFilterLetter(undefined)
    setFilterLS(false)
    setFilterShowGeneral(false)
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

      {activeTab === "all" && (
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
              <div className="space-y-4 flex-1 min-w-0 max-w-[400px] lg:pl-6">
                <div ref={orderTypeRef} className="w-60">
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

                {/* Dynamic extra fields from field_schema */}
                {selectedOrderType && Array.isArray(selectedOrderType.field_schema) && selectedOrderType.field_schema.length > 0 && (
                  selectedOrderType.code === "hire" ? (
                    <HireOrderFields
                      fieldSchema={selectedOrderType.field_schema}
                      extraFields={extraFields}
                      extraFieldErrors={extraFieldErrors}
                      onFieldChange={(key, value) => setExtraFields((prev) => ({ ...prev, [key]: value }))}
                    />
                  ) : (
                  <div className="space-y-4">
                    {(() => {
                      const fields = selectedOrderType.field_schema.map((f) => {
                        if (f.key === "trial_end") {
                          return { ...f, quickOptions: [
                            { label: "2 мес", months: 2, unit: "months" as const },
                            { label: "3 мес", months: 3, unit: "months" as const },
                          ]}
                        }
                        if (f.key === "contract_end") {
                          return { ...f, quickOptions: [
                            { label: "1 год", years: 1, unit: "years" as const },
                            { label: "2 года", years: 2, unit: "years" as const },
                            { label: "3 года", years: 3, unit: "years" as const },
                          ]}
                        }
                        return f
                      })

                      // Default grouping for other order types
                      const rows: typeof fields[] = []
                      let currentRow: typeof fields = []

                      for (const field of fields) {
                        if (field.type === "date") {
                          currentRow.push(field)
                        } else {
                          if (currentRow.length > 0) {
                            rows.push(currentRow)
                            currentRow = []
                          }
                          rows.push([field])
                        }
                      }
                      if (currentRow.length > 0) rows.push(currentRow)

                      return rows.map((row, ri) => (
                        <div key={ri} className="flex gap-4 flex-wrap">
                          {row.map((field) => (
                            <DynamicField
                              key={field.key}
                              field={field}
                              value={extraFields[field.key]}
                              error={extraFieldErrors[`extra_${field.key}`]}
                              onChange={(key, value) => setExtraFields((prev) => ({ ...prev, [key]: value }))}
                              extraFields={extraFields}
                            />
                          ))}
                        </div>
                      ))
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* General order create form */}
      {activeTab === "general" && (
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
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={() => setFilterCollapsed(!filterCollapsed)}
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Фильтры</h2>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs">{activeFilterCount}</Badge>
            )}
          </div>
          {filterCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
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

              <div className="w-[220px]" ref={filterOrderTypeRef}>
                <label className="text-sm font-medium">Тип приказа</label>
                <div className="mt-1 relative">
                  {filterOrderType ? (
                    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 h-10 text-sm">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="flex-1 truncate">{filterOrderType.name}</span>
                      <button type="button" onClick={() => { setFilterOrderType(null); setFilterOrderTypeSearch(""); }} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Выберите тип..."
                        value={filterOrderTypeSearch}
                        onChange={(e) => { setFilterOrderTypeSearch(e.target.value); setFilterOrderTypeOpen(true); }}
                        onFocus={() => setFilterOrderTypeOpen(true)}
                        className="h-10 text-sm"
                      />
                      {filterOrderTypeOpen && (
                        <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                          {orderTypes.filter((t) => t.code !== "general_order" && t.name.toLowerCase().includes(filterOrderTypeSearch.toLowerCase())).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                              onClick={() => { setFilterOrderType(t); setFilterOrderTypeSearch(t.name); setFilterOrderTypeOpen(false); }}
                            >
                              {t.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
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
              <div className="flex gap-1">
                <Button variant={!year ? "default" : "outline"} size="sm" onClick={() => setYear(undefined)}>Все года</Button>
                {years?.map((y) => (
                  <Button key={y} variant={year === y ? "default" : "outline"} size="sm" onClick={() => setYear(y)}>{y}</Button>
                ))}
              </div>

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
              <div className="flex gap-1">
                <Button variant={!year ? "default" : "outline"} size="sm" onClick={() => setYear(undefined)}>Все года</Button>
                {years?.map((y) => (
                  <Button key={y} variant={year === y ? "default" : "outline"} size="sm" onClick={() => setYear(y)}>{y}</Button>
                ))}
              </div>
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
        ) : !filteredData?.items?.length ? (
          <EmptyState
            message="Приказы не найдены"
            description="Создайте первый приказ или измените фильтры"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Дата приказа</TableHead>
                <TableHead>Дата создания</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={ORDER_TYPE_BADGE_COLORS[order.order_type_name] || ""}
                    >
                      {order.order_type_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{order.employee_name || "—"}</TableCell>
                  <TableCell>
                    {order.order_date ? (() => { const d = new Date(order.order_date); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` })() : "—"}
                  </TableCell>
                  <TableCell>
                    {order.created_date ? (() => { const d = new Date(order.created_date); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` })() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Просмотр DOCX" onClick={() => openOrderView(order.id)}><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Редактировать DOCX" onClick={() => openOrderEdit(order.id)}><FilePen className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Печать" onClick={() => openOrderPrint(order.id)}><Printer className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Скачать приказ" onClick={() => downloadOrderDocx(order.id)}><Download className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Удалить приказ" onClick={() => setDeleteOrderId(order.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
                      <Button variant="ghost" size="icon" title="Редактировать DOCX" onClick={() => openOrderEdit(order.id)}><FilePen className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Печать" onClick={() => openOrderPrint(order.id)}><Printer className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Скачать приказ" onClick={() => downloadOrderDocx(order.id)}><Download className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Удалить приказ" onClick={() => setDeleteOrderId(order.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></Button>
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

      <GlobalAuditLog open={auditLogOpen} onOpenChange={setAuditLogOpen} initialActionFilter="order" />

      <DocumentModal docCode="contracts" title="Контракты" open={contractsOpen} onOpenChange={setContractsOpen} />
    </div>
  )
}
