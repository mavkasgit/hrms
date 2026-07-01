export interface WorkScheduleEntry {
  id: number
  schedule_id: number
  work_date: string
  shift_type_code: string | null
  planned_hours_override: number | null
  note: string | null
}

export interface WorkScheduleEntryCreate {
  work_date: string
  shift_type_code?: string | null
  planned_hours_override?: number | null
  note?: string | null
}

export interface WorkSchedule {
  id: number
  employee_id: number
  year: number
  month: number
  comment: string | null
  is_approved: boolean
  approved_by: string | null
  approved_at: string | null
  created_at: string | null
  created_by: string | null
  updated_at: string | null
  updated_by: string | null
  entries: WorkScheduleEntry[]
}

export interface WorkScheduleCreate {
  employee_id: number
  year: number
  month: number
  comment?: string | null
}

export interface WorkScheduleUpdate {
  comment?: string | null
  is_approved?: boolean
}

export interface BulkSetEntriesRequest {
  entries: WorkScheduleEntryCreate[]
}
