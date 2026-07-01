export interface TimesheetUnmatchedRow {
  id: number
  import_id: number
  last_name: string | null
  first_name: string | null
  patronymic: string | null
  tab_number: string | null
  department_name: string | null
  position_name: string | null
  schedule_name: string | null
  total_hours: number | null
  notes: string | null
  matched_employee_id: number | null
}

export interface TimesheetImport {
  id: number
  file_name: string
  period_start: string
  period_end: string
  department_name: string | null
  employees_total: number
  employees_matched: number
  employees_unmatched: number
  entries_imported: number
  stored_path: string | null
  status: string
  notes: string | null
  uploaded_at: string
  uploaded_by: string | null
  rolled_back_at: string | null
  rolled_back_by: string | null
}

export interface TimesheetImportDetail extends TimesheetImport {
  unmatched_rows: TimesheetUnmatchedRow[]
}

export interface TimesheetPreviewDayRaw {
  presence: string | null
  work: string | null
  absence: string | null
  debt: string | null
  night: string | null
  overtime: string | null
}

export interface TimesheetPreviewDay {
  presence_hours: number | null
  work_hours: number | null
  absence_hours: number | null
  night_hours: number | null
  shift_type?: number | null
  raw?: TimesheetPreviewDayRaw | null
}

export interface TimesheetMatchedPreviewItem {
  parsed_index: number
  employee_id: number
  employee_name: string
  tab_number: number | null
  days_count: number
  days: Record<string, TimesheetPreviewDay>
}

export interface TimesheetUnmatchedPreviewItem {
  key: string
  last_name: string | null
  first_name: string | null
  patronymic: string | null
  tab_number: string | null
  department_name: string | null
  position_name: string | null
  schedule_name: string | null
  days_count: number
  total_presence: string | null
  reason: string
  days: Record<string, TimesheetPreviewDay>
}

export interface TimesheetPreview {
  file_name: string
  department_name: string | null
  period_start: string | null
  period_end: string | null
  employees_total: number
  employees_matched: number
  employees_unmatched: number
  matched_preview: TimesheetMatchedPreviewItem[]
  unmatched: TimesheetUnmatchedPreviewItem[]
}

export interface TimesheetPlanCell {
  shift_type_code: string | null
  planned_hours_override: number | null
  note: string | null
}

export interface TimesheetFactCell {
  presence_hours: number | null
  work_hours: number | null
  absence_hours: number | null
  debt_hours: number | null
  night_hours: number | null
  overtime_hours: number | null
  schedule_name: string | null
}

export interface TimesheetAbsence {
  type: "vacation" | "sick_leave"
  start_date: string
  end_date: string
  vacation_type?: string
}

export interface TimesheetEmployeeTag {
  id: number
  name: string
  color: string | null
}

export interface TimesheetEmployeeRow {
  id: number
  name: string
  tab_number: number | null
  department_id: number | null
  department_name: string | null
  position_id: number | null
  position_name: string | null
  tags: TimesheetEmployeeTag[]
  plan: Record<string, TimesheetPlanCell>
  fact: Record<string, TimesheetFactCell>
  absences: TimesheetAbsence[]
}

export interface Timesheet {
  period_start: string
  period_end: string
  employees: TimesheetEmployeeRow[]
}

export interface TimesheetShiftType {
  code: string
  name: string
  start_time: string | null
  end_time: string | null
  planned_hours: number
  is_working: boolean
  is_night: boolean
  sort_order: number
}

export interface TimesheetHoliday {
  id: number
  date: string
  name: string | null
  year: number
  is_working_day: boolean
}

export interface TimesheetGrid extends Timesheet {
  shift_types: TimesheetShiftType[]
  holidays: TimesheetHoliday[]
}
