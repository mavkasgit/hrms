export type RemoteAuthMode = "guest" | "credentials"

export interface RemoteRetention {
  daily: number
  weekly: number
  monthly: number
  manual: number
}

export interface RemoteStatus {
  ok: boolean
  filename?: string
  started_at?: string
  finished_at?: string
  size?: number
  remote_path?: string
  error?: string
  deleted?: string[]
  rotation_error?: string
}

export interface RemoteBackupConfig {
  enabled: boolean
  destination: string
  auth_mode: RemoteAuthMode
  username: string
  domain: string
  bwlimit: string
  retention: RemoteRetention
  has_password: boolean
  last_status?: RemoteStatus | null
}

export interface RemoteConfigUpdate {
  enabled?: boolean
  destination?: string
  auth_mode?: RemoteAuthMode
  username?: string
  domain?: string
  bwlimit?: string
  retention?: RemoteRetention
  /** Отсутствует — не менять, пустая строка — очистить. */
  password?: string
}

export interface RemoteTestResult {
  ok: boolean
  backend: string
  destination: string
  files: number
  message: string
}

export interface BackupConfig {
  db_name: string
  auto_enabled: boolean
  time_of_day: string
  remote: RemoteBackupConfig
}

export interface BackupInfo {
  filename: string
  db_name: string
  size: number
  created_at: string
  comment: string
  backup_type?: string
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
  result?: (BackupInfo & { remote?: RemoteStatus | null }) | null
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
