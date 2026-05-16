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

export interface VacationCalendarDocument {
  id: number
  original_filename: string
  file_type: string
  uploaded_at: string
  uploaded_by: string | null
  is_current?: boolean
}

export interface VacationPlanImportResult {
  created: number
  updated: number
  not_found: {
    name: string
    position: string
    months: Record<string, string>
  }[]
  skipped_empty: string[]
  total_processed: number
  processed: {
    name: string
    position: string
    months: Record<string, string>
    is_update: boolean
  }[]
  preview_only: boolean
}
