import type { Order } from "./types"

export function computeNextOrderNumber(orders: Order[]): string | null {
  if (!orders.length) return null

  // Находим заказ с максимальным ID
  let maxId = 0
  for (const o of orders) {
    if ((o.id ?? 0) > maxId) maxId = o.id ?? 0
  }

  return `${maxId + 1}`
}
