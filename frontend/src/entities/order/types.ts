export interface OrderTypeFieldSchema {
  key: string
  label: string
  type: "text" | "date" | "number" | "textarea"
  required: boolean
}

export interface OrderType {
  id: number
  code: string
  name: string
  is_active: boolean
  show_in_orders_page: boolean
  template_filename: string | null
  field_schema: OrderTypeFieldSchema[]
  filename_pattern: string | null
  letter: string | null
  template_exists: boolean
  file_size: number | null
  last_modified: string | null
  created_at: string | null
  updated_at: string | null
}

export interface OrderTypeListResponse {
  items: OrderType[]
}

export interface Order {
  id: number
  order_number: string
  order_type_id: number
  order_type_name: string
  order_type_code: string
  employee_id: number
  employee_name: string | null
  order_date: string
  created_date: string | null
  file_path: string | null
  notes: string | null
  extra_fields: Record<string, string | number>
}

export interface OrderListResponse {
  items: Order[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface OrdersQueryParams {
  page: number
  per_page: number
  sort_by?: string
  sort_order?: string
  year?: number
  order_type_code?: string
}

export interface OrderCreate {
  employee_id: number
  order_type_id: number
  order_date: string
  order_number?: string | null
  notes?: string | null
  extra_fields?: Record<string, string | number> | null
  draft_id?: string | null
}

export interface OrderTypeCreate {
  code: string
  name: string
  is_active?: boolean
  show_in_orders_page?: boolean
  template_filename?: string | null
  field_schema?: OrderTypeFieldSchema[]
  filename_pattern?: string | null
  letter?: string | null
}

export interface OrderTypeUpdate {
  name?: string
  is_active?: boolean
  show_in_orders_page?: boolean
  field_schema?: OrderTypeFieldSchema[]
  filename_pattern?: string | null
  letter?: string | null
}

export interface TemplateVariable {
  name: string
  description: string
  category: string
}

export interface TemplateVariablesResponse {
  variables: TemplateVariable[]
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

export interface OrderUpdate {
  order_number?: string | null
  order_date?: string | null
  notes?: string | null
  extra_fields?: Record<string, string | number> | null
}
