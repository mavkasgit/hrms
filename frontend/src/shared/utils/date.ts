import { format, parse, isValid, getDay } from "date-fns"
import { ru } from "date-fns/locale"

/**
 * Безопасный парсинг даты из ISO строки (YYYY-MM-DD)
 * Всегда возвращает локальную дату без проблем с timezone
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return isValid(date) ? date : null
}

/**
 * Форматировать дату для отображения (DD.MM.YYYY)
 */
export function formatDate(date: Date | string | null, formatStr = "dd.MM.yyyy"): string {
  if (!date) return "—"
  const d = typeof date === "string" ? parseDate(date) : date
  if (!d) return "—"
  return format(d, formatStr, { locale: ru })
}

/**
 * Форматировать дату с годом (DD.MM.YYYY)
 */
export function formatDateWithYear(date: Date | string | null): string {
  return formatDate(date, "dd.MM.yyyy")
}

/**
 * Получить день недели (0 = вс, 1 = пн, ..., 6 = сб)
 * Не зависит от timezone!
 */
export function getDayOfWeek(date: Date | string): number {
  const d = typeof date === "string" ? parseDate(date) : date
  if (!d) return -1
  return getDay(d)
}

/**
 * Русское название дня недели
 */
export const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]

/**
 * Получить день недели по-русски
 */
export function getDayName(date: Date | string): string {
  const day = getDayOfWeek(date)
  return day >= 0 ? WEEKDAYS[day] : "—"
}

/**
 * Проверить, является ли день выходным (сб или вс)
 */
export function isWeekend(date: Date | string): boolean {
  const day = getDayOfWeek(date)
  return day === 0 || day === 6
}

/**
 * Парсить дату из input (YYYY-MM-DD)
 */
export function parseInputDate(value: string): Date | null {
  if (!value) return null
  const date = parse(value, "yyyy-MM-dd", new Date())
  return isValid(date) ? date : null
}

/**
 * Форматировать дату для input (YYYY-MM-DD)
 */
export function formatForInput(date: Date | null): string {
  if (!date) return ""
  return format(date, "yyyy-MM-dd")
}

/**
 * Получить текущий год
 */
export function getCurrentYear(): number {
  return new Date().getFullYear()
}