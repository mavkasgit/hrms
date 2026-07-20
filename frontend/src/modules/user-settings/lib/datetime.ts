/**
 * Форматирование дат через Intl — без зависимости от date-fns,
 * чтобы модуль не тащил лишнего в хост-приложение.
 */

/** "ru" → "ru-RU", "en" → "en-US", прочее — как есть. */
function toIntlLocale(locale: string): string {
  if (locale === "ru") return "ru-RU"
  if (locale === "en") return "en-US"
  return locale
}

/** "15.07.2026, 14:32" (или аналог для локали). */
export function formatDateTime(iso: string, intlLocale: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return new Intl.DateTimeFormat(toIntlLocale(intlLocale), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  } catch {
    return iso
  }
}

const DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
]

/** "5 минут назад" / "in 2 days" — через Intl.RelativeTimeFormat. */
export function formatRelativeTime(iso: string, intlLocale: string): string {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    const formatter = new Intl.RelativeTimeFormat(toIntlLocale(intlLocale), {
      numeric: "auto",
    })
    let duration = (date.getTime() - Date.now()) / 1000
    for (const division of DIVISIONS) {
      if (Math.abs(duration) < division.amount) {
        return formatter.format(Math.round(duration), division.unit)
      }
      duration /= division.amount
    }
    return formatDateTime(iso, intlLocale)
  } catch {
    return formatDateTime(iso, intlLocale)
  }
}
