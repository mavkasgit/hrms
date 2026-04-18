export interface VacationPeriodVacation {
  id: number
  vacation_type: string
  start_date: string
  end_date: string
  days_count: number
  order_id?: number | null
  order_number?: string | null
  comment?: string | null
  is_cancelled: boolean
}

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
  order_numbers: string | null
  remaining_days: number
  vacations?: VacationPeriodVacation[]
}

export interface VacationPeriodAdjust {
  additional_days: number
}

export interface VacationPeriodBreakdown {
  auto: { order_id: number; days: number }[]
  manual_days: number
}
