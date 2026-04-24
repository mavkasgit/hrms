import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Download, X, Check, ChevronDown, ChevronRight, Settings, Eye, Trash2, ScrollText } from "lucide-react"
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
import { computeNextOrderNumber } from "@/entities/order/computeNextOrderNumber"
import { OrderNumberField } from "@/features/OrderNumberField"
import { calculateDaysBetween, calculateEndDate, calculateStartDate } from "@/entities/order/orderTypeFields"
import { useSearchEmployees, useEmployees } from "@/entities/employee/useEmployees"
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

export function OrdersPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [collapsed, setCollapsed] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Employee[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<number | null>(null)
  const [orderTypeSearch, setOrderTypeSearch] = useState("")
  const [orderTypeOpen, setOrderTypeOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [extraFields, setExtraFields] = useState<Record<string, string>>({})
  const lastChangedRef = useRef<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const orderTypeRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error } = useOrders({
    page: 1,
    per_page: 1000,
    year,
  })

  const { data: years } = useOrderYears()
  const { data: orderTypes = [] } = useOrderTypes(true)
  const { data: searchResult } = useSearchEmployees(searchQuery)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000 })
  const createMutation = useCreateOrder()
  const cancelMutation = useCancelOrder()
  const deleteMutation = useDeleteOrder()

  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null)
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null)

  const selectedOrderType = orderTypes.find(item => item.id === selectedOrderTypeId) ?? null

  const handleCancelOrderConfirm = () => {
    if (cancelOrderId) cancelMutation.mutate(cancelOrderId)
    setCancelOrderId(null)
  }

  const handleDeleteOrderConfirm = () => {
    if (deleteOrderId) deleteMutation.mutate(deleteOrderId)
    setDeleteOrderId(null)
  }

  const computedNextNumber = computeNextOrderNumber(data?.items || [])

  useEffect(() => {
    if (computedNextNumber && !orderNumber) {
      setOrderNumber(computedNextNumber)
    }
  }, [computedNextNumber])

  useEffect(() => {
    const changed = lastChangedRef.current
    if (!changed) return

    const configs = [
      { start: "vacation_start", end: "vacation_end", days: "vacation_days" },
      { start: "sick_leave_start", end: "sick_leave_end", days: "sick_leave_days" },
    ]

    for (const cfg of configs) {
      const s = extraFields[cfg.start] || ""
      const e = extraFields[cfg.end] || ""
      const d = extraFields[cfg.days] || ""

      if (changed === cfg.start || changed === cfg.end) {
        if (s && e) {
          const days = calculateDaysBetween(cfg.start, cfg.end, extraFields)
          if (days !== null && String(days) !== d) {
            setExtraFields((prev) => ({ ...prev, [cfg.days]: String(days) }))
          }
        }
      }

      if (changed === cfg.days) {
        const daysNum = parseInt(d, 10)
        if (!isNaN(daysNum) && daysNum > 0) {
          if (s && !e) {
            const endDate = calculateEndDate(cfg.start, cfg.days, extraFields)
            if (endDate) setExtraFields((prev) => ({ ...prev, [cfg.end]: endDate }))
          } else if (!s && e) {
            const startDate = calculateStartDate(cfg.end, cfg.days, extraFields)
            if (startDate) setExtraFields((prev) => ({ ...prev, [cfg.start]: startDate }))
          } else if (s && e) {
            const expectedDays = calculateDaysBetween(cfg.start, cfg.end, extraFields)
            if (expectedDays !== null && expectedDays !== daysNum) {
              setExtraFields((prev) => ({ ...prev, [cfg.end]: calculateEndDate(cfg.start, cfg.days, extraFields)! }))
            }
          }
        }
      }
    }
  }, [extraFields])

  useEffect(() => {
    if (searchResult?.items) {
      setSearchResults(searchResult.items)
    }
  }, [searchResult])

  useEffect(() => {
    if (searchOpen && !searchQuery && allEmployees?.items) {
      setSearchResults(allEmployees.items)
    }
  }, [searchOpen, searchQuery, allEmployees])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orderTypeRef.current && !orderTypeRef.current.contains(e.target as Node)) {
        setOrderTypeOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
        setSearchOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredTypes = orderTypes.filter((t) =>
    t.name.toLowerCase().includes(orderTypeSearch.toLowerCase())
  )

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp)
    setSearchQuery("")
    setSearchResults([])
    setSearchOpen(false)
  }

  const selectOrderType = (type: OrderType) => {
    setSelectedOrderTypeId(type.id)
    setOrderTypeSearch(type.name)
    setOrderTypeOpen(false)
    setExtraFields({})
  }

  const clearEmployee = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
  }

  const clearOrderType = () => {
    setSelectedOrderTypeId(null)
    setOrderTypeSearch("")
    setExtraFields({})
  }

  const handleEmployeeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchResults.length > 0 && !selectedEmployee) {
      e.preventDefault()
      selectEmployee(searchResults[0])
    }
  }

  const handleOrderTypeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && filteredTypes.length > 0 && orderTypeOpen) {
      e.preventDefault()
      selectOrderType(filteredTypes[0])
    }
  }

  const resetForm = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
    setSelectedOrderTypeId(null)
    setOrderTypeSearch("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setExtraFields({})
    lastChangedRef.current = null
    setErrors({})
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

  const handleSubmit = () => {
    if (!validate()) return
    const ef = Object.keys(extraFields).length > 0 ? extraFields : undefined
    createMutation.mutate(
      {
        employee_id: selectedEmployee!.id,
        order_type_id: selectedOrderTypeId!,
        order_date: orderDate,
        order_number: orderNumber || undefined,
        extra_fields: ef,
      },
      {
        onSuccess: () => resetForm(),
      }
    )
  }

  const handleDownload = (orderId: number) => {
    window.open(`${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/download`, "_blank")
  }

  const handlePreview = (orderId: number) => {
    const url = `${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/print`
    window.open(url, "_blank")
  }

  const isPending = createMutation.isPending

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
          <div className="border-t px-4 py-4 relative">
            <div>
              <div className="grid gap-4">
                <div className="flex gap-4">
                  <div className="w-[29%]" ref={searchRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Сотрудник *</label>
                    </div>
                    {selectedEmployee ? (
                      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm flex-1 truncate">
                          {selectedEmployee.name}
                          {selectedEmployee.tab_number && (
                            <span className="text-muted-foreground ml-1">(таб. {selectedEmployee.tab_number})</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={clearEmployee}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          placeholder="Поиск по ФИО..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={handleEmployeeKeyDown}
                          onFocus={() => { setSearchOpen(true); if (!searchQuery && allEmployees?.items) setSearchResults(allEmployees.items) }}
                          className={errors.employee ? "border-red-500" : ""}
                        />
                        {searchResults.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                            {searchResults.map((emp) => (
                              <button
                                key={emp.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                                onClick={() => selectEmployee(emp)}
                              >
                                <span className="font-medium">{emp.name}</span>
                                {emp.tab_number && (
                                  <span className="text-muted-foreground ml-2">таб. {emp.tab_number}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {errors.employee && <p className="text-xs text-red-500 mt-1">{errors.employee}</p>}
                  </div>

                  <div className="w-[17%] relative" ref={orderTypeRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Тип приказа *</label>
                    </div>
                    {selectedOrderType ? (
                      <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50">
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
                      <>
                        <div className="relative">
                          <Input
                            placeholder="Выберите тип..."
                            value={orderTypeSearch}
                            onChange={(e) => {
                              setOrderTypeSearch(e.target.value)
                              setOrderTypeOpen(true)
                            }}
                            onKeyDown={handleOrderTypeKeyDown}
                            onFocus={() => setOrderTypeOpen(true)}
                            className={errors.orderType ? "border-red-500" : ""}
                          />
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
                      </>
                    )}
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

                  <OrderNumberField value={orderNumber} onChange={setOrderNumber} required error={errors.orderNumber} />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={(e) => { e.stopPropagation(); resetForm(); }} disabled={isPending}>
                  Очистить
                </Button>
                <Button onClick={(e) => { e.stopPropagation(); handleSubmit(); }} disabled={isPending}>
                  {isPending ? "Создание..." : "Создать"}
                </Button>
              </div>
            </div>

            <div className="absolute right-0 top-0 bottom-0 w-[600px] border rounded-lg p-4 bg-muted/20 m-4">
              <h3 className="text-sm font-semibold mb-3">Дополнительные поля</h3>
              {!selectedOrderType?.field_schema?.length ? (
                <p className="text-xs text-muted-foreground">Выберите тип приказа</p>
              ) : (
                <div className="flex flex-wrap gap-x-3 gap-y-3">
                  {selectedOrderType.field_schema.map((field) => (
                    <div key={field.key}>
                      {field.type === "date" ? (
                        <div className="w-[130px]">
                        <DatePicker
                          label={field.label}
                          value={extraFields[field.key] || ""}
                          onChange={(v) => {
                            lastChangedRef.current = field.key
                            setExtraFields((prev) => ({ ...prev, [field.key]: v }))
                          }}
                        />
                        </div>
                      ) : (
                        <>
                          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                          <Input
                            type="number"
                            value={extraFields[field.key] || ""}
                            onChange={(e) => {
                              lastChangedRef.current = field.key
                              setExtraFields((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }}
                            className="h-10 w-[130px]"
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          <Button
            variant={!year ? "default" : "outline"}
            size="sm"
            onClick={() => setYear(undefined)}
          >
            Все года
          </Button>
          {years?.map((y) => (
            <Button
              key={y}
              variant={year === y ? "default" : "outline"}
              size="sm"
              onClick={() => setYear(y)}
            >
              {y}
            </Button>
          ))}
        </div>
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
