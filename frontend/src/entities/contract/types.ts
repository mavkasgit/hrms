export interface ContractHistory {
  id: number
  employee_id: number
  employee_name: string | null
  employee_position: string | null
  employee_department: string | null
  order_id: number | null
  contract_number: string | null
  contract_start: string
  contract_end: string | null
  order_type_code: string
  order_number: string | null
  order_date: string | null
  created_at: string | null
}

export interface ContractHistoryListResponse {
  items: ContractHistory[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export const ORDER_TYPE_CODE_LABELS: Record<string, string> = {
  hire: "Прием на работу",
  new_contract: "Заключение нового контракта",
  contract_extension: "Продление контракта",
  transfer: "Перевод",
}
