export interface TimesheetFilter {
  id: string
  name: string
  departments: string[]
  tags: string[]
  createdAt: string
}

export const TIMESHEET_FILTERS_STORAGE_KEY = "hrms.timesheet.filters.v1"
export const TIMESHEET_ACTIVE_FILTER_ID_KEY = "hrms.timesheet.active_filter_id"
