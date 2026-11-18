import type { TimesheetEmployeeRow } from "@/entities/timesheet"
import { cellToClipboardValue, parseClipboardValue } from "./clipboard"
import type { ShiftTypeMap } from "./types"

/**
 * Внутренний буфер табеля (#106).
 *
 * Сетка держит скопированные значения у себя, а не читает системный буфер на
 * вставке: браузер может не дать доступ к clipboard (права, встроенные окна),
 * а нам нужен предсказуемый сценарий «скопировал одну ячейку — заполнил
 * выделение». Тот же текст уходит в системный буфер событием copy, поэтому
 * обмен с Excel продолжает работать.
 */

/** Скопированные видимые значения: строка — ряд сетки, колонка — день. */
export interface ClipboardPayload {
  values: string[][]
  /** TSV-представление для системного буфера обмена (формат Excel). */
  text: string
}

/** Прямоугольник сетки (строки — сотрудники, колонки — дни). */
export interface GridRange {
  min: { row: number; col: number }
  max: { row: number; col: number }
}

/** Предыдущее ручное значение ячейки для стека отмены. */
export interface RestoreCell {
  employee_id: number
  work_date: string
  shift_type_code: string | null
  planned_hours_override: number | null
}

/** Ячейка, которую нужно записать ручным слоем. */
export interface PasteChange {
  employee_id: number
  work_date: string
  shift_type_code: string
  planned_hours_override: null
}

export interface PastePlan {
  /** Новые строки сетки (неизменённые строки — те же ссылки). */
  rows: TimesheetEmployeeRow[]
  /** Записи для partial-bulk: все изменённые ячейки одним запросом. */
  changes: PasteChange[]
  /** Предыдущие значения всех изменённых ячеек — одна запись в истории. */
  restore: RestoreCell[]
  /** Сколько непустых нераспознанных значений отброшено. */
  rejected: number
}

/** Матрица видимых значений диапазона + TSV для системного буфера. */
export function buildClipboardPayload(
  rows: TimesheetEmployeeRow[],
  dayDates: string[],
  range: GridRange,
  shiftTypeMap: ShiftTypeMap
): ClipboardPayload {
  const values: string[][] = []
  for (let r = range.min.row; r <= range.max.row; r++) {
    const row = rows[r]
    if (!row) continue
    const line: string[] = []
    for (let c = range.min.col; c <= range.max.col; c++) {
      const date = dayDates[c]
      line.push(date ? cellToClipboardValue(row.cells?.[date], shiftTypeMap) : "")
    }
    values.push(line)
  }
  return { values, text: payloadToTsv(values) }
}

/** Матрица → текст для системного буфера: табуляции между днями, \n между строками. */
export function payloadToTsv(values: string[][]): string {
  return values.map((line) => line.join("\t")).join("\n")
}

/**
 * TSV из системного буфера → матрица. Понимает \r\n и хвостовой перевод
 * строки (Excel их добавляет); пустой текст → null.
 */
export function parseClipboardText(text: string): ClipboardPayload | null {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "")
  if (!normalized) return null
  const values = normalized.split("\n").map((line) => line.split("\t"))
  return { values, text: normalized }
}

/**
 * План вставки: раскладывает буфер по целевому прямоугольнику, повторяя его
 * циклически (как протяжка), и останавливается на границах выделения.
 *
 * Каждая ячейка проходит тот же путь, что ручная правка: значение
 * распознаётся в код смены и пишется в ручной слой (manual/result,
 * order_changed: false), конфликт и авто-слой сохраняются. Нераспознанное
 * не пишется и считается в rejected; read-only ячейки пропускаются.
 */
export function buildPastePlan(params: {
  rows: TimesheetEmployeeRow[]
  dayDates: string[]
  target: GridRange
  clipboard: ClipboardPayload
  shiftTypeMap: ShiftTypeMap
  /** Ячейка заблокирована для правки — вставка её не трогает. */
  isReadOnly?: (rowIndex: number, colIndex: number) => boolean
}): PastePlan {
  const { rows, dayDates, target, clipboard, shiftTypeMap, isReadOnly } = params
  const values = clipboard.values.length > 0 ? clipboard.values : [[""]]
  const bufferHeight = values.length
  const bufferWidth = Math.max(1, ...values.map((line) => line.length))

  const nextRows = [...rows]
  const changes: PasteChange[] = []
  const restore: RestoreCell[] = []
  let rejected = 0

  for (let r = target.min.row; r <= target.max.row; r++) {
    const row = rows[r]
    if (!row) continue
    const updatedCells = { ...row.cells }
    let rowChanged = false

    for (let c = target.min.col; c <= target.max.col; c++) {
      const date = dayDates[c]
      if (!date) continue
      if (isReadOnly?.(r, c)) continue

      const value =
        values[(r - target.min.row) % bufferHeight]?.[(c - target.min.col) % bufferWidth] ?? ""
      if (value.trim() === "") continue

      const code = parseClipboardValue(value, shiftTypeMap)
      if (!code) {
        rejected += 1
        continue
      }

      const cellDay = row.cells?.[date]
      const manual = cellDay?.manual ?? null
      // Уже ровно это ручное значение — нечего писать и нечего отменять
      if (manual?.shift_type_code === code && manual.planned_hours_override === null) continue

      restore.push({
        employee_id: row.id,
        work_date: date,
        shift_type_code: manual?.shift_type_code ?? null,
        planned_hours_override: manual?.planned_hours_override ?? null,
      })
      updatedCells[date] = {
        auto: cellDay?.auto ?? null,
        manual: { shift_type_code: code, planned_hours_override: null, note: null },
        result: code,
        conflict: cellDay?.conflict ?? false,
        order_changed: false,
      }
      changes.push({
        employee_id: row.id,
        work_date: date,
        shift_type_code: code,
        planned_hours_override: null,
      })
      rowChanged = true
    }

    if (rowChanged) nextRows[r] = { ...row, cells: updatedCells }
  }

  return { rows: nextRows, changes, restore, rejected }
}

/**
 * Целевой прямоугольник вставки.
 *
 * Выделение больше одной ячейки — вставляем внутрь него (буфер повторяется).
 * Одна активная ячейка — вставка «растекается» по размеру буфера, как в Excel:
 * скопированный диапазон 1×2 занимает две ячейки вправо.
 */
export function resolvePasteTarget(params: {
  activeCell: { row: number; col: number } | null
  selection: GridRange | null
  buffer: ClipboardPayload
  rowCount: number
  colCount: number
}): GridRange | null {
  const { activeCell, selection, buffer, rowCount, colCount } = params
  const anchor = selection?.min ?? activeCell
  if (!anchor) return null

  const minRow = Math.max(0, anchor.row)
  const minCol = Math.max(0, anchor.col)
  const bufferHeight = Math.max(1, buffer.values.length)
  const bufferWidth = Math.max(1, ...buffer.values.map((line) => line.length))

  const hasSelection =
    !!selection && (selection.max.row > selection.min.row || selection.max.col > selection.min.col)

  const maxRow = hasSelection
    ? Math.min(rowCount - 1, selection!.max.row)
    : Math.min(rowCount - 1, minRow + bufferHeight - 1)
  const maxCol = hasSelection
    ? Math.min(colCount - 1, selection!.max.col)
    : Math.min(colCount - 1, minCol + bufferWidth - 1)

  if (minRow > maxRow || minCol > maxCol) return null
  return { min: { row: minRow, col: minCol }, max: { row: maxRow, col: maxCol } }
}
