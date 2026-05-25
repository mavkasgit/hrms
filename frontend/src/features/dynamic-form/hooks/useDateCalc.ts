import { useCallback } from "react"
import { addYearsToDate, addMonthsToDate, nextDay, calcDurationYears, calcDurationMonths } from "@/shared/utils/date"

/**
 * Универсальный хук для расчёта дат.
 */
export function useDateCalc() {
  const addYears = useCallback((dateStr: string, years: number) => addYearsToDate(dateStr, years), [])
  const addMonths = useCallback((dateStr: string, months: number) => addMonthsToDate(dateStr, months), [])
  const getNextDay = useCallback((dateStr: string) => nextDay(dateStr), [])
  const durationYears = useCallback((start: string, end: string) => calcDurationYears(start, end), [])
  const durationMonths = useCallback((start: string, end: string) => calcDurationMonths(start, end), [])

  return { addYears, addMonths, getNextDay, durationYears, durationMonths }
}
