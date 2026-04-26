import { useState, useEffect, useId, useRef } from "react"
import { ListFilter } from "lucide-react"
import { Input } from "@/shared/ui/input"
import { useNextOrderNumber, useRecentOrders } from "@/entities/order/useOrders"
import type { OrderType, Order } from "@/entities/order/types"

function formatOrderDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
}

function RecentOrdersList({ orders, onSelect }: { orders: Order[]; onSelect: (num: string) => void }) {
  const recentOrders = [...orders].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 5)
  if (!recentOrders.length) return <p className="text-xs text-muted-foreground py-2">Приказов пока нет</p>
  return (
    <div className="flex flex-col gap-1">
      {recentOrders.map((o) => {
        const nameParts = (o.employee_name || "").split(" ")
        const lastName = nameParts[0] || ""
        const initials = nameParts.slice(1, 3).map((p) => `${p[0]}.`).join("")
        const typeName = o.order_type_name || ""
        return (
          <div
            key={o.id}
            className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-muted rounded px-1 whitespace-nowrap"
            onClick={() => onSelect(o.order_number)}
          >
            <span className="font-mono font-semibold shrink-0">№{o.order_number}</span>
            <span className="text-muted-foreground shrink-0">{formatOrderDate(o.order_date)}</span>
            <span className="font-semibold shrink-0">{lastName} {initials}</span>
            <span className="text-muted-foreground truncate max-w-[140px]">{typeName}</span>
          </div>
        )
      })}
    </div>
  )
}

interface OrderNumberFieldProps {
  value: string
  onChange: (v: string) => void
  orderTypeId?: number
  orderTypes?: OrderType[]
  required?: boolean
  error?: string
}

export function OrderNumberField({
  value,
  onChange,
  orderTypeId,
  orderTypes,
  required,
  error,
}: OrderNumberFieldProps) {
  const id = useId()
  const [letter, setLetter] = useState<string | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: suggestedNumber } = useNextOrderNumber(orderTypeId)
  const { data: recentOrdersData } = useRecentOrders(100)
  const recentOrders = (recentOrdersData || []).filter((o) => {
    if (!letter) return true
    return o.order_number.endsWith(`-${letter}`)
  })

  useEffect(() => {
    if (!orderTypeId || !orderTypes) {
      setLetter(null)
      onChange("")
      return
    }
    const type = orderTypes.find((t) => t.id === orderTypeId)
    setLetter(type?.letter ?? null)
  }, [orderTypeId, orderTypes, onChange])

  useEffect(() => {
    if (suggestedNumber && !value) {
      onChange(suggestedNumber)
    }
  }, [suggestedNumber, value, onChange])

  // Вычисляем отображаемое значение: убираем суффикс -{letter} если он есть
  const displayValue = letter && value.endsWith(`-${letter}`)
    ? value.slice(0, -(letter.length + 1))
    : value

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    // Передаём как есть, без модификаций
    onChange(v)
  }

  const handleBlur = () => {
    if (letter && value && !value.endsWith(`-${letter}`)) {
      onChange(`${value}-${letter}`)
    }
  }

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPopoverOpen(true)
  }

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => setPopoverOpen(false), 200)
  }

  const hasError = error || (required && !value)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        Номер приказа
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center gap-1">
          <div className="relative">
            <Input
              id={id}
              value={displayValue}
              onChange={handleChange}
              onBlur={handleBlur}
              className={`h-10 text-sm w-[100px] pr-7 ${hasError ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              onFocus={(e) => e.target.select()}
            />
            <ListFilter className="h-3 w-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          {letter && (
            <span className="text-sm text-muted-foreground px-2 py-2 h-10 border rounded-md bg-muted flex items-center">
              -{letter}
            </span>
          )}
        </div>
        {popoverOpen && (
          <div
            className="absolute top-full left-0 mt-1 min-w-[420px] border rounded-md bg-background p-2 z-50 shadow-lg"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Последние приказы ({letter ? `литера ${letter}` : "все"})</p>
            <RecentOrdersList
              orders={recentOrders}
              onSelect={(num) => {
                onChange(num)
                setPopoverOpen(false)
              }}
            />
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
