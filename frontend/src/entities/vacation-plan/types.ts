export interface VacationPlan {
  id: number
  employee_id: number
  year: number
  month: number
  plan_count: string
  comment: string | null
  created_at: string | null
  updated_at: string | null
}

export interface VacationPlanCreate {
  employee_id: number
  year: number
  month: number
  plan_count: string
  comment?: string
}

export interface VacationPlanSummary {
  employee_id: number
  employee_name: string
  department_id: number
  months: Record<number, string | null>
  total_plan_count: string
}

export interface VacationPlanUpdate {
  plan_count?: string
  comment?: string
}
