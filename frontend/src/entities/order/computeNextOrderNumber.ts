import type { Order } from "./types"

export function computeNextOrderNumber(orders: Order[]): string | null {
  if (!orders.length) return null

  // Находим заказ с максимальным ID без сортировки
  let maxId = 0
  for (const o of orders) {
    if ((o.id ?? 0) > maxId) maxId = o.id ?? 0
  }

  const orderWithMaxId = orders.find((o) => o.id === maxId)!
  const lastNum = parseInt(orderWithMaxId.order_number, 10) || 0
  return `${lastNum + 1}`
}
