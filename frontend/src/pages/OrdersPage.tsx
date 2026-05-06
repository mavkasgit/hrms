import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Download, X, Check, ChevronDown, ChevronRight, Settings, Eye, Trash2, ScrollText, FilePen, Search, Filter } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
import { GlobalAuditLog } from "@/features/global-audit-log"
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
  useCancelOrder,
  useDeleteOrder,
} from "@/entities/order/useOrders"
import { useEmployee } from "@/entities/employee/useEmployees"
import { useCommitOrderDraft, useCreateOrderDraft } from "@/entities/order/useOnlyOffice"
import { OrderNumberField } from "@/features/OrderNumberField"
import { EmployeeSearch } from "@/features/employee-search"
import type { Employee } from "@/entities/employee/types"
import type { OrderType } from "@/entities/order/types"

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

export function OrdersPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [collapsed, setCollapsed] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [filterCollapsed, setFilterCollapsed] = useState(true)

  // Filter state
  const [filterEmployee, setFilterEmployee] = useState<Employee | null>(null)
  const [filterOrderType, setFilterOrderType] = useState<OrderType | null>(null)
  const [filterOrderTypeSearch, setFilterOrderTypeSearch] = useState("")
  const [filterOrderTypeOpen, setFilterOrderTypeOpen] = useState(false)
  const [filterOrderNumber, setFilterOrderNumber] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "cancelled">("all")
  const [filterLetter, setFilterLetter] = useState<string | undefined>(undefined)
  const filterOrderTypeRef = useRef<HTMLDivElement>(null)

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<number | null>(null)
  const [orderTypeSearch, setOrderTypeSearch] = useState("")
  const [orderTypeOpen, setOrderTypeOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

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

  const { data: years } = useOrderYears()
  const { data: orderTypes = [] } = useOrderTypes(true)
  const createMutation = useCreateOrder()
  const createDraftMutation = useCreateOrderDraft()
  const commitDraftMutation = useCommitOrderDraft()
  const cancelMutation = useCancelOrder()
  const deleteMutation = useDeleteOrder()

  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null)
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

  const handleCancelOrderConfirm = () => {
    if (cancelOrderId) cancelMutation.mutate(cancelOrderId)
    setCancelOrderId(null)
  }

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

  const filteredTypes = orderTypes.filter((t) =>
    t.name.toLowerCase().includes(orderTypeSearch.toLowerCase())
  )

  const selectOrderType = (type: OrderType) => {
    setSelectedOrderTypeId(type.id)
    setOrderTypeSearch(type.name)
    setOrderTypeOpen(false)
  }

  const clearOrderType = () => {
    setSelectedOrderTypeId(null)
    setOrderTypeSearch("")
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
    setDraftId(null)
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedEmployee) newErrors.employee = "Выберите сотрудника"
    if (!selectedOrderTypeId) newErrors.orderType = "Выберите тип приказа"
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    if (!orderNumber) newErrors.orderNumber = "Укажите номер приказа"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const buildOrderPayload = () => {
    return {
      employee_id: selectedEmployee!.id,
      order_type_id: selectedOrderTypeId!,
      order_date: orderDate,
      order_number: orderNumber || undefined,
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

  const handleCommitDraft = () => {
    if (!draftId || !validate()) return
    commitDraftMutation.mutate(
      { draftId, order: buildOrderPayload() },
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
  }, [draftId, selectedEmployee, selectedOrderTypeId, orderDate, orderNumber])

  const handleDownload = (orderId: number) => {
    window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/download`, "_blank")
  }

  const handlePreview = (orderId: number) => {
    window.open(`/orders/${orderId}/view-docx`, "_blank", "noopener,noreferrer")
  }

  const handleEditDocx = (orderId: number) => {
    window.open(`/orders/${orderId}/edit-docx`, "_blank", "noopener,noreferrer")
  }

  const isPending = createMutation.isPending || createDraftMutation.isPending || commitDraftMutation.isPending

  // Compute active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filterEmployee) count++
    if (filterOrderType) count++
    if (filterOrderNumber) count++
    if (filterDateFrom) count++
    if (filterDateTo) count++
    if (filterStatus !== "all") count++
    if (year) count++
    if (filterLetter) count++
    return count
  }, [filterEmployee, filterOrderType, filterOrderNumber, filterDateFrom, filterDateTo, filterStatus, year, filterLetter])

  const clearFilters = () => {
    setFilterEmployee(null)
    setFilterOrderType(null)
    setFilterOrderTypeSearch("")
    setFilterOrderNumber("")
    setFilterDateFrom("")
    setFilterDateTo("")
    setFilterStatus("all")
    setYear(undefined)
    setFilterLetter(undefined)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Приказы</h1>
        <div className="flex items-center gap-2">
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
            <div className="grid gap-4">
                <div className="flex gap-4">
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

                  <div className="w-[17%]" ref={orderTypeRef}>
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
              </div>

              <div className="flex gap-2 mt-4">
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
        )}
      </div>

      {/* Filter panel */}
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
                          {orderTypes.filter((t) => t.name.toLowerCase().includes(filterOrderTypeSearch.toLowerCase())).map((t) => (
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

            {/* Row 2: Date range, Status */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="w-[130px]">
                <DatePicker label="Дата с" value={filterDateFrom} onChange={setFilterDateFrom} />
              </div>
              <div className="w-[130px]">
                <DatePicker label="Дата по" value={filterDateTo} onChange={setFilterDateTo} />
              </div>

              <div>
                <label className="text-sm font-medium">Статус</label>
                <div className="flex gap-1 mt-1">
                  <Button variant={filterStatus === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("all")}>Все</Button>
                  <Button variant={filterStatus === "active" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("active")}>Активные</Button>
                  <Button variant={filterStatus === "cancelled" ? "default" : "outline"} size="sm" onClick={() => setFilterStatus("cancelled")}>Отменённые</Button>
                </div>
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

              <Button variant="outline" size="sm" onClick={clearFilters} className="ml-auto">Сбросить фильтры</Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {(error as Error).message || "Ошибка загрузки данных"}
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : !data?.items?.length ? (
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
            {data.items.map((order) => (
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
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Редактировать DOCX"
                      onClick={() => handleEditDocx(order.id)}
                    >
                      <FilePen className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Быстрый просмотр"
                      onClick={() => handlePreview(order.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Скачать приказ"
                      onClick={() => handleDownload(order.id)}
                    >
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
            ))}
          </TableBody>
        </Table>
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

      <AlertDialog open={cancelOrderId !== null} onOpenChange={(open) => !open && setCancelOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить приказ?</AlertDialogTitle>
            <AlertDialogDescription>
              Связанные отпуска также будут отменены, дни вернутся в остаток.
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
              Файл приказа и связанные отпуска будут удалены безвозвратно. Это действие нельзя отменить.
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

      <GlobalAuditLog open={auditLogOpen} onOpenChange={setAuditLogOpen} initialActionFilter="order" />
    </div>
  )
}
