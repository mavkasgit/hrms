import type { TimesheetShiftType } from "@/entities/timesheet"

/** Метаданные колонки дня, передаются через columnData */
export interface DayColumnData {
  date: string
  day: number
  dowShort: string
  isWeekend: boolean
  isHoliday: boolean
  holidayName: string | null
  /** Активный режим отображения (План/Факт/Совмещённый) */
  viewMode: TimesheetViewMode
  /** Палитра типов смен для раскраски ячеек */
  shiftTypeMap: ShiftTypeMap
}

/** Обогащённый тип смены (API + локальная палитра из shared/config/shiftTypes) */
export interface ShiftTypeMapValue extends TimesheetShiftType {
  color: string
  letter: string | null
}

export type ShiftTypeMap = Record<string, ShiftTypeMapValue>

/** Режим отображения табеля */
export type TimesheetViewMode = "plan" | "fact" | "merged"

/** Поле сортировки (кнопка в шапке панели сотрудников) */
export type TimesheetSortField = "department" | "tags" | "employee"
