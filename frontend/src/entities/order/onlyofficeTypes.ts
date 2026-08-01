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

/** Backend возвращает Order либо {duplicate: true}, если черновик уже закоммичен (#31). */
export type CommitOrderDraftResponse =
  | Order
  | { message: string; duplicate: true; id?: undefined; order_number?: undefined }

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

export interface DraftListItem {
  draft_id: string
  kind: "single_order" | "group_order"
  order_type_code: string | null
  order_type_name: string | null
  order_number: string | null
  order_date: string | null
  employee_id: number | null
  employee_name: string | null
  group_employee_count?: number
  created_by: string | null
  created_at: string | null
  status: string
}
