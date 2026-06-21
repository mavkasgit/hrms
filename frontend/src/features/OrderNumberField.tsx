import { useState, useEffect, useMemo } from "react"
import { useNextOrderNumber, useRecentOrders } from "@/entities/order/useOrders"
import type { OrderType } from "@/entities/order/types"
import { DocumentNumberField } from "./DocumentNumberField"

interface OrderNumberFieldProps {
  value: string
  onChange: (v: string) => void
  orderTypeId?: number
  orderTypes?: OrderType[]
  required?: boolean
  error?: string
  isGeneralOrder?: boolean
}

export function OrderNumberField({
  value,
  onChange,
  orderTypeId,
  orderTypes,
  required,
  error,
  isGeneralOrder,
}: OrderNumberFieldProps) {
  const [letter, setLetter] = useState<string | null>(null)

  const { data: suggestedNumber } = useNextOrderNumber(orderTypeId)
  const { data: recentOrdersData } = useRecentOrders(100)

  const knownLetters = useMemo(
    () =>
      new Set(
        (orderTypes ?? [])
          .map((t) => t.letter)
          .filter((v): v is string => Boolean(v))
          .map((v) => v.toLowerCase()),
      ),
    [orderTypes],
  )

  const hasLetterSuffix = (orderNumber: string): boolean => {
    const idx = orderNumber.lastIndexOf("-")
    if (idx < 0 || idx === orderNumber.length - 1) return false
    const suffix = orderNumber.slice(idx + 1).toLowerCase()
    if (knownLetters.has(suffix)) return true
    return /^[a-zа-яё]$/i.test(suffix)
  }

  const recentOrders = (recentOrdersData || []).filter((o) => {
    if (!letter) return !hasLetterSuffix(o.order_number)
    return o.order_number.endsWith(`-${letter}`)
  })

  useEffect(() => {
    if (!orderTypes || orderTypes.length === 0) {
      setLetter(null)
      return
    }
    if (!orderTypeId) {
      setLetter(null)
      return
    }
    const type = orderTypes.find((t) => t.id === orderTypeId)
    setLetter(type?.letter ?? null)
  }, [orderTypeId, orderTypes])

  // Вычисляем отображаемое значение: убираем суффикс -{letter} если он есть
  const displayValue = letter && value.endsWith(`-${letter}`)
    ? value.slice(0, -(letter.length + 1))
    : value

  const handleBlur = () => {
    if (letter && value && value.trim() && !value.endsWith(`-${letter}`)) {
      onChange(`${value}-${letter}`)
    }
  }

  const suffixElement = isGeneralOrder ? (
    <span className="text-xs text-muted-foreground px-2 py-2 h-10 border rounded-md bg-muted flex items-center whitespace-nowrap">
      Без литеры
    </span>
  ) : letter ? (
    <span className="text-sm text-muted-foreground px-2 py-2 h-10 border rounded-md bg-muted flex items-center">
      -{letter}
    </span>
  ) : null

  return (
    <DocumentNumberField
      value={value}
      onChange={onChange}
      useNextNumber={() => ({ data: suggestedNumber })}
      useRecentItems={() => ({
        data: {
          items: recentOrders.map((o) => ({
            id: o.id ?? 0,
            number: o.order_number,
            date: o.order_date,
            employee_name: o.employee_name,
            typeLabel: o.order_type_name,
          })),
        },
      })}
      label="Номер приказа"
      emptyListLabel="Приказов пока нет"
      popoverTitle={`Последние приказы (${letter ? `литера ${letter}` : "без литеры"})`}
      required={required}
      error={error}
      displayValue={displayValue}
      onBlur={handleBlur}
      suffixElement={suffixElement}
    />
  )
}
