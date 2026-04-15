export interface VacationPeriod {
  period_id: number
  year_number: number
  period_start: string
  period_end: string
  main_days: number
  additional_days: number
  total_days: number
  used_days: number
  used_days_auto: number
  used_days_manual: number
  order_ids: string | null
  remaining_days: number
}

export interface VacationPeriodAdjust {
  additional_days: number
}

export interface VacationPeriodBreakdown {
  auto: { order_id: number; days: number }[]
  manual_days: number
}
