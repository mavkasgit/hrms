import type { Order } from "./types"

export interface OnlyOfficeConfig {
  document: {
    fileType: string
    key: string
    title: string
    url: string
    permissions?: Record<string, boolean>
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

export interface OrderDraftResponse {
  draft_id: string
  file_path: string
}

export type CommitOrderDraftResponse = Order

export interface GroupDraftResponse {
  draft_id: string
  edit_url: string
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
