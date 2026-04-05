import type { Order } from "./types"

export function computeNextOrderNumber(
  orders: Order[],
  yearFilter: number | undefined
): string | null {
  if (!orders.length) return null

  const currentYear = new Date().getFullYear()
  const targetYear = yearFilter ?? currentYear

  const ordersForYear = orders.filter((o) => {
    if (!o.order_date) return false
    return new Date(o.order_date).getFullYear() === targetYear
  })

  if (ordersForYear.length === 0) return "01"

  const maxNum = Math.max(
    ...ordersForYear.map((o) => parseInt(o.order_number, 10) || 0)
  )
  return `${maxNum + 1}`
}
