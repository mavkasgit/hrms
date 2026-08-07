import type { DraftSaveStatus } from "@/entities/order/onlyofficeTypes"

export type AllDraftKind = "order" | "notification" | "statement"

export interface AllDraftItem {
  draft_id: string
  kind: AllDraftKind
  title: string | null
  type_name: string | null
  number: string | null
  date: string | null
  created_at: string | null
  save_status: DraftSaveStatus | null
  view_url: string
  edit_url: string
  list_url: string
  group_employees: { employee_id: number; employee_full_name: string }[] | null
}
