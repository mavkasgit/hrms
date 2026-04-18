import type { OrderTypeFieldSchema } from "./types"

export function getExtraFields(fields: OrderTypeFieldSchema[] | undefined): OrderTypeFieldSchema[] {
  return fields || []
}

export function calculateDaysBetween(startKey: string, endKey: string, extraFields: Record<string, string>): number | null {
  const start = extraFields[startKey]
  const end = extraFields[endKey]
  if (!start || !end) return null
  const d1 = new Date(start)
  const d2 = new Date(end)
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  const diff = Math.round(Math.abs((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))) + 1
  return diff > 0 ? diff : null
}

export function calculateEndDate(startKey: string, daysKey: string, extraFields: Record<string, string>): string | null {
  const start = extraFields[startKey]
  const days = parseInt(extraFields[daysKey], 10)
  if (!start || isNaN(days) || days <= 0) return null
  const d = new Date(start)
  d.setDate(d.getDate() + days - 1)
  return d.toISOString().split("T")[0]
}

export function calculateStartDate(endKey: string, daysKey: string, extraFields: Record<string, string>): string | null {
  const end = extraFields[endKey]
  const days = parseInt(extraFields[daysKey], 10)
  if (!end || isNaN(days) || days <= 0) return null
  const d = new Date(end)
  d.setDate(d.getDate() - days + 1)
  return d.toISOString().split("T")[0]
}
