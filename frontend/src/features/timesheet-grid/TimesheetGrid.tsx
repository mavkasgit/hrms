import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DataSheetGrid } from "react-datasheet-grid"
import type { Column, DataSheetGridRef } from "react-datasheet-grid"
import "react-datasheet-grid/dist/style.css"
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCheck, FileCheck2 } from "lucide-react"
import type { TimesheetEmployeeRow, TimesheetGrid as TimesheetGridData } from "@/entities/timesheet"
import { usePartialBulkSet } from "@/entities/work-schedule"
import type { PartialEntryItem } from "@/entities/work-schedule"
import { getShiftTypeMeta, SHIFT_TYPE_CATALOG } from "@/shared/config/shiftTypes"
import { TimesheetDayCell } from "./TimesheetDayCell"
import type { DayColumnData, ShiftTypeMap, TimesheetViewMode, TimesheetSortField } from "./types"

const ROW_HEIGHT = 32
const HEADER_HEIGHT = 36
const PANEL_WIDTH = 240
const DOW_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]

/** Максимальный размер стека отмены */
const UNDO_STACK_MAX = 50

/** Запись стека отмены: предыдущие значения ячеек для восстановления */
interface UndoEntry {
  cells: Array<{
    employee_id: number
    work_date: string
    shift_type_code: string | null
    planned_hours_override: number | null
  }>
}

/** Тип активной ячейки (не экспортируется из react-datasheet-grid) */
interface ActiveCell {
  colId?: string
  col: number
  row: number
}

/** Тип операции onChange (не экспортируется из react-datasheet-grid) */
interface GridOperation {
  type: "UPDATE" | "DELETE" | "CREATE"
  fromRowIndex: number
  toRowIndex: number
}

/** Тип выделения прямоугольника (не экспортируется из react-datasheet-grid) */
interface GridSelection {
  min: { colId?: string; col: number; row: number }
  max: { colId?: string; col: number; row: number }
}

/** Список дат периода (YYYY-MM-DD) от periodStart до periodEnd включительно */
function buildPeriodDays(periodStart: string, periodEnd: string): string[] {
  const days: string[] = []
  const [sy, sm, sd] = periodStart.split("-").map(Number)
  const [ey, em, ed] = periodEnd.split("-").map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    )
  }
  return days
}

export interface TimesheetGridProps {
  employees: TimesheetEmployeeRow[]
  gridData: TimesheetGridData | undefined
  periodStart: string
  periodEnd: string
  viewMode: TimesheetViewMode
  year: number
  month: number
  sortField?: TimesheetSortField
  sortDirection?: "asc" | "desc" | null
  onToggleSort?: (field: TimesheetSortField) => void
}

/**
 * Табель в виде Excel-подобной сетки на react-datasheet-grid.
 * Левая панель с сотрудниками — отдельный sticky-блок (библиотека не умеет sticky left),
 * вертикальный скролл синхронизируется с сеткой.
 */
export function TimesheetGrid({
  employees,
  gridData,
  periodStart,
  periodEnd,
  viewMode,
  sortField = "employee",
  sortDirection = null,
  onToggleSort,
}: TimesheetGridProps) {
  const [rows, setRows] = useState<TimesheetEmployeeRow[]>(employees)
  const prevRowsRef = useRef<TimesheetEmployeeRow[]>(employees)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState(400)
  const gridRef = useRef<DataSheetGridRef>(null)
  const activeCellRef = useRef<ActiveCell | null>(null)

  // Массовое заполнение выделения одним запросом (инвалидация — в хуке)
  const { mutateAsync: partialBulkMutate } = usePartialBulkSet()

  // Стек отмены (in-memory, теряется при перезагрузке — это намеренно)
  const undoStackRef = useRef<UndoEntry[]>([])

  // Выделение прямоугольника (мышь / Shift+стрелки) — для массового заполнения
  const [selection, setSelection] = useState<GridSelection | null>(null)

  // Палитра типов смен
  const shiftTypeMap: ShiftTypeMap = useMemo(() => {
    const map: ShiftTypeMap = {}
    for (const st of gridData?.shift_types ?? []) {
      const meta = getShiftTypeMeta(st.code)
      map[st.code] = { ...st, color: meta?.color ?? "#94a3b8", letter: meta?.letter ?? null }
    }
    return map
  }, [gridData])

  const holidayByDate = useMemo(() => {
    const map: Record<string, { name: string | null }> = {}
    for (const h of gridData?.holidays ?? []) {
      map[h.date] = { name: h.name }
    }
    return map
  }, [gridData])

  const dayDates = useMemo(() => buildPeriodDays(periodStart, periodEnd), [periodStart, periodEnd])

  // Отслеживание активной ячейки для Home/End/PageUp/PageDown
  const handleActiveCellChange = useCallback(({ cell }: { cell: ActiveCell | null }) => {
    activeCellRef.current = cell
  }, [])

  // Home/End/PageUp/PageDown — библиотека не обрабатывает эти клавиши
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cell = activeCellRef.current
      if (!cell) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const { col, row } = cell
      switch (e.key) {
        case "Home":
          e.preventDefault()
          gridRef.current?.setActiveCell({ col: 0, row })
          break
        case "End":
          e.preventDefault()
          gridRef.current?.setActiveCell({ col: dayDates.length - 1, row })
          break
        case "PageUp": {
          e.preventDefault()
          const pageRows = Math.max(1, Math.floor((gridHeight - HEADER_HEIGHT) / ROW_HEIGHT))
          gridRef.current?.setActiveCell({ col, row: Math.max(0, row - pageRows) })
          break
        }
        case "PageDown": {
          e.preventDefault()
          const pageRows = Math.max(1, Math.floor((gridHeight - HEADER_HEIGHT) / ROW_HEIGHT))
          gridRef.current?.setActiveCell({ col, row: Math.min(rows.length - 1, row + pageRows) })
          break
        }
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [dayDates.length, gridHeight, rows.length])

  // Высота сетки по контейнеру (responsive)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h && h > 0) setGridHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Синхронизация строк с пропсами (фильтры/рефетч)
  useEffect(() => {
    setRows(employees)
    prevRowsRef.current = employees
  }, [employees])

  // Синхронизация вертикального скролла левой панели с сеткой
  const handleScroll = useCallback<React.UIEventHandler<HTMLDivElement>>((e) => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTop = e.currentTarget.scrollTop
    }
  }, [])

  /**
   * Пакетное сохранение правок ячеек одним запросом partial-bulk.
   * Эндпоинт сам создаёт графики на нужные месяцы и возвращает построчный
   * результат; частичный отказ не откатывает успешные строки.
   */
  const persistCells = useCallback(
    async (changes: PartialEntryItem[]) => {
      if (changes.length === 0) return
      try {
        const res = await partialBulkMutate({ entries: changes })
        if (res.error_count > 0) {
          console.warn(
            "Часть ячеек табеля не сохранена",
            res.results.filter((r) => !r.success)
          )
        }
      } catch (err) {
        console.error("Не удалось сохранить ячейки табеля", err)
      }
    },
    [partialBulkMutate]
  )

  // Ctrl+Z — отмена последней операции (стек in-memory)
  useEffect(() => {
    const onUndo = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return
      // Не перехватываем, если открыт select (inline-редактор)
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return
      const stack = undoStackRef.current
      if (stack.length === 0) return
      e.preventDefault()
      const entry = stack.pop()!
      // Отправляем обратную операцию на сервер одним запросом
      const restoreEntries: PartialEntryItem[] = entry.cells.map((c) => ({
        employee_id: c.employee_id,
        work_date: c.work_date,
        shift_type_code: c.shift_type_code,
        planned_hours_override: c.planned_hours_override,
      }))
      void persistCells(restoreEntries)
      // Оптимистично обновляем локальные строки
      setRows((prev) => {
        const byId = new Map<number, UndoEntry["cells"][number][]>()
        for (const c of entry.cells) {
          const arr = byId.get(c.employee_id)
          if (arr) arr.push(c)
          else byId.set(c.employee_id, [c])
        }
        return prev.map((row) => {
          const cells = byId.get(row.id)
          if (!cells) return row
          const updatedCells = { ...row.cells }
          for (const c of cells) {
            const existing = updatedCells[c.work_date]
            updatedCells[c.work_date] = {
              auto: existing?.auto ?? null,
              manual: c.shift_type_code
                ? { shift_type_code: c.shift_type_code, planned_hours_override: c.planned_hours_override, note: null }
                : null,
              result: c.shift_type_code || existing?.auto?.shift_type_code || null,
              conflict: existing?.conflict ?? false,
              order_changed: false,
            }
          }
          return { ...row, cells: updatedCells }
        })
      })
    }
    document.addEventListener("keydown", onUndo)
    return () => document.removeEventListener("keydown", onUndo)
  }, [persistCells])

  // Отслеживание выделения прямоугольника (мышь / Shift+стрелки)
  const handleSelectionChange = useCallback(
    ({ selection: sel }: { selection: GridSelection | null }) => setSelection(sel),
    []
  )

  /**
   * Заполнить выделенный прямоугольник одним типом смены.
   * code = null — сброс всех ячеек выделения к авто-слою.
   */
  const fillSelection = useCallback(
    (code: string | null) => {
      if (!selection) return
      const changes: PartialEntryItem[] = []
      const undoCells: UndoEntry["cells"] = []
      const newRows = [...rows]
      for (let r = selection.min.row; r <= selection.max.row; r++) {
        const row = rows[r]
        if (!row) continue
        const updatedCells = { ...row.cells }
        for (let c = selection.min.col; c <= selection.max.col; c++) {
          const date = dayDates[c]
          if (!date) continue
          const cellDay = row.cells?.[date]
          // Запоминаем предыдущее значение для отмены
          undoCells.push({
            employee_id: row.id,
            work_date: date,
            shift_type_code: cellDay?.manual?.shift_type_code ?? null,
            planned_hours_override: cellDay?.manual?.planned_hours_override ?? null,
          })
          updatedCells[date] = {
            auto: cellDay?.auto ?? null,
            manual: code
              ? { shift_type_code: code, planned_hours_override: null, note: null }
              : null,
            result: code || cellDay?.auto?.shift_type_code || null,
            conflict: cellDay?.conflict ?? false,
            order_changed: false,
          }
          changes.push({
            employee_id: row.id,
            work_date: date,
            shift_type_code: code,
            planned_hours_override: null,
          })
        }
        newRows[r] = { ...row, cells: updatedCells }
      }
      // Массовое заполнение — одна запись в истории
      if (undoCells.length > 0) {
        undoStackRef.current.push({ cells: undoCells })
        if (undoStackRef.current.length > UNDO_STACK_MAX) {
          undoStackRef.current.shift()
        }
      }
      prevRowsRef.current = newRows
      setRows(newRows)
      void persistCells(changes)
    },
    [selection, rows, dayDates, persistCells]
  )

  /**
   * «Принять приказ» (#27): сбросить ручные значения во всех ячейках с
   * order_changed=true (по одному сотруднику или по всем сразу) — ячейки
   * вернутся к авто-слою из приказа. Операция кладётся в стек отмены.
   */
  const acceptOrders = useCallback(
    (employeeId?: number) => {
      const changes: PartialEntryItem[] = []
      const undoCells: UndoEntry["cells"] = []
      const newRows = rows.map((row) => {
        if (employeeId !== undefined && row.id !== employeeId) return row
        let touched = false
        const updatedCells = { ...row.cells }
        for (const date of dayDates) {
          const cellDay = row.cells?.[date]
          if (!cellDay?.order_changed) continue
          touched = true
          // Предыдущее ручное значение — в стек отмены
          undoCells.push({
            employee_id: row.id,
            work_date: date,
            shift_type_code: cellDay.manual?.shift_type_code ?? null,
            planned_hours_override: cellDay.manual?.planned_hours_override ?? null,
          })
          updatedCells[date] = {
            auto: cellDay.auto ?? null,
            manual: null,
            result: cellDay.auto?.shift_type_code ?? null,
            conflict: cellDay.conflict ?? false,
            order_changed: false,
          }
          changes.push({
            employee_id: row.id,
            work_date: date,
            shift_type_code: null,
            planned_hours_override: null,
          })
        }
        return touched ? { ...row, cells: updatedCells } : row
      })
      if (changes.length === 0) return
      // Одно «принятие» (включая глобальное) — одна запись в истории
      undoStackRef.current.push({ cells: undoCells })
      if (undoStackRef.current.length > UNDO_STACK_MAX) {
        undoStackRef.current.shift()
      }
      prevRowsRef.current = newRows
      setRows(newRows)
      void persistCells(changes)
    },
    [rows, dayDates, persistCells]
  )

  /**
   * onChange сетки: обновляем строки и персистим изменённые ячейки.
   * UPDATE — правка из inline-редактора, DELETE — сброс ручного значения (клавиша Delete).
   * В обоих случаях сравниваем старую и новую строку поячеечно: deleteValue/редактор
   * создают новый объект ячейки только для изменённой даты, остальные — те же ссылки.
   */
  const handleChange = useCallback(
    (newRows: TimesheetEmployeeRow[], operations: GridOperation[]) => {
      setRows(newRows)
      const prev = prevRowsRef.current
      prevRowsRef.current = newRows

      // Собираем все изменённые ячейки и сохраняем одним запросом partial-bulk.
      // UPDATE — правка из inline-редактора, DELETE — сброс ручного значения
      // (клавиша Delete, в т.ч. по выделению). Сравниваем старую и новую строку
      // поячеечно: изменённые ячейки — новые объекты, остальные — те же ссылки.
      const changes: PartialEntryItem[] = []
      const undoCells: UndoEntry["cells"] = []
      for (const op of operations) {
        if (op.type !== "UPDATE" && op.type !== "DELETE") continue
        for (let i = op.fromRowIndex; i <= op.toRowIndex; i++) {
          const newRow = newRows[i]
          const oldRow = prev[i]
          if (!newRow || !oldRow || newRow === oldRow) continue
          for (const date of dayDates) {
            const nc = newRow.cells?.[date]
            const oc = oldRow.cells?.[date]
            if (nc === oc) continue
            if ((nc?.manual?.shift_type_code ?? null) !== (oc?.manual?.shift_type_code ?? null)) {
              // Запоминаем предыдущее значение для отмены
              undoCells.push({
                employee_id: oldRow.id,
                work_date: date,
                shift_type_code: oc?.manual?.shift_type_code ?? null,
                planned_hours_override: oc?.manual?.planned_hours_override ?? null,
              })
              changes.push({
                employee_id: newRow.id,
                work_date: date,
                shift_type_code: nc?.manual?.shift_type_code ?? null,
                planned_hours_override: nc?.manual?.planned_hours_override ?? null,
              })
            }
          }
        }
      }
      // Одна операция (включая массовую) — одна запись в истории
      if (undoCells.length > 0) {
        undoStackRef.current.push({ cells: undoCells })
        if (undoStackRef.current.length > UNDO_STACK_MAX) {
          undoStackRef.current.shift()
        }
      }
      void persistCells(changes)
    },
    [dayDates, persistCells]
  )

  // Колонки дней (28–31)
  const columns = useMemo<Column<TimesheetEmployeeRow, DayColumnData, string>[]>(
    () =>
      dayDates.map((date) => {
        const dt = new Date(`${date}T00:00:00`)
        const day = dt.getDate()
        const dow = dt.getDay()
        const isWeekend = dow === 0 || dow === 6
        const holiday = holidayByDate[date]
        const isHoliday = !!holiday

        const columnData: DayColumnData = {
          date,
          day,
          dowShort: DOW_SHORT[dow],
          isWeekend,
          isHoliday,
          holidayName: holiday?.name ?? null,
          viewMode,
          shiftTypeMap,
        }

        return {
          id: `day_${date}`,
          title: (
            <div
              className={`flex flex-col items-center justify-center leading-none h-full ${
                isHoliday ? "text-red-900" : "text-muted-foreground"
              }`}
              title={holiday?.name ?? date}
            >
              <span className="text-[10px]">{DOW_SHORT[dow]}</span>
              <span className={`text-xs ${isHoliday ? "font-bold" : "font-medium"}`}>{day}</span>
            </div>
          ),
          component: TimesheetDayCell,
          basis: 44,
          grow: 0,
          shrink: 0,
          minWidth: 44,
          columnData,
          headerClassName: isHoliday
            ? "!bg-red-100 !border-red-300"
            : isWeekend
            ? "!bg-slate-100 !border-slate-300"
            : "",
          // Delete: сброс ручного значения → ячейка возвращается к авто
          deleteValue: ({ rowData }) => ({
            ...rowData,
            cells: {
              ...rowData.cells,
              [date]: {
                auto: rowData.cells?.[date]?.auto ?? null,
                manual: null,
                result: rowData.cells?.[date]?.auto?.shift_type_code ?? null,
                conflict: rowData.cells?.[date]?.conflict ?? false,
                order_changed: false,
              },
            },
          }),
          copyValue: ({ rowData }) => rowData.cells?.[date]?.manual?.shift_type_code ?? rowData.cells?.[date]?.result ?? "",
          pasteValue: ({ rowData, value }) => {
            const code = value.trim()
            const matched =
              code &&
              Object.keys(shiftTypeMap).find((c) => c.toLowerCase() === code.toLowerCase())
            if (!matched) return rowData
            return {
              ...rowData,
              cells: {
                ...rowData.cells,
                [date]: {
                  auto: rowData.cells?.[date]?.auto ?? null,
                  manual: { shift_type_code: matched, planned_hours_override: null, note: null },
                  result: matched,
                  conflict: rowData.cells?.[date]?.conflict ?? false,
                  order_changed: false,
                },
              },
            }
          },
          isCellEmpty: ({ rowData }) => !rowData.cells?.[date]?.result,
        }
      }),
    [dayDates, holidayByDate, viewMode, shiftTypeMap]
  )

  // Подсветка выходных/праздников на уровне ячеек сетки
  const cellClassName = useCallback(
    ({ columnId }: { rowData: unknown; rowIndex: number; columnId?: string }) => {
      if (!columnId?.startsWith("day_")) return undefined
      const date = columnId.slice(4)
      const dt = new Date(`${date}T00:00:00`)
      const dow = dt.getDay()
      if (holidayByDate[date]) return "!bg-red-100/80 !border-red-300"
      if (dow === 0 || dow === 6) return "!bg-slate-100 !border-slate-300"
      return undefined
    },
    [holidayByDate]
  )

  const rowKey = useCallback(({ rowData }: { rowData: TimesheetEmployeeRow }) => String(rowData.id), [])

  // Количество ячеек в выделении (панель массового заполнения показывается при >1)
  const selectionCellCount = selection
    ? (selection.max.row - selection.min.row + 1) * (selection.max.col - selection.min.col + 1)
    : 0

  // Дни с пометкой «приказ изменился» по сотрудникам (#27)
  const orderChangedByEmployee = useMemo(() => {
    const map: Record<number, number> = {}
    for (const row of rows) {
      let count = 0
      for (const date of dayDates) {
        if (row.cells?.[date]?.order_changed) count++
      }
      if (count > 0) map[row.id] = count
    }
    return map
  }, [rows, dayDates])

  const orderChangedTotal = useMemo(
    () => Object.values(orderChangedByEmployee).reduce((sum, n) => sum + n, 0),
    [orderChangedByEmployee]
  )

  return (
    <div
      data-testid="timesheet-grid"
      className="border rounded-lg bg-card overflow-hidden flex"
    >
      {/* Левая sticky-панель с сотрудниками */}
      <div
        className="flex-none border-r overflow-hidden select-none"
        style={{ width: PANEL_WIDTH }}
      >
        <div ref={leftPanelRef} className="h-full overflow-hidden">
          <div
            className="sticky top-0 z-10 flex items-center border-b px-2 bg-background font-medium text-xs text-muted-foreground"
            style={{ height: HEADER_HEIGHT }}
          >
            {onToggleSort ? (
              <button
                type="button"
                onClick={() => onToggleSort(sortField)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <span>Сотрудник</span>
                {sortDirection === "asc" ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : sortDirection === "desc" ? (
                  <ArrowDown className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />
                )}
              </button>
            ) : (
              <span>Сотрудник</span>
            )}
          </div>
          {rows.map((emp) => {
            const changedDays = orderChangedByEmployee[emp.id] ?? 0
            return (
              <div
                key={emp.id}
                className="flex items-center gap-1 border-b px-2 overflow-hidden hover:bg-muted/30"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className="text-sm truncate leading-tight">{emp.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate leading-tight">
                    {emp.tab_number != null ? `Таб. № ${emp.tab_number}` : ""}
                    {emp.department_name ? ` · ${emp.department_name}` : ""}
                  </span>
                </div>
                {changedDays > 0 && (
                  <button
                    type="button"
                    data-testid="accept-orders-employee"
                    data-employee-id={emp.id}
                    onClick={() => acceptOrders(emp.id)}
                    className="flex-none inline-flex items-center justify-center w-6 h-6 rounded text-violet-600 hover:bg-violet-100 hover:text-violet-800 transition-colors cursor-pointer"
                    title={`Приказ изменился (${changedDays} дн.) — принять приказ`}
                  >
                    <FileCheck2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Сетка дней */}
      <div ref={containerRef} className="relative flex-1 min-w-0">
        <DataSheetGrid<TimesheetEmployeeRow>
          ref={gridRef}
          value={rows}
          columns={columns}
          onChange={handleChange}
          onActiveCellChange={handleActiveCellChange}
          onSelectionChange={handleSelectionChange}
          rowKey={rowKey}
          lockRows
          addRowsComponent={false}
          disableContextMenu
          rowHeight={ROW_HEIGHT}
          headerRowHeight={HEADER_HEIGHT}
          height={gridHeight}
          onScroll={handleScroll}
          cellClassName={cellClassName}
          className="!border-0 !h-full"
        />

        {/* Плавающая панель массового заполнения выделения.
            stopPropagation не даёт документ-обработчикам сетки снять выделение
            при клике по панели (библиотека слушает mousedown/keydown на document). */}
        {selectionCellCount > 1 && (
          <div
            data-testid="timesheet-fill-toolbar"
            className="absolute z-30 flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 shadow-md"
            style={{ top: HEADER_HEIGHT + 8, left: 12 }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Выделено: {selectionCellCount}
            </span>
            <select
              data-testid="timesheet-fill-select"
              className="h-7 max-w-[190px] text-xs rounded-md border border-input bg-background px-2 outline-none cursor-pointer"
              value=""
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                fillSelection(v === "__auto__" ? null : v)
                // Возвращаем фокус сетке, чтобы Delete/стрелки снова доходили до
                // документ-обработчиков библиотеки (панель их stopPropagation'ит).
                e.currentTarget.blur()
              }}
            >
              <option value="" disabled>
                Заполнить…
              </option>
              <option value="__auto__">— авто —</option>
              <optgroup label="Смены">
                {SHIFT_TYPE_CATALOG.filter((s) => s.isWorking).map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Статусы">
                {SHIFT_TYPE_CATALOG.filter((s) => !s.isWorking && s.code !== "off").map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.letter ?? s.code} · {s.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              Delete — сбросить
            </span>
          </div>
        )}

        {/* Плавающая панель «принять приказ» (#27): видна, пока есть ячейки с
            order_changed — сбрасывает все помеченные дни к авто-слою приказа */}
        {orderChangedTotal > 0 && (
          <div
            data-testid="accept-orders-toolbar"
            className="absolute z-30 flex items-center gap-2 rounded-full border border-violet-300 bg-background px-3 py-1.5 shadow-md"
            style={{ top: HEADER_HEIGHT + 8, right: 12 }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-violet-700 whitespace-nowrap">
              Приказ изменился: {orderChangedTotal}
            </span>
            <button
              type="button"
              data-testid="accept-orders-global"
              onClick={() => acceptOrders()}
              className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 transition-colors cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Принять приказы
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
