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
