export interface VacationPeriod {
  period_id: number
  year_number: number
  period_start: string
  period_end: string
  main_days: number
  additional_days: number
  total_days: number
  used_days: number
  remaining_days: number
}

export interface VacationPeriodAdjust {
  additional_days: number
}
