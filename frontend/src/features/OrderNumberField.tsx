import { useState, useEffect, useMemo } from "react"
import { useNextOrderNumber, useRecentOrders } from "@/entities/order"
import type { OrderType } from "@/entities/order"
import { DocumentNumberField } from "./DocumentNumberField"

interface OrderNumberFieldProps {
  value: string
  onChange: (v: string) => void
  orderTypeId?: number
  orderTypes?: OrderType[]
  required?: boolean
  error?: string
  isGeneralOrder?: boolean
  /** Вызывается, когда пользователь вручную меняет номер (не автоподстановка). */
  onUserModified?: (modified: boolean) => void
}

export function OrderNumberField({
  value,
  onChange,
  orderTypeId,
  orderTypes,
  required,
  error,
  isGeneralOrder,
  onUserModified,
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
    if (o.order_type_code === "vacation_unpaid") return false
    if (!letter) return !hasLetterSuffix(o.order_number)
    return o.order_number.endsWith(`-${letter}`)
  })

  const vacationUnpaidOrders = (recentOrdersData || []).filter(
    (o) => o.order_type_code === "vacation_unpaid"
  )

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

  const fillNextFromRow = (items: { id?: number; number?: string | null }[]): string | null => {
    const row = [...items].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
    if (!row?.number) return null
    const m = row.number.match(/^(\d+)(.*)$/)
    if (!m) return null
    return `${parseInt(m[1], 10) + 1}${m[2]}`
  }

  const handleFillNextNumber = () => {
    const next = fillNextFromRow(recentOrders.map((o) => ({ id: o.id, number: o.order_number })))
    if (next) onChange(next)
  }

  const handleFillSectionNextNumber = (section: { items: { number: string | null }[] }) => {
    const next = fillNextFromRow(section.items)
    if (next) onChange(next)
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
      recentSections={
        letter === "к"
          ? [
              {
                title: "Отпуск за свой счет",
                items: vacationUnpaidOrders.map((o) => ({
                  id: o.id ?? 0,
                  number: o.order_number,
                  date: o.order_date,
                  employee_name: o.employee_name,
                })),
              },
            ]
          : undefined
      }
      label="Номер приказа"
      emptyListLabel="Приказов пока нет"
      popoverTitle={`Последние приказы (${letter ? `литера ${letter}` : "без литеры"})`}
      required={required}
      error={error}
      displayValue={displayValue}
      onBlur={handleBlur}
      suffixElement={suffixElement}
      onFillNextNumber={handleFillNextNumber}
      onFillSectionNextNumber={handleFillSectionNextNumber}
      onUserModified={onUserModified}
    />
  )
}
