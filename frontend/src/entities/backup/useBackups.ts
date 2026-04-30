import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import * as api from "./api"

export function useBackupConfig() {
  return useQuery({
    queryKey: ["backup-config"],
    queryFn: api.fetchBackupConfig,
  })
}

export function useBackups() {
  return useQuery({
    queryKey: ["backups"],
    queryFn: api.fetchBackups,
  })
}

export function useCreateBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] })
    },
  })
}

export function useStartBackupJob() {
  return useMutation({
    mutationFn: api.startBackupJob,
  })
}

export function useBackupJob(jobId: string | null) {
  return useQuery({
    queryKey: ["backup-job", jobId],
    queryFn: () => api.fetchBackupJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: 700,
  })
}

export function useCurrentPreview() {
  return useMutation({
    mutationFn: api.fetchCurrentPreview,
  })
}

export function usePreviewBackup() {
  return useMutation({
    mutationFn: (filename: string) => api.previewBackup(filename),
  })
}

export function useUploadPreview() {
  return useMutation({
    mutationFn: (file: File) => api.uploadPreview(file),
  })
}

export function useUpdateBackupComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filename, comment }: { filename: string; comment: string }) =>
      api.updateBackupComment(filename, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] })
    },
  })
}

export function useDeleteBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filename: string) => api.deleteBackup(filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] })
    },
  })
}

export function useBulkDeleteBackups() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filenames: string[]) => api.bulkDeleteBackups(filenames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] })
    },
  })
}

export function useDeleteBackupsOlderThan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (days: number) => api.deleteBackupsOlderThan(days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] })
    },
  })
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: ({ filename, db_name }: { filename: string; db_name: string }) =>
      api.restoreBackup(filename, { db_name }),
  })
}

export function useUploadRestore() {
  return useMutation({
    mutationFn: ({ file, db_name }: { file: File; db_name: string }) =>
      api.uploadRestore(file, { db_name }),
  })
}
