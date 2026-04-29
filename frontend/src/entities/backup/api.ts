import api from "@/shared/api/axios"
import type { BackupInfo, BackupPreview, BackupRestoreRequest } from "./types"

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

export function downloadBackupUrl(filename: string): string {
  return `${import.meta.env.VITE_API_URL || "/api"}/backups/${filename}/download`
}

export async function previewBackup(filename: string): Promise<BackupPreview> {
  const { data } = await api.post<BackupPreview>(`/backups/${filename}/preview`)
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
  formData.append("body", JSON.stringify(payload))
  const { data } = await api.post("/backups/upload-restore", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}
