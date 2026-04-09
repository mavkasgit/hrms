export interface VacationPlan {
  id: number
  employee_id: number
  year: number
  month: number
  days: number
  comment: string | null
  created_at: string | null
  updated_at: string | null
}

export interface VacationPlanCreate {
  employee_id: number
  year: number
  month: number
  days: number
  comment?: string
}

export interface VacationPlanSummary {
  employee_id: number
  employee_name: string
  department: string
  months: Record<number, number | null>
  total_days: number
}

export interface VacationPlanUpdate {
  days?: number
  comment?: string
}
