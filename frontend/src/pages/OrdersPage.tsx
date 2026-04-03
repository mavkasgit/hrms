import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Download, X, Check, ChevronDown, ChevronRight, Settings, Eye } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { DatePicker } from "@/shared/ui/date-picker"
import { Badge } from "@/shared/ui/badge"
import { Alert, AlertDescription } from "@/shared/ui/alert"
import { Skeleton } from "@/shared/ui/skeleton"
import { EmptyState } from "@/shared/ui/empty-state"
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
  useNextOrderNumber,
  useCreateOrder,
} from "@/entities/order/useOrders"
import { useSearchEmployees, useEmployees } from "@/entities/employee/useEmployees"
import type { Employee } from "@/entities/employee/types"
import api from "@/shared/api/axios"

const ORDER_TYPE_BADGE_COLORS: Record<string, string> = {
  "Прием на работу": "bg-green-100 text-green-800 border-green-200",
  "Увольнение": "bg-red-100 text-red-800 border-red-200",
  "Отпуск трудовой": "bg-blue-100 text-blue-800 border-blue-200",
  "Отпуск за свой счет": "bg-orange-100 text-orange-800 border-orange-200",
  "Больничный": "bg-purple-100 text-purple-800 border-purple-200",
  "Перевод": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Продление контракта": "bg-yellow-100 text-yellow-800 border-yellow-200",
}

export function OrdersPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState<number | undefined>(undefined)
  const [collapsed, setCollapsed] = useState(false)

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Employee[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [orderType, setOrderType] = useState("")
  const [orderTypeSearch, setOrderTypeSearch] = useState("")
  const [orderTypeOpen, setOrderTypeOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const orderTypeRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error } = useOrders({
    page: 1,
    per_page: 1000,
    year,
  })

  const { data: years } = useOrderYears()
  const { data: types } = useOrderTypes()
  const { data: nextNumber } = useNextOrderNumber(new Date().getFullYear())
  const { data: searchResult } = useSearchEmployees(searchQuery)
  const { data: allEmployees } = useEmployees({ page: 1, per_page: 1000 })
  const createMutation = useCreateOrder()

  useEffect(() => {
    if (nextNumber && !orderNumber) {
      setOrderNumber(nextNumber)
    }
  }, [nextNumber])

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

  const filteredTypes = (types || []).filter((t) =>
    t.toLowerCase().includes(orderTypeSearch.toLowerCase())
  )

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp)
    setSearchQuery("")
    setSearchResults([])
    setSearchOpen(false)
  }

  const selectOrderType = (type: string) => {
    setOrderType(type)
    setOrderTypeSearch(type)
    setOrderTypeOpen(false)
  }

  const clearEmployee = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
  }

  const clearOrderType = () => {
    setOrderType("")
    setOrderTypeSearch("")
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
    setOrderType("")
    setOrderTypeSearch("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setOrderNumber("")
    setErrors({})
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!selectedEmployee) newErrors.employee = "Выберите сотрудника"
    if (!orderType) newErrors.orderType = "Выберите тип приказа"
    if (!orderDate) newErrors.orderDate = "Укажите дату приказа"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    createMutation.mutate(
      {
        employee_id: selectedEmployee!.id,
        order_type: orderType,
        order_date: orderDate,
        order_number: orderNumber || undefined,
      },
      {
        onSuccess: () => resetForm(),
      }
    )
  }

  const handleDownload = async (orderId: number) => {
    try {
      const response = await api.get(`/orders/${orderId}/download`, {
        responseType: "blob",
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      const contentDisposition = response.headers["content-disposition"]
      let filename = `order_${orderId}.docx`
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (match) {
          filename = decodeURIComponent(match[1].replace(/['"]/g, ""))
        }
      }
      link.setAttribute("download", filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      alert("Ошибка при скачивании файла")
    }
  }

  const handlePreview = (orderId: number) => {
    const url = `${import.meta.env.VITE_API_URL || "/api"}/orders/${orderId}/preview`
    window.open(url, "_blank")
  }

  const isPending = createMutation.isPending

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Приказы</h1>
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
                <div className="w-[29%]" ref={searchRef}>
                  <label className="text-sm font-medium">Сотрудник *</label>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => navigate("/templates")}
                      title="Управление шаблонами"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {orderType ? (
                    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50">
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm flex-1">{orderType}</span>
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
                                key={t}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                                onClick={() => selectOrderType(t)}
                              >
                                {t}
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

                <div className="w-[105px]">
                  <label className="text-sm font-medium">Номер приказа</label>
                  <Input
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="Авто"
                  />
                </div>
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
              <TableHead>Таб. №</TableHead>
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
                    className={ORDER_TYPE_BADGE_COLORS[order.order_type] || ""}
                  >
                    {order.order_type}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{order.employee_name || "—"}</TableCell>
                <TableCell className="font-mono text-sm">{order.tab_number ?? "—"}</TableCell>
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
