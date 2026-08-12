import type { Order } from "./types"
import type { DraftSaveStatus } from "@/shared/api/onlyoffice-types"

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
  save_status: DraftSaveStatus
  file_name: string | null
  file_path: string | null
}
