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
  display_name: string | null
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
  employee_id: number | null
  employee_name: string | null
  order_date: string
  created_date: string | null
  file_path: string | null
  display_name: string | null
  notes: string | null
  extra_fields: Record<string, string | number>
  is_group: boolean
  group_employee_count?: number | null
  group_employees?: GroupEmployeeInfo[]
}

export interface GroupEmployeeInfo {
  employee_id: number
  employee_full_name: string
  position: string | null
  department: string | null
  vacation_start: string
  vacation_end: string
  vacation_days: number
}

export interface VacationUnpaidGroupEmployeeCreate {
  employee_id: number
  vacation_days: number
}

export interface VacationUnpaidGroupOrderCreate {
  order_date: string
  order_number?: string | null
  vacation_start: string
  employees: VacationUnpaidGroupEmployeeCreate[]
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
  order_letter?: string
  employee_id?: number
  date_from?: string
  date_to?: string
  order_number?: string
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

export interface OrderDeletionPreview {
  order_id: number
  order_number: string
  order_type_name: string
  employee_name: string | null
  order_date: string
  has_vacations: boolean
  vacation_count: number
  has_transactions: boolean
  transaction_count: number
  has_adjustments: boolean
  adjustment_count: number
  warnings: string[]
}
