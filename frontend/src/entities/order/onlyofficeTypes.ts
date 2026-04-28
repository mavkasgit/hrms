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
