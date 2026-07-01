import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchWorkSchedules,
  fetchWorkSchedule,
  createWorkSchedule,
  updateWorkSchedule,
  approveWorkSchedule,
  unapproveWorkSchedule,
  deleteWorkSchedule,
  setWorkScheduleEntry,
  bulkSetEntries,
  deleteWorkScheduleEntry,
} from "./api"
import type { WorkScheduleCreate, WorkScheduleUpdate, BulkSetEntriesRequest } from "./types"

export function useWorkSchedules(year: number, month: number, employeeId?: number) {
  return useQuery({
    queryKey: ["work-schedules", year, month, employeeId],
    queryFn: () => fetchWorkSchedules(year, month, employeeId, true),
  })
}

export function useWorkSchedule(id: number | null) {
  return useQuery({
    queryKey: ["work-schedule", id],
    queryFn: () => fetchWorkSchedule(id!),
    enabled: !!id,
  })
}

export function useCreateWorkSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: WorkScheduleCreate) => createWorkSchedule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
    },
  })
}

export function useUpdateWorkSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkScheduleUpdate }) =>
      updateWorkSchedule(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
      qc.invalidateQueries({ queryKey: ["work-schedule", variables.id] })
    },
  })
}

export function useApproveWorkSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => approveWorkSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
    },
  })
}

export function useUnapproveWorkSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => unapproveWorkSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
    },
  })
}

export function useDeleteWorkSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteWorkSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
    },
  })
}

export function useBulkSetEntries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, payload }: { scheduleId: number; payload: BulkSetEntriesRequest }) =>
      bulkSetEntries(scheduleId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
      qc.invalidateQueries({ queryKey: ["work-schedule", variables.scheduleId] })
    },
  })
}

export function useSetWorkScheduleEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, payload }: { scheduleId: number; payload: { work_date: string; shift_type_code?: string | null; planned_hours_override?: number | null; note?: string | null } }) =>
      setWorkScheduleEntry(scheduleId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["work-schedule", variables.scheduleId] })
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
    },
  })
}

export function useDeleteWorkScheduleEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, entryId }: { scheduleId: number; entryId: number }) =>
      deleteWorkScheduleEntry(scheduleId, entryId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["work-schedule", variables.scheduleId] })
      qc.invalidateQueries({ queryKey: ["work-schedules"] })
    },
  })
}
