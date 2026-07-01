/**
 * Справочник типов смен.
 *
 * Источник истины для UI — фронт мапит code → (label, color, icon) локально.
 * Бэкенд хранит только `shift_type_code VARCHAR(20)`, см. backend/app/core/shift_types.py.
 *
 * Синхронизация при изменении: правки в обоих файлах в одном коммите.
 */
import type { LucideIcon } from "lucide-react"
import {
  Coffee,
  Moon,
  Palmtree,
  Stethoscope,
  Sun,
  Sunset,
  XCircle,
  Heart,
  Shield,
} from "lucide-react"

export interface ShiftTypeMeta {
  code: string
  name: string
  startTime: string | null
  endTime: string | null
  plannedHours: number
  isWorking: boolean
  isNight: boolean
  color: string
  icon: LucideIcon
  sortOrder: number
}

export const SHIFT_TYPE_CATALOG: ShiftTypeMeta[] = [
  { code: "day",       name: "День (08:00-16:30)",      startTime: "08:00", endTime: "16:30", plannedHours: 8,  isWorking: true,  isNight: false, color: "#10b981", icon: Sun,        sortOrder: 10 },
  { code: "day_long",  name: "День 12ч (08:00-20:00)",  startTime: "08:00", endTime: "20:00", plannedHours: 12, isWorking: true,  isNight: false, color: "#22c55e", icon: Sun,        sortOrder: 20 },
  { code: "night",     name: "Ночь 12ч (20:00-08:00)",  startTime: "20:00", endTime: "08:00", plannedHours: 12, isWorking: true,  isNight: true,  color: "#1e3a8a", icon: Moon,       sortOrder: 30 },
  { code: "evening",   name: "Вечер (14:00-22:00)",     startTime: "14:00", endTime: "22:00", plannedHours: 8,  isWorking: true,  isNight: false, color: "#f59e0b", icon: Sunset,     sortOrder: 60 },
  { code: "off",       name: "Выходной",                startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#9ca3af", icon: Coffee,     sortOrder: 100 },
  { code: "vacation",  name: "Отпуск",                  startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#3b82f6", icon: Palmtree,   sortOrder: 110 },
  { code: "sick",      name: "Больничный",              startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#ef4444", icon: Stethoscope,sortOrder: 120 },
  { code: "A",         name: "За свой счет",            startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#a855f7", icon: Coffee,     sortOrder: 125 },
  { code: "D",         name: "Донорские",               startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#14b8a6", icon: Heart,       sortOrder: 135 },
  { code: "absence",   name: "Прогул / Неявка",         startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#dc2626", icon: XCircle,    sortOrder: 140 },
  { code: "VK",        name: "Военкомат",               startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#059669", icon: Shield,      sortOrder: 145 },
  { code: "VS",        name: "Военные сборы",           startTime: null,    endTime: null,    plannedHours: 0,  isWorking: false, isNight: false, color: "#047857", icon: Shield,      sortOrder: 150 },
]

const BY_CODE: Record<string, ShiftTypeMeta> = Object.fromEntries(
  SHIFT_TYPE_CATALOG.map((s) => [s.code, s])
)

export function getShiftTypeMeta(code: string | null | undefined): ShiftTypeMeta | null {
  if (!code) return null
  return BY_CODE[code] ?? null
}
