export interface NotificationType {
  id: number
  code: string
  name: string
  is_active: boolean
  template_filename: string | null
  display_name: string | null
  field_schema: OrderTypeFieldSchema[]
  filename_pattern: string | null
  template_exists: boolean
  file_size: number | null
  last_modified: string | null
  created_at: string | null
  updated_at: string | null
}

export interface OrderTypeFieldSchema {
  key: string
  label: string
  type: "text" | "date" | "number" | "textarea"
  required: boolean
}

export interface Notification {
  id: number
  title: string
  number: string | null
  date: string
  employee_id: number | null
  employee_name: string | null
  notification_type_id: number | null
  notification_type_code: string | null
  notification_type_name: string | null
  content: string | null
  extra_fields: Record<string, string | number> | null
  file_path: string | null
  is_draft: boolean
  created_at: string | null
  updated_at: string | null
}

export interface NotificationListResponse {
  items: Notification[]
  total: number
}

export interface NotificationCreate {
  title: string
  number?: string
  date: string
  employee_id?: number | null
  notification_type_id?: number | null
  content?: string
  extra_fields?: Record<string, string | number> | null
}

export interface NotificationUpdate {
  title?: string
  number?: string
  date?: string
  employee_id?: number | null
  notification_type_id?: number | null
  content?: string
  extra_fields?: Record<string, string | number> | null
}
