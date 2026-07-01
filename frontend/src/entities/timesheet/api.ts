import api from "@/shared/api/axios"
import type {
  TimesheetImport,
  TimesheetImportDetail,
  TimesheetPreview,
  Timesheet,
  TimesheetGrid,
  TimesheetUnmatchedRow,
} from "./types"

export async function previewTimesheetImport(file: File): Promise<TimesheetPreview> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await api.post<TimesheetPreview>("/timesheet/imports/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function confirmTimesheetImport(
  file: File,
  unmatchedAssignments: Record<string, number> = {}
): Promise<TimesheetImport> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("unmatched_assignments", JSON.stringify(unmatchedAssignments))
  const { data } = await api.post<TimesheetImport>("/timesheet/imports/confirm", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function fetchTimesheetImports(
  page = 1,
  perPage = 20,
  periodStart?: string,
  periodEnd?: string
): Promise<{ items: TimesheetImport[]; total: number; page: number; per_page: number }> {
  const { data } = await api.get<{
    items: TimesheetImport[]
    total: number
    page: number
    per_page: number
  }>("/timesheet/imports", {
    params: {
      page,
      per_page: perPage,
      period_start: periodStart,
      period_end: periodEnd,
    },
  })
  return data
}

export async function fetchTimesheetImport(id: number): Promise<TimesheetImportDetail> {
  const { data } = await api.get<TimesheetImportDetail>(`/timesheet/imports/${id}`)
  return data
}

export async function assignUnmatchedRow(
  importId: number,
  rowId: number,
  employeeId: number
): Promise<TimesheetUnmatchedRow> {
  const { data } = await api.post<TimesheetUnmatchedRow>(
    `/timesheet/imports/${importId}/unmatched/${rowId}/assign`,
    { employee_id: employeeId }
  )
  return data
}

export async function rollbackTimesheetImport(id: number): Promise<TimesheetImport> {
  const { data } = await api.post<TimesheetImport>(`/timesheet/imports/${id}/rollback`)
  return data
}

export async function fetchTimesheet(
  periodStart: string,
  periodEnd: string,
  departmentId?: number
): Promise<Timesheet> {
  const { data } = await api.get<Timesheet>("/timesheet", {
    params: {
      period_start: periodStart,
      period_end: periodEnd,
      department_id: departmentId,
    },
  })
  return data
}

export async function fetchTimesheetGrid(
  periodStart: string,
  periodEnd: string,
  departmentId?: number
): Promise<TimesheetGrid> {
  const { data } = await api.get<TimesheetGrid>("/timesheet/grid", {
    params: {
      period_start: periodStart,
      period_end: periodEnd,
      department_id: departmentId,
    },
  })
  return data
}
