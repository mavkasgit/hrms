/**
 * Общие wire-типы OnlyOffice-протокола, используемые всеми документными
 * сущностями (order/draft/notification/statement/document). Вынесены из
 * entities/order/onlyofficeTypes (#112), чтобы сущности не зависели от
 * order-домена только ради типа.
 */

/** Поле данных формы для предзаполнения документа (тот же формат у /drafts/{id}/form-data). */
export interface FormDataField {
  key: string
  value: string
}

export interface OnlyOfficeConfig {
  document: {
    fileType: string
    key: string
    title: string
    url: string
    permissions?: Record<string, boolean>
    data?: FormDataField[]
  }
  documentType: "word"
  editorConfig: {
    callbackUrl: string
    lang: string
    mode: "edit" | "view"
    customization?: Record<string, unknown>
  }
  height: string
  token: string
  width: string
  documentServerUrl: string
}

export type OnlyOfficeForceSaveMessage = "save_requested" | "no_changes"

export interface OnlyOfficeForceSaveResponse {
  message: OnlyOfficeForceSaveMessage
  save_id: string | null
  command_error: number | null
}

export type OnlyOfficeSaveState = "pending" | "persisted" | "failed" | "no_changes" | "unknown"

export interface OnlyOfficeSaveStatusResponse {
  save_id: string
  state: OnlyOfficeSaveState
  oo_status: number | null
  file_mtime: number | null
  error: string | null
}

export type DraftSaveState = "saved" | "error" | "never"

export interface DraftSaveStatus {
  state: DraftSaveState
  last_saved_at: string | null
  last_error: string | null
  last_error_at: string | null
}
