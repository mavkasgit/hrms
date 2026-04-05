export interface Order {
  id: number
  order_number: string
  order_type: string
  employee_id: number
  employee_name: string | null
  tab_number: number | null
  order_date: string
  created_date: string | null
  file_path: string | null
  notes: string | null
}

export interface OrderListResponse {
  items: Order[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface OrderCreate {
  employee_id: number
  order_type: string
  order_date: string
  order_number?: string | null
  notes?: string | null
  extra_fields?: Record<string, string | number> | null
}

export interface TemplateInfo {
  name: string
  order_type: string
  exists: boolean
  file_size: number | null
  last_modified: string | null
}

export interface TemplateListResponse {
  templates: TemplateInfo[]
}

export interface OrderSettings {
  orders_path: string
  templates_path: string
}

export interface OrderSyncResponse {
  message: string
  deleted: number
  added: number
}
