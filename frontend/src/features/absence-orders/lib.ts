import { calculateDaysDifference, formatDate } from "@/shared/utils/date"
import type { ColumnSortDef, SortConfig } from "@/shared/hooks/useTableQueryEngine"
import type { GroupEmployeeInfo, Order } from "@/entities/order/types"
import type { AbsenceEntry, AbsenceKind, AbsenceRange } from "./types"

export function defaultPeriodStartIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-01-01`
}

/** Детализация ошибки API по стандартной схеме ответа (detail || message). */
export function getApiErrorDetail(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: string } }; message?: string } | undefined
  return e?.response?.data?.detail || e?.message || fallback
}

export function defaultPeriodEndIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-12-31`
}

export function normalizeIsoDate(value: string): string {
  return value.slice(0, 10)
}

/** Календарные дни диапазона (включительно); пусто, если диапазон некорректен. */
export function calcDays(startDate: string, endDate: string): string {
  const days = calculateDaysDifference(startDate, endDate)
  return days > 0 ? String(days) : ""
}

/** Дата окончания «начало + N-1 день» (включительно). */
export function calculateVacationEnd(start: string, days: number): string {
  if (!start || days <= 0) return ""
  const [y, m, d] = start.split("-")
  if (!y || !m || !d) return ""
  const end = new Date(Number(y), Number(m) - 1, Number(d))
  if (Number.isNaN(end.getTime())) return ""
  end.setDate(end.getDate() + days - 1)
  const ey = end.getFullYear()
  const em = String(end.getMonth() + 1).padStart(2, "0")
  const ed = String(end.getDate()).padStart(2, "0")
  return `${ey}-${em}-${ed}`
}

export function daysInclusive(start: string, end: string): number {
  return calculateDaysDifference(start, end)
}

export function intersectsPeriod(range: AbsenceRange, periodStart: string, periodEnd: string): boolean {
  if (!periodStart && !periodEnd) return true
  if (periodStart && range.end < periodStart) return false
  if (periodEnd && range.start > periodEnd) return false
  return true
}

export function overlapDays(range: AbsenceRange, periodStart: string, periodEnd: string): number {
  const effectiveStart = periodStart && periodStart > range.start ? periodStart : range.start
  const effectiveEnd = periodEnd && periodEnd < range.end ? periodEnd : range.end
  if (effectiveEnd < effectiveStart) return 0
  return daysInclusive(effectiveStart, effectiveEnd)
}

export function callPeriodLabel(extra: Record<string, unknown>): string {
  const singleDate = typeof extra.call_date === "string" ? extra.call_date : ""
  const rangeStart = typeof extra.call_date_start === "string" ? extra.call_date_start : ""
  const rangeEnd = typeof extra.call_date_end === "string" ? extra.call_date_end : ""
  if (singleDate) return formatDate(singleDate)
  if (rangeStart || rangeEnd) return `${formatDate(rangeStart)} — ${formatDate(rangeEnd)}`
  return "—"
}

function parseUnpaidRange(extra: Record<string, unknown>): AbsenceRange | null {
  const start = typeof extra.vacation_start === "string" ? normalizeIsoDate(extra.vacation_start) : ""
  const endRaw = typeof extra.vacation_end === "string" ? normalizeIsoDate(extra.vacation_end) : ""
  const end = endRaw || start
  if (!start && !end) return null
  if (!start) return { start: end, end }
  if (!end) return { start, end: start }
  return start <= end ? { start, end } : { start: end, end: start }
}

function parseCallRange(extra: Record<string, unknown>): AbsenceRange | null {
  const single = typeof extra.call_date === "string" ? normalizeIsoDate(extra.call_date) : ""
  if (single) return { start: single, end: single }
  const start = typeof extra.call_date_start === "string" ? normalizeIsoDate(extra.call_date_start) : ""
  const end = typeof extra.call_date_end === "string" ? normalizeIsoDate(extra.call_date_end) : ""
  if (start && end) return start <= end ? { start, end } : { start: end, end: start }
  if (start) return { start, end: start }
  if (end) return { start: end, end }
  return null
}

/** Проекция приказа в строки сводки — «Отпуск за свой счёт». */
export function toUnpaidLeaveEntries(order: Order): AbsenceEntry[] {
  if (order.is_group) {
    return (order.group_employees || []).flatMap((employee) => {
      const range = parseUnpaidRange({
        vacation_start: employee.vacation_start,
        vacation_end: employee.vacation_end,
      })
      if (!range) return []
      return [{
        orderId: order.id,
        employeeName: employee.employee_full_name || "Неизвестный сотрудник",
        range,
        explicitDays: employee.vacation_days > 0 ? employee.vacation_days : null,
      }]
    })
  }

  const extra = (order.extra_fields || {}) as Record<string, unknown>
  const range = parseUnpaidRange(extra)
  if (!range) return []
  const explicitDaysRaw = typeof extra.vacation_days === "number" ? extra.vacation_days : Number(extra.vacation_days)
  const explicitDays = Number.isNaN(explicitDaysRaw) || explicitDaysRaw <= 0 ? null : explicitDaysRaw

  return [{
    orderId: order.id,
    employeeName: order.employee_name || "Неизвестный сотрудник",
    range,
    explicitDays,
  }]
}

/** Проекция приказа в строки сводки — «Вызовы в выходные дни». */
export function toWeekendCallEntries(order: Order): AbsenceEntry[] {
  if (order.is_group) {
    return (order.group_employees || []).flatMap((employee) => {
      const range = parseCallRange({
        call_date_start: employee.vacation_start,
        call_date_end: employee.vacation_end,
      })
      if (!range) return []
      return [{
        orderId: order.id,
        employeeName: employee.employee_full_name || "Неизвестный сотрудник",
        range,
        explicitDays: null,
      }]
    })
  }

  const extra = (order.extra_fields || {}) as Record<string, unknown>
  const range = parseCallRange(extra)
  if (!range) return []

  return [{
    orderId: order.id,
    employeeName: order.employee_name || "Неизвестный сотрудник",
    range,
    explicitDays: null,
  }]
}

// ===== Сводка по сотрудникам =====

export interface SummaryRow {
  name: string
  count: number
  days: number
}

/** Дни записи за период: для отпуска без периода — явные дни (vacation_days). */
function entryDays(entry: AbsenceEntry, periodStart: string, periodEnd: string): number {
  if (entry.explicitDays && !periodStart && !periodEnd) return entry.explicitDays
  return overlapDays(entry.range, periodStart, periodEnd)
}

export function totalDaysOf(entries: AbsenceEntry[], periodStart: string, periodEnd: string): number {
  return entries.reduce((sum, entry) => sum + entryDays(entry, periodStart, periodEnd), 0)
}

export function buildSummaryRows(
  entries: AbsenceEntry[],
  periodStart: string,
  periodEnd: string,
): SummaryRow[] {
  const map = new Map<string, SummaryRow>()
  for (const entry of entries) {
    const current = map.get(entry.employeeName) || { name: entry.employeeName, count: 0, days: 0 }
    current.count += 1
    current.days += entryDays(entry, periodStart, periodEnd)
    map.set(entry.employeeName, current)
  }
  return Array.from(map.values())
}

// ===== Сортируемая/фильтруемая таблица приказов =====

export type MainField = "order_number" | "employee_name" | "order_date" | "period" | "days" | "call_date"

export function buildMainSortDefs(kind: AbsenceKind): ColumnSortDef<Order, MainField>[] {
  const employeeNameSort: ColumnSortDef<Order, MainField> = {
    field: "employee_name",
    getSortValue: (order) => {
      if (order.is_group && order.group_employees && order.group_employees.length > 0) {
        const names = order.group_employees.map((e) => e.employee_full_name).filter(Boolean)
        if (names.length > 0) {
          names.sort((a, b) => a.localeCompare(b, "ru"))
          return names[0]
        }
      }
      return order.employee_name ?? ""
    },
  }

  if (kind === "vacation") {
    return [
      { field: "order_number", getSortValue: (order) => order.order_number ?? "" },
      employeeNameSort,
      {
        field: "period",
        getSortValue: (order) => {
          if (order.is_group && order.group_employees && order.group_employees.length > 0) {
            const starts = order.group_employees.map((e) => e.vacation_start).filter(Boolean)
            if (starts.length > 0) {
              starts.sort()
              return starts[0]
            }
          }
          const extra = order.extra_fields || {}
          return String(extra.vacation_start || "")
        },
      },
      {
        field: "days",
        getSortValue: (order) => {
          if (order.is_group && order.group_employees && order.group_employees.length > 0) {
            const days = order.group_employees.map((e) => e.vacation_days).filter(Boolean)
            if (days.length > 0) {
              return Math.max(...days)
            }
          }
          const extra = order.extra_fields || {}
          return Number(extra.vacation_days || 0)
        },
      },
      { field: "order_date", getSortValue: (order) => order.order_date ?? "" },
    ]
  }

  return [
    { field: "order_number", getSortValue: (order) => order.order_number ?? "" },
    employeeNameSort,
    {
      field: "call_date",
      getSortValue: (order) => {
        if (order.is_group && order.group_employees && order.group_employees.length > 0) {
          const starts = order.group_employees.map((e) => e.vacation_start).filter(Boolean)
          if (starts.length > 0) {
            starts.sort()
            return starts[0]
          }
        }
        const extra = (order.extra_fields || {}) as Record<string, unknown>
        const range = parseCallRange(extra)
        return range ? range.start : ""
      },
    },
    { field: "order_date", getSortValue: (order) => order.order_date ?? "" },
  ]
}

export function mainFilterPredicate(
  kind: AbsenceKind,
  columnFilters: Record<string, Set<string>>,
): ((order: Order) => boolean) | null {
  const hasFilters = Object.values(columnFilters).some((s) => s && s.size > 0)
  if (!hasFilters) return null

  return (order: Order) => {
    for (const [field, selected] of Object.entries(columnFilters)) {
      if (selected && selected.size > 0) {
        if (field === "order_number") {
          const val = order.order_number ?? "—"
          if (!selected.has(val)) return false
        } else if (field === "employee_name") {
          if (order.is_group && order.group_employees) {
            const hasMatchingEmployee = order.group_employees.some((e) => selected.has(e.employee_full_name))
            if (!hasMatchingEmployee) return false
          } else {
            const val = order.employee_name ?? "—"
            if (!selected.has(val)) return false
          }
        } else if (field === "period") {
          if (kind !== "vacation") continue
          if (order.is_group && order.group_employees) {
            const hasMatchingEmployee = order.group_employees.some((e) => {
              const label = `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
              return selected.has(label)
            })
            if (!hasMatchingEmployee) return false
          } else {
            const extra = order.extra_fields || {}
            const val = extra.vacation_start
              ? `${formatDate(String(extra.vacation_start))} — ${formatDate(String(extra.vacation_end || extra.vacation_start))}`
              : "—"
            if (!selected.has(val)) return false
          }
        } else if (field === "days") {
          if (kind !== "vacation") continue
          if (order.is_group && order.group_employees) {
            const hasMatchingEmployee = order.group_employees.some((e) => selected.has(String(e.vacation_days)))
            if (!hasMatchingEmployee) return false
          } else {
            const extra = order.extra_fields || {}
            const val = extra.vacation_days ? String(extra.vacation_days) : "—"
            if (!selected.has(val)) return false
          }
        } else if (field === "call_date") {
          if (kind !== "call") continue
          if (order.is_group && order.group_employees) {
            const hasMatchingEmployee = order.group_employees.some((e) => {
              const label = formatDate(e.vacation_start) === formatDate(e.vacation_end)
                ? formatDate(e.vacation_start)
                : `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
              return selected.has(label)
            })
            if (!hasMatchingEmployee) return false
          } else {
            const extra = (order.extra_fields || {}) as Record<string, unknown>
            const val = callPeriodLabel(extra)
            if (!selected.has(val)) return false
          }
        } else if (field === "order_date") {
          const val = formatDate(order.order_date)
          if (!selected.has(val)) return false
        }
      }
    }
    return true
  }
}

export function buildMainUniqueValues(kind: AbsenceKind, orders: Order[]): Record<string, string[]> {
  const employeeNames = new Set<string>()
  const periods = new Set<string>()
  const days = new Set<string>()
  const callDates = new Set<string>()

  orders.forEach((o) => {
    if (o.is_group && o.group_employees) {
      o.group_employees.forEach((e) => {
        if (e.employee_full_name) employeeNames.add(e.employee_full_name)
        if (kind === "vacation") {
          periods.add(`${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`)
          days.add(String(e.vacation_days))
        } else {
          const label = formatDate(e.vacation_start) === formatDate(e.vacation_end)
            ? formatDate(e.vacation_start)
            : `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
          callDates.add(label)
        }
      })
    } else {
      if (o.employee_name) employeeNames.add(o.employee_name)
      const extra = (o.extra_fields || {}) as Record<string, unknown>
      if (kind === "vacation") {
        if (extra.vacation_start) {
          periods.add(`${formatDate(String(extra.vacation_start))} — ${formatDate(String(extra.vacation_end || extra.vacation_start))}`)
        }
        if (extra.vacation_days) days.add(String(extra.vacation_days))
      } else {
        const label = callPeriodLabel(extra)
        if (label !== "—") callDates.add(label)
      }
    }
  })

  return {
    order_number: [...new Set(orders.map((o) => o.order_number ?? "—"))].sort(),
    employee_name: [...employeeNames].sort((a, b) => a.localeCompare(b, "ru")),
    order_date: [...new Set(orders.map((o) => formatDate(o.order_date)))].sort(),
    period: [...periods].sort(),
    days: [...days].sort((a, b) => Number(a) - Number(b)),
    call_date: [...callDates].sort(),
  }
}

/** Строки сотрудников внутри группового приказа: те же фильтры/сортировки, что у колонок. */
export function displayGroupEmployees(
  kind: AbsenceKind,
  order: Order,
  columnFilters: Record<string, Set<string>>,
  sortConfigs: SortConfig<MainField>[],
): GroupEmployeeInfo[] {
  if (!order.group_employees) return []

  let filtered = order.group_employees

  const selectedNames = columnFilters.employee_name
  if (selectedNames && selectedNames.size > 0) {
    filtered = filtered.filter((e) => selectedNames.has(e.employee_full_name))
  }

  if (kind === "vacation") {
    const selectedPeriods = columnFilters.period
    if (selectedPeriods && selectedPeriods.size > 0) {
      filtered = filtered.filter((e) => {
        const label = `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
        return selectedPeriods.has(label)
      })
    }
    const selectedDays = columnFilters.days
    if (selectedDays && selectedDays.size > 0) {
      filtered = filtered.filter((e) => selectedDays.has(String(e.vacation_days)))
    }
  } else {
    const selectedCallDates = columnFilters.call_date
    if (selectedCallDates && selectedCallDates.size > 0) {
      filtered = filtered.filter((e) => {
        const label = formatDate(e.vacation_start) === formatDate(e.vacation_end)
          ? formatDate(e.vacation_start)
          : `${formatDate(e.vacation_start)} — ${formatDate(e.vacation_end)}`
        return selectedCallDates.has(label)
      })
    }
  }

  const nameSort = sortConfigs.find((s) => s.field === "employee_name")
  if (nameSort) {
    const sorted = [...filtered].sort((a, b) => {
      const nameA = a.employee_full_name ?? ""
      const nameB = b.employee_full_name ?? ""
      return nameA.localeCompare(nameB, "ru")
    })
    if (nameSort.order === "desc") sorted.reverse()
    return sorted
  }

  if (kind === "vacation") {
    const periodSort = sortConfigs.find((s) => s.field === "period")
    if (periodSort) {
      const sorted = [...filtered].sort((a, b) => {
        const pA = a.vacation_start ?? ""
        const pB = b.vacation_start ?? ""
        return pA.localeCompare(pB, "ru")
      })
      if (periodSort.order === "desc") sorted.reverse()
      return sorted
    }
    const daysSort = sortConfigs.find((s) => s.field === "days")
    if (daysSort) {
      const sorted = [...filtered].sort((a, b) => a.vacation_days - b.vacation_days)
      if (daysSort.order === "desc") sorted.reverse()
      return sorted
    }
  } else {
    const callSort = sortConfigs.find((s) => s.field === "call_date")
    if (callSort) {
      const sorted = [...filtered].sort((a, b) => {
        const pA = a.vacation_start ?? ""
        const pB = b.vacation_start ?? ""
        return pA.localeCompare(pB, "ru")
      })
      if (callSort.order === "desc") sorted.reverse()
      return sorted
    }
  }

  return filtered
}
