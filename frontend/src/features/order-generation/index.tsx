import { useState, useEffect, useRef } from "react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Badge } from "@/shared/ui/badge"
import { Check, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { useCreateOrder, useNextOrderNumber, useOrderTypes } from "@/entities/order/useOrders"
import { useSearchEmployees } from "@/entities/employee/useEmployees"
import type { Employee } from "@/entities/employee/types"

interface OrderGenerationProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrderGeneration({ open, onOpenChange }: OrderGenerationProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Employee[]>([])
  const [orderType, setOrderType] = useState("")
  const [orderTypeSearch, setOrderTypeSearch] = useState("")
  const [orderTypeOpen, setOrderTypeOpen] = useState(false)
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [orderNumber, setOrderNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const orderTypeRef = useRef<HTMLDivElement>(null)

  const { data: types } = useOrderTypes()
  const { data: nextNumber } = useNextOrderNumber(new Date().getFullYear())
  const { data: searchResult } = useSearchEmployees(searchQuery)
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

  const filteredTypes = (types || []).filter((t) =>
    t.toLowerCase().includes(orderTypeSearch.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (orderTypeRef.current && !orderTypeRef.current.contains(e.target as Node)) {
        setOrderTypeOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) {
      setSelectedEmployee(null)
      setSearchQuery("")
      setSearchResults([])
      setOrderType("")
      setOrderTypeSearch("")
      setOrderTypeOpen(false)
      setOrderDate(new Date().toISOString().split("T")[0])
      setOrderNumber("")
      setNotes("")
      setErrors({})
    }
  }, [open])

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp)
    setSearchQuery("")
    setSearchResults([])
  }

  const selectOrderType = (type: string) => {
    setOrderType(type)
    setOrderTypeSearch(type)
    setOrderTypeOpen(false)
  }

  const clearEmployee = () => {
    setSelectedEmployee(null)
    setSearchQuery("")
    setSearchResults([])
  }

  const clearOrderType = () => {
    setOrderType("")
    setOrderTypeSearch("")
    setOrderTypeOpen(false)
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
        notes: notes || undefined,
      },
      {
        onSuccess: () => onOpenChange(false),
      }
    )
  }

  const isPending = createMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать приказ</DialogTitle>
          <DialogDescription>Заполните данные для генерации приказа</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div>
            <label className="text-sm font-medium">Сотрудник *</label>
            {selectedEmployee ? (
              <div
                className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted/70"
                onClick={clearEmployee}
                title="Нажмите чтобы перевыбрать"
              >
                <Check className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm flex-1 truncate">
                  {selectedEmployee.name}
                  {selectedEmployee.tab_number && (
                    <span className="text-muted-foreground ml-1">(таб. {selectedEmployee.tab_number})</span>
                  )}
                </span>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {selectedEmployee.department}
                </Badge>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearEmployee(); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Поиск по ФИО или таб. номеру..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleEmployeeKeyDown}
                  className={errors.employee ? "border-red-500" : ""}
                />
                {searchResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md max-h-48 overflow-y-auto">
                    {searchResults.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0 flex items-center gap-2"
                        onClick={() => selectEmployee(emp)}
                      >
                        <span className="font-medium truncate">{emp.name}</span>
                        {emp.tab_number && (
                          <span className="text-muted-foreground shrink-0">таб. {emp.tab_number}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {errors.employee && <p className="text-xs text-red-500 mt-1">{errors.employee}</p>}
          </div>

          <div ref={orderTypeRef} className="relative">
            <label className="text-sm font-medium">Тип приказа *</label>
            {orderType ? (
              <div
                className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted/70"
                onClick={clearOrderType}
                title="Нажмите чтобы перевыбрать"
              >
                <Check className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm flex-1">{orderType}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearOrderType(); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Выберите тип приказа..."
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
                {orderTypeOpen && orderTypeSearch && filteredTypes.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full border rounded-md bg-popover shadow-md p-3 text-sm text-muted-foreground">
                    Тип не найден
                  </div>
                )}
              </>
            )}
            {errors.orderType && <p className="text-xs text-red-500 mt-1">{errors.orderType}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Дата приказа *</label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
              {errors.orderDate && <p className="text-xs text-red-500 mt-1">{errors.orderDate}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">Номер приказа</label>
              <Input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Авто"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Примечания</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Необязательно"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Создание..." : "Создать приказ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
