export interface OrderField {
  key: string
  label: string
  type: "date" | "number"
}

export const ORDER_TYPE_FIELDS: Record<string, OrderField[]> = {
  "Прием на работу": [
    { key: "hire_date", label: "Дата приема", type: "date" },
    { key: "contract_end", label: "Конец контракта", type: "date" },
    { key: "trial_end", label: "Конец испыт. срока", type: "date" },
  ],
  "Увольнение": [
    { key: "dismissal_date", label: "Дата увольнения", type: "date" },
  ],
  "Отпуск трудовой": [
    { key: "vacation_start", label: "Начало отпуска", type: "date" },
    { key: "vacation_end", label: "Конец отпуска", type: "date" },
    { key: "vacation_days", label: "Дней", type: "number" },
  ],
  "Отпуск за свой счет": [
    { key: "vacation_start", label: "Начало отпуска", type: "date" },
    { key: "vacation_end", label: "Конец отпуска", type: "date" },
    { key: "vacation_days", label: "Дней", type: "number" },
  ],
  "Больничный": [
    { key: "sick_leave_start", label: "Начало", type: "date" },
    { key: "sick_leave_end", label: "Конец", type: "date" },
    { key: "sick_leave_days", label: "Дней", type: "number" },
  ],
  "Перевод": [
    { key: "transfer_date", label: "Дата перевода", type: "date" },
  ],
  "Продление контракта": [
    { key: "contract_new_end", label: "Новая дата конца контракта", type: "date" },
    { key: "trial_end", label: "Конец испыт. срока", type: "date" },
  ],
}

export function getExtraFields(orderType: string): OrderField[] {
  return ORDER_TYPE_FIELDS[orderType] || []
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

const DAYS_MAP: Record<string, { start: string; end: string }> = {
  vacation_days: { start: "vacation_start", end: "vacation_end" },
  sick_leave_days: { start: "sick_leave_start", end: "sick_leave_end" },
}

export function getAutoDaysConfig(fieldKey: string): { start: string; end: string } | null {
  return DAYS_MAP[fieldKey] || null
}
