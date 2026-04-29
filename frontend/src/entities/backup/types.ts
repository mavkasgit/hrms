export interface BackupInfo {
  filename: string
  db_name: string
  size: number
  created_at: string
}

export interface BackupPreview {
  source_db: string
  backup_timestamp: string | null
  tables: Record<string, number>
}

export interface BackupRestoreRequest {
  db_name: string
}
