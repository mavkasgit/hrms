import type { CellProps } from "react-datasheet-grid"
import type {
  TimesheetEmployeeRow,
  TimesheetPlanCell,
  TimesheetFactCell,
  TimesheetCellDay,
  TimesheetAbsence,
} from "@/entities/timesheet"
import { SHIFT_TYPE_CATALOG } from "@/shared/config/shiftTypes"
import type { DayColumnData, ShiftTypeMap } from "./types"

/** Буквенные обозначения нерабочих типов смен */
export const NON_WORKING_LABELS: Record<string, string> = {
  vacation: "О",
  sick: "Б",
  A: "А",
  absence: "П",
  D: "Д",
  VK: "ВК",
  VS: "ВС",
}

export function formatHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return ""
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

export interface CellDisplay {
  label: string
  /** Tailwind-классы фона/рамки (например, при расхождении плана и факта) */
  color: string
  /** Цвет типа смены для подложки (hex) */
  stColor: string
  isNight: boolean
  tooltip: string
}

/**
 * Портированная логика cellStatus() из старого TimesheetPage —
 * вычисляет подпись, фон и подсказку ячейки для совмещённого режима.
 */
export function computeCellDisplay(
  planCell: TimesheetPlanCell | undefined,
  factCell: TimesheetFactCell | undefined,
  absences: TimesheetAbsence[],
  shiftTypeMap: ShiftTypeMap,
  dateStr: string,
  cellDay?: TimesheetCellDay | null
): CellDisplay {
  const activeAbsences = absences.filter(
    (a) => dateStr >= a.start_date && dateStr <= a.end_date
  )

  if (activeAbsences.length > 0) {
    const a = activeAbsences[0]
    // Подпись берём из итогового слоя (result = ручное, иначе авто),
    // чтобы конфликтный день показывал больничный, а не первый в списке отпуск.
    const resultCode = cellDay?.result ?? null
    const resultSt = resultCode ? shiftTypeMap[resultCode] : undefined
    let label =
      resultSt?.letter ??
      NON_WORKING_LABELS[resultCode ?? ""] ??
      (a.type === "vacation"
        ? a.vacation_type === "Отпуск за свой счет"
          ? "А"
          : "О"
        : "Б")
    let tooltip = "Больничный"

    if (a.type === "vacation") {
      const isUnpaid = a.vacation_type === "Отпуск за свой счет"
      tooltip = isUnpaid ? "Отпуск за свой счет" : "Отпуск"
    }

    // Ручной слой перекрывает авто — показываем ручной результат
    if (cellDay?.manual?.shift_type_code && cellDay.result !== cellDay.auto?.shift_type_code) {
      const manualCode = cellDay.manual.shift_type_code
      const st = shiftTypeMap[manualCode]
      tooltip = `${tooltip} (авто), вручную: ${st?.name ?? manualCode}`
      const factHours = factCell ? (factCell.work_hours ?? factCell.presence_hours ?? 0) : 0
      if (factHours > 0) {
        return {
          label: formatHours(factHours),
          color: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 ring-2 ring-amber-400 ring-inset",
          stColor: "",
          isNight: false,
          tooltip: `${tooltip} · факт ${formatHours(factHours)}ч`,
        }
      }
      // Рабочая смена поверх отсутствия — показываем часы по итогу (ручное значение)
      if (st?.is_working) {
        const hours = cellDay.manual.planned_hours_override ?? st.planned_hours ?? 0
        return {
          label: formatHours(hours),
          color: "bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 ring-1 ring-amber-400 ring-inset",
          stColor: st.color,
          isNight: st.is_night,
          tooltip,
        }
      }
      const manualLabel = st?.letter ?? NON_WORKING_LABELS[manualCode] ?? manualCode[0] ?? "?"
      return {
        label: manualLabel,
        color: "bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 ring-1 ring-amber-400 ring-inset",
        stColor: "",
        isNight: false,
        tooltip,
      }
    }

    // Индикатор конфликта: показываем оба значения, итог — больничный как предположение
    if (cellDay?.conflict) {
      tooltip += " (конфликт: отпуск и больничный; итог — больничный, предположение)"
    }

    const factHours = factCell ? (factCell.work_hours ?? factCell.presence_hours ?? 0) : 0
    if (factHours > 0) {
      return {
        label: formatHours(factHours),
        color: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 ring-2 ring-amber-400 ring-inset",
        stColor: "",
        isNight: false,
        tooltip: `${tooltip} (по факту отработано ${formatHours(factHours)}ч)`,
      }
    }
    return { label, color: "", stColor: "", isNight: false, tooltip }
  }

  const isPlanNight = !!(
    planCell?.shift_type_code &&
    shiftTypeMap[planCell.shift_type_code] &&
    shiftTypeMap[planCell.shift_type_code].is_night
  )
  const isFactNight = !!(factCell && factCell.night_hours && factCell.night_hours > 0)
  const isNight = isPlanNight || isFactNight

  let planHours = 0
  let planCode: string | null = null
  if (planCell) {
    if (planCell.shift_type_code) {
      planCode = planCell.shift_type_code
    }
    if (planCell.planned_hours_override !== null) {
      planHours = planCell.planned_hours_override
    } else if (planCode && shiftTypeMap[planCode]) {
      planHours = shiftTypeMap[planCode].planned_hours ?? 0
    }
  }

  const hasFact = factCell !== undefined
  const factHours = factCell ? (factCell.work_hours ?? factCell.presence_hours ?? 0) : 0

  // Подсказка: показываем авто-слой, если ручной отличается
  let autoSuffix = ""
  if (cellDay?.auto && cellDay.manual?.shift_type_code && cellDay.auto.shift_type_code !== cellDay.manual.shift_type_code) {
    const autoSt = shiftTypeMap[cellDay.auto.shift_type_code]
    autoSuffix = ` | Авто: ${autoSt?.name ?? cellDay.auto.shift_type_code}`
  }

  if (!hasFact) {
    let label = ""
    let stColor = ""

    if (planCode) {
      const st = shiftTypeMap[planCode]
      if (NON_WORKING_LABELS[planCode]) {
        label = NON_WORKING_LABELS[planCode]
      } else if (planHours > 0) {
        label = formatHours(planHours)
        if (st?.is_working) {
          stColor = st.color
        }
      }
    } else if (planHours > 0) {
      label = formatHours(planHours)
    }

    return {
      label,
      color: "",
      stColor,
      isNight,
      tooltip: `План: ${planHours}ч (нет факта)${autoSuffix}`,
    }
  }

  const isPlanNonWorking = planCode && NON_WORKING_LABELS[planCode]

  if (isPlanNonWorking) {
    if (factHours === 0) {
      const st = shiftTypeMap[planCode!]
      return {
        label: NON_WORKING_LABELS[planCode!],
        color: "",
        stColor: "",
        isNight: false,
        tooltip: `План: ${st?.name ?? planCode}, Факт: 0ч${autoSuffix}`,
      }
    }
    return {
      label: formatHours(factHours),
      color: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 ring-2 ring-amber-400 ring-inset",
      stColor: "",
      isNight: false,
      tooltip: `Расхождение: План ${planHours}ч (${shiftTypeMap[planCode!]?.name ?? planCode}), Факт ${factHours}ч${autoSuffix}`,
    }
  }

  if (planHours !== factHours) {
    return {
      label: formatHours(factHours),
      color: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 ring-1 ring-amber-300 ring-inset",
      stColor: "",
      isNight,
      tooltip: `Расхождение: План ${planHours}ч, Факт ${factHours}ч${autoSuffix}`,
    }
  }

  let stColor = ""
  if (planCode && shiftTypeMap[planCode]) {
    const st = shiftTypeMap[planCode]
    if (st.is_working) {
      stColor = st.color
    }
  }
  if (!stColor && isNight && shiftTypeMap["night"]) {
    stColor = shiftTypeMap["night"].color
  }

  return {
    label: factHours > 0 ? formatHours(factHours) : "",
    color: "",
    stColor,
    isNight,
    tooltip: `План ${planHours}ч, Факт ${factHours}ч${autoSuffix}`,
  }
}

export type TimesheetDayCellProps = CellProps<TimesheetEmployeeRow, DayColumnData>

/**
 * Кастомная ячейка дня табеля.
 * В режиме просмотра показывает букву/часы, при active && focus — inline-редактор.
 */
export function TimesheetDayCell({
  rowData,
  active,
  focus,
  columnData,
  setRowData,
  stopEditing,
}: TimesheetDayCellProps) {
  const { date } = columnData
  const plan = rowData.plan[date]
  const fact = rowData.fact[date]
  const cellDay = rowData.cells?.[date] ?? null

  // Inline-редактор: select со списком смен
  if (active && focus) {
    const currentCode = cellDay?.manual?.shift_type_code ?? ""
    const working = SHIFT_TYPE_CATALOG.filter((s) => s.isWorking)
    const nonWorking = SHIFT_TYPE_CATALOG.filter((s) => !s.isWorking && s.code !== "off")
    return (
      <select
        autoFocus
        className="w-full h-full text-[10px] border-primary bg-background px-0.5 outline-none cursor-pointer"
        value={currentCode}
        onChange={(e) => {
          const code = e.target.value
          setRowData({
            ...rowData,
            cells: {
              ...rowData.cells,
              [date]: {
                auto: cellDay?.auto ?? null,
                manual: code
                  ? { shift_type_code: code, planned_hours_override: null, note: null }
                  : null,
                result: code || cellDay?.auto?.shift_type_code || null,
                conflict: cellDay?.conflict ?? false,
                // Ручная правка «подтверждает» приказ — флаг снимается
                order_changed: false,
              },
            },
          })
          stopEditing()
        }}
        onBlur={() => stopEditing()}
        onKeyDown={(e) => {
          if (e.key === "Escape") stopEditing()
        }}
      >
        <option value="">— авто —</option>
        <optgroup label="Смены">
          {working.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Статусы">
          {nonWorking.map((s) => (
            <option key={s.code} value={s.code}>
              {s.letter ?? s.code} · {s.name}
            </option>
          ))}
        </optgroup>
      </select>
    )
  }

  // Режим просмотра
  const viewMode = columnData.viewMode
  let label = ""
  let stColor = ""
  let color = ""
  let tooltip = date

  if (viewMode === "plan") {
    if (plan) {
      if (plan.planned_hours_override !== null) {
        label = String(plan.planned_hours_override)
      } else if (plan.shift_type_code) {
        const st = columnData.shiftTypeMap[plan.shift_type_code]
        label = st?.letter ?? NON_WORKING_LABELS[plan.shift_type_code] ?? plan.shift_type_code[0] ?? ""
        const isShiftNight = st?.is_night ?? false
        if (isShiftNight && st && !columnData.isHoliday && !columnData.isWeekend) {
          stColor = st.color
        }
      }
    }
    tooltip = plan?.shift_type_code
      ? `${date} · Смена: ${columnData.shiftTypeMap[plan.shift_type_code]?.name ?? plan.shift_type_code}${plan.note ? `\n${plan.note}` : ""}`
      : date
  } else if (viewMode === "fact") {
    const hours = fact?.work_hours || fact?.presence_hours
    label = hours ? formatHours(hours) : ""
    const isFactNight = !!(fact && fact.night_hours && fact.night_hours > 0)
    if (isFactNight && columnData.shiftTypeMap["night"]) {
      stColor = columnData.shiftTypeMap["night"].color
    }
    tooltip = fact ? `${date} · ${hours ?? 0}ч` : date
  } else {
    const display = computeCellDisplay(
      plan,
      fact,
      rowData.absences,
      columnData.shiftTypeMap,
      date,
      cellDay
    )
    label = display.label
    stColor = display.stColor
    color = display.color
    tooltip = display.tooltip || date
  }

  // Рамка расхождения (решение #15): ручное значение отличается от авто —
  // именно рамка, а не фон: цвет уже занят типами смен.
  // Ручное без авто (нет приказа) — не расхождение, рамки нет.
  const hasDivergence = !!(
    cellDay?.manual?.shift_type_code &&
    cellDay?.auto?.shift_type_code &&
    cellDay.manual.shift_type_code !== cellDay.auto.shift_type_code
  )
  if (hasDivergence) {
    // Фон сохраняем, но рамка всегда оранжевая — отличима от янтарной (план/факт)
    const bg = color.split(" ").filter((c) => !c.startsWith("ring-")).join(" ")
    color = `${bg} ring-2 ring-orange-500 ring-inset`.trim()
  }

  // Ручное значение отличается от авто — подсказка показывает оба значения
  if (hasDivergence) {
    const autoSt = columnData.shiftTypeMap[cellDay!.auto!.shift_type_code]
    tooltip += ` | Авто: ${autoSt?.name ?? cellDay!.auto!.shift_type_code}`
  }
  if (cellDay?.conflict) {
    tooltip += " | Конфликт (итог — больничный, предположение)"
  }

  // Пометка «приказ изменился» (#27): приказ новее ручной записи —
  // пульсирующая фиолетовая точка (отличается от оранжевой рамки расхождения)
  const hasOrderChanged = cellDay?.order_changed === true
  if (hasOrderChanged) {
    tooltip += " | Приказ изменился"
  }

  const isMerged = viewMode === "merged"
  const autoCode = cellDay?.auto?.shift_type_code ?? null
  const manualCode = cellDay?.manual?.shift_type_code ?? null
  const showAutoBadge = isMerged && !!autoCode && !!manualCode && autoCode !== manualCode
  const autoMeta = showAutoBadge ? columnData.shiftTypeMap[autoCode] : null
  const autoLetter =
    autoMeta?.letter ?? NON_WORKING_LABELS[autoCode ?? ""] ?? autoCode?.[0] ?? ""

  return (
    <div
      data-date={date}
      data-employee-id={rowData.id}
      data-divergence={hasDivergence ? "true" : undefined}
      data-order-changed={hasOrderChanged ? "true" : undefined}
      className={`relative w-full h-full flex items-center justify-center text-[11px] leading-none select-none ${color} ${
        columnData.isHoliday
          ? "text-red-900 dark:text-red-100"
          : columnData.isWeekend
          ? "text-slate-700 dark:text-slate-200"
          : ""
      }`}
      style={stColor ? { backgroundColor: `${stColor}30` } : undefined}
      title={tooltip}
    >
      {label}
      {showAutoBadge && (
        <span
          className="absolute top-0 right-0 px-0.5 text-[7px] leading-none font-bold opacity-80"
          style={{ color: autoMeta?.color ?? "#64748b" }}
          title={`Авто: ${autoMeta?.name ?? autoCode}`}
        >
          {autoLetter}
        </span>
      )}
      {isMerged && cellDay?.conflict && (
        <span
          className="absolute top-0 left-0 w-1.5 h-1.5 rounded-full bg-red-500"
          title="Конфликт: отпуск + больничный"
        />
      )}
      {hasOrderChanged && (
        <span
          className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"
          title="Приказ изменился"
        />
      )}
    </div>
  )
}
