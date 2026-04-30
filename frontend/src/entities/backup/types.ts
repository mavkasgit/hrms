export interface BackupInfo {
  filename: string
  db_name: string
  size: number
  created_at: string
  comment: string
  format?: string
}

export interface BackupJob {
  job_id: string
  status: "running" | "completed" | "failed"
  stage: string
  message: string
  progress: number
  created_at: string
  updated_at: string
  result?: BackupInfo | null
  error?: string | null
  files_done?: number
  files_total?: number
  tables_done?: number
  tables_total?: number
}

export interface BackupPreview {
  source_db: string
  backup_timestamp: string | null
  tables: Record<string, number>
  storage?: Record<string, {
    files: number
    bytes: number
    directories?: number
    folders?: Array<{ path: string; files: number; bytes: number }>
  }>
  table_exports?: {
    format: string
    path: string
    workbook_path?: string
    tables: Array<{ table: string; path: string; format: string }>
  }
  cached?: boolean
}

export interface BackupRestoreRequest {
  db_name: string
}
