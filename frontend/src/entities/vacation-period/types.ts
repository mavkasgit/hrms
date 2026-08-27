export interface VacationPeriodVacation {
  id: number
  vacation_type: string
  start_date: string
  end_date: string
  days_count: number
  order_id?: number | null
  order_number?: string | null
  comment?: string | null
  is_recalled?: boolean
  recall_date?: string | null
  recall_order_id?: number | null
  recall_order_number?: string | null
  original_days?: number | null
  actual_days?: number | null
}

export interface VacationPeriodTransaction {
  id: number
  vacation_id?: number | null
  order_id?: number | null
  order_number?: string | null
  days_count: number
  transaction_type: string
  source_type?: string | null
  description?: string | null
  created_at?: string | null
  created_by?: string | null
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
  transactions?: VacationPeriodTransaction[]
}

export interface VacationPeriodAdjust {
  additional_days: number
}

export interface VacationPeriodBreakdown {
  auto: { order_id: number; days: number }[]
  manual_days: number
}

export interface AdditionalDaysAdjustment {
  id: number
  employee_id: number
  effective_from: string
  old_value: number
  new_value: number
  reason?: string | null
  created_by?: string | null
  created_at?: string | null
}

export type AdditionalDaysFrom = "first" | "last" | "specific"

export interface AdditionalDaysIncreaseRequest {
  new_value: number
  from_period: AdditionalDaysFrom
  period_id?: number | null
  reason?: string | null
}

export interface AdditionalDaysIncreaseResponse {
  adjustment: AdditionalDaysAdjustment
  periods: VacationPeriod[]
}

export interface VacationPeriodBulkAdjustItem {
  period_id: number
  additional_days: number
}
