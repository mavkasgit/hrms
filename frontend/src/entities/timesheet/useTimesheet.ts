import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  previewTimesheetImport,
  confirmTimesheetImport,
  fetchTimesheetImports,
  fetchTimesheetImport,
  assignUnmatchedRow,
  rollbackTimesheetImport,
  fetchTimesheet,
  fetchTimesheetGrid,
} from "./api"

export function useTimesheetImports(
  page = 1,
  perPage = 20,
  periodStart?: string,
  periodEnd?: string
) {
  return useQuery({
    queryKey: ["timesheet-imports", page, perPage, periodStart, periodEnd],
    queryFn: () => fetchTimesheetImports(page, perPage, periodStart, periodEnd),
  })
}

export function useTimesheetImport(id: number | null) {
  return useQuery({
    queryKey: ["timesheet-import", id],
    queryFn: () => fetchTimesheetImport(id!),
    enabled: !!id,
  })
}

export function useTimesheet(periodStart: string, periodEnd: string, departmentId?: number) {
  return useQuery({
    queryKey: ["timesheet", periodStart, periodEnd, departmentId],
    queryFn: () => fetchTimesheet(periodStart, periodEnd, departmentId),
  })
}

export function useTimesheetGrid(
  periodStart: string,
  periodEnd: string,
  departmentId?: number
) {
  return useQuery({
    queryKey: ["timesheet-grid", periodStart, periodEnd, departmentId],
    queryFn: () => fetchTimesheetGrid(periodStart, periodEnd, departmentId),
    staleTime: 1000 * 30,
  })
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (file: File) => previewTimesheetImport(file),
  })
}

export function useConfirmImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, assignments }: { file: File; assignments: Record<string, number> }) =>
      confirmTimesheetImport(file, assignments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet-imports"] })
      qc.invalidateQueries({ queryKey: ["timesheet"] })
    },
  })
}

export function useAssignUnmatchedRow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      importId,
      rowId,
      employeeId,
    }: {
      importId: number
      rowId: number
      employeeId: number
    }) => assignUnmatchedRow(importId, rowId, employeeId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["timesheet-import", variables.importId] })
      qc.invalidateQueries({ queryKey: ["timesheet-imports"] })
    },
  })
}

export function useRollbackImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => rollbackTimesheetImport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timesheet-imports"] })
      qc.invalidateQueries({ queryKey: ["timesheet"] })
    },
  })
}
