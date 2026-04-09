export interface Vacation {
  id: number
  employee_id: number
  employee_name: string
  start_date: string
  end_date: string
  vacation_type: string
  days_count: number
  comment: string | null
  created_at: string | null
  order_id: number | null
  order_number: string | null
}

export interface VacationCreate {
  employee_id: number
  start_date: string
  end_date: string
  vacation_type: string
  comment?: string | null
}

export interface VacationUpdate {
  start_date?: string
  end_date?: string
  vacation_type?: string
  comment?: string | null
}

export interface VacationBalance {
  available_days: number
  used_days: number
  remaining_days: number
  vacation_type_breakdown: Record<string, number>
}

export interface PositionVacationConfig {
  position: string
  days: number
}

export interface Holiday {
  id: number
  date: string
  name: string
  year: number
}

export interface VacationListResponse {
  items: Vacation[]
  total: number
  page: number
  per_page: number
}

export interface EmployeeVacationSummary {
  id: number
  tab_number: number | null
  name: string
  department: string
  position: string
  contract_start: string | null
  vacation_days_override: number | null
  vacation_days_correction: number | null
  additional_vacation_days: number
  total_used_days: number
  calculated_available: number | null
  remaining_days: number | null
}

export interface VacationHistoryItem {
  id: number
  order_id: number | null
  start_date: string
  end_date: string
  days_count: number
  vacation_type: string
  order_number: string | null
  comment: string | null
  is_cancelled: boolean
}

export interface YearGroup {
  year: number
  used_days: number
  available_days: number
  vacations: VacationHistoryItem[]
}

export interface EmployeeVacationHistory {
  employee_id: number
  employee_name: string
  contract_start: string | null
  vacation_days_correction: number | null
  years: YearGroup[]
}
