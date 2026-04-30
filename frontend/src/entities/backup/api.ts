import api from "@/shared/api/axios"
import type { BackupInfo, BackupJob, BackupPreview, BackupRestoreRequest } from "./types"

export async function fetchBackupConfig(): Promise<{ db_name: string }> {
  const { data } = await api.get<{ db_name: string }>("/backups/config")
  return data
}

export async function fetchBackups(): Promise<BackupInfo[]> {
  const { data } = await api.get<BackupInfo[]>("/backups")
  return data
}

export async function createBackup(): Promise<BackupInfo> {
  const { data } = await api.post<BackupInfo>("/backups")
  return data
}

export async function startBackupJob(): Promise<BackupJob> {
  const { data } = await api.post<BackupJob>("/backups/jobs")
  return data
}

export async function fetchBackupJob(jobId: string): Promise<BackupJob> {
  const { data } = await api.get<BackupJob>(`/backups/jobs/${jobId}`)
  return data
}

export async function fetchCurrentPreview(): Promise<BackupPreview> {
  const { data } = await api.get<BackupPreview>("/backups/current-preview")
  return data
}

export function downloadBackupUrl(filename: string): string {
  return `${import.meta.env.VITE_API_URL || "/api"}/backups/${filename}/download`
}

export async function previewBackup(filename: string): Promise<BackupPreview> {
  const { data } = await api.post<BackupPreview>(`/backups/${filename}/preview`)
  return data
}

export async function updateBackupComment(filename: string, comment: string): Promise<{ filename: string; comment: string }> {
  const { data } = await api.patch(`/backups/${filename}/comment`, { comment })
  return data
}

export async function deleteBackup(filename: string): Promise<{ status: string; filename: string }> {
  const { data } = await api.delete(`/backups/${filename}`)
  return data
}

export async function bulkDeleteBackups(filenames: string[]): Promise<{ deleted: string[]; not_found: string[] }> {
  const { data } = await api.post("/backups/bulk-delete", { filenames })
  return data
}

export async function deleteBackupsOlderThan(days: number): Promise<{ deleted: string[]; cutoff: string }> {
  const { data } = await api.post("/backups/delete-older-than", { days })
  return data
}

export async function uploadPreview(file: File): Promise<BackupPreview> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await api.post<BackupPreview>("/backups/upload-preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

export async function restoreBackup(filename: string, payload: BackupRestoreRequest): Promise<{ status: string; db_name: string; filename: string }> {
  const { data } = await api.post(`/backups/${filename}/restore`, payload)
  return data
}

export async function uploadRestore(file: File, payload: BackupRestoreRequest): Promise<{ status: string; db_name: string; filename: string }> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("confirmed_db_name", payload.db_name)
  const { data } = await api.post("/backups/upload-restore", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}
