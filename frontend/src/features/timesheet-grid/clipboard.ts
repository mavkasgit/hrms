import type { TimesheetCellDay } from "@/entities/timesheet"
import { NON_WORKING_LABELS } from "./TimesheetDayCell"
import type { ShiftTypeMap } from "./types"

/**
 * Формат буфера обмена табеля (решение #10, #24).
 *
 * Что едет в буфер за рабочую смену — код смены, а не число часов: часы
 * неоднозначны (day и evening оба 8ч, day_long и night оба 12ч), а код
 * смены даёт однозначный round-trip «скопировал — вставил — исходное
 * значение». Статусы копируются видимой буквой (О/Б/А/П/Д/ВК/ВС) — тем,
 * что видит человек в ячейке.
 */

/** Видимое значение ячейки для буфера: код рабочей смены или буква статуса. */
export function cellToClipboardValue(
  cellDay: TimesheetCellDay | undefined,
  shiftTypeMap: ShiftTypeMap
): string {
  const code = cellDay?.manual?.shift_type_code ?? cellDay?.result ?? null
  if (!code) return ""
  const meta = shiftTypeMap[code]
  if (!meta) return ""
  if (meta.is_working) return code
  return meta.letter ?? NON_WORKING_LABELS[code] ?? code
}

/**
 * Распознаёт значение из буфера (Excel / внешние данные) в код смены.
 * Порядок: точный код смены (без учёта регистра) → буква статуса →
 * число часов (рабочая смена с такими planned_hours, приоритет sort_order).
 * Нераспознанное значение → null (ячейка не записывается, считается отказом).
 */
export function parseClipboardValue(value: string, shiftTypeMap: ShiftTypeMap): string | null {
  const raw = value.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()

  const byCode = Object.keys(shiftTypeMap).find((c) => c.toLowerCase() === lower)
  if (byCode) return byCode

  for (const [code, meta] of Object.entries(shiftTypeMap)) {
    const letter = meta.letter ?? NON_WORKING_LABELS[code]
    if (letter && letter.toLowerCase() === lower) return code
  }

  const hours = Number(raw)
  if (Number.isFinite(hours)) {
    const matches = Object.values(shiftTypeMap)
      .filter((m) => m.is_working && m.planned_hours === hours)
      .sort((a, b) => a.sort_order - b.sort_order)
    if (matches.length) return matches[0].code
  }

  return null
}
